import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let customerA: string;
let customerB: string;
let companyAdminA: string;
let companyAdminB: string;
let employeeA: string;
let admin: string;
let support: string;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  customerA = await createUser(db, '919000000001');
  customerB = await createUser(db, '919000000002');
  companyAdminA = await createUser(db);
  companyAdminB = await createUser(db);
  employeeA = await createUser(db);
  admin = await createUser(db);
  support = await createUser(db);

  await asCommit(db, customerA, (q) => q(`select public.register_role('customer')`));
  await asCommit(db, customerB, (q) => q(`select public.register_role('customer')`));
  orgA = (await asCommit(db, companyAdminA, (q) => q<{ id: string }>(`select public.create_organization('Alpha Services') as id`))).rows[0]!.id;
  orgB = (await asCommit(db, companyAdminB, (q) => q<{ id: string }>(`select public.create_organization('Beta Engineering') as id`))).rows[0]!.id;
  await grantRole(db, employeeA, 'company_technician', orgA);
  await grantRole(db, admin, 'platform_admin');
  await grantRole(db, support, 'support_agent');
});

describe('auth → profile', () => {
  it('creates a profile with a normalised +91 phone for every new auth user', async () => {
    const r = await db.query<{ phone: string }>('select phone from public.profiles where id = $1', [customerA]);
    expect(r.rows[0]?.phone).toBe('+919000000001');
  });
});

describe('profiles RLS', () => {
  it('a user sees only their own profile', async () => {
    const rows = await as(db, customerA, (q) => q<{ id: string }>('select id from public.profiles'));
    expect(rows.rows.map((r) => r.id)).toEqual([customerA]);
  });

  it('anon sees no profiles', async () => {
    await expect(as(db, null, (q) => q('select id from public.profiles'))).rejects.toThrow(/permission denied/);
  });

  it('staff can see all profiles', async () => {
    const rows = await as(db, support, (q) => q('select id from public.profiles'));
    expect(rows.rows.length).toBe(7);
  });

  it('a user can update their own name but not another user', async () => {
    await as(db, customerA, async (q) => {
      await q(`update public.profiles set full_name = 'Ravi Kumar' where id = $1`, [customerA]);
      const other = await q(`update public.profiles set full_name = 'Hacked' where id = $1`, [customerB]);
      expect(other.affectedRows).toBe(0);
      const me = await q<{ full_name: string }>('select full_name from public.profiles where id = $1', [customerA]);
      expect(me.rows[0]?.full_name).toBe('Ravi Kumar');
    });
  });

  it('a user cannot change their own account status or phone', async () => {
    await expect(
      as(db, customerA, (q) => q(`update public.profiles set account_status = 'active', status_reason = 'x' where id = $1`, [customerA])),
    ).rejects.toThrow(/ITM:status_change_forbidden/);
    await expect(
      as(db, customerA, (q) => q(`update public.profiles set phone = '+919999999999' where id = $1`, [customerA])),
    ).rejects.toThrow(/permission denied/);
  });

  it('a platform admin can suspend an account, and it is audited', async () => {
    await as(db, admin, async (q) => {
      await q(`update public.profiles set account_status = 'suspended', status_reason = 'policy' where id = $1`, [customerB]);
      const log = await q<{ action: string }>(
        `select action from public.audit_log where entity_id = $1 and action = 'profile.status_changed'`,
        [customerB],
      );
      expect(log.rows).toHaveLength(1);
    });
  });

  it('profiles cannot be deleted through the API', async () => {
    await expect(as(db, customerA, (q) => q('delete from public.profiles where id = $1', [customerA]))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('roles', () => {
  it('users can self-register only as customer or technician', async () => {
    const u = await createUser(db);
    await as(db, u, async (q) => {
      await q(`select public.register_role('technician')`);
      const roles = await q<{ role: string }>('select role from public.user_roles where user_id = $1', [u]);
      expect(roles.rows.map((r) => r.role)).toEqual(['technician']);
    });
    for (const role of ['platform_admin', 'support_agent', 'company_admin', 'company_technician']) {
      await expect(as(db, u, (q) => q(`select public.register_role($1::public.app_role)`, [role]))).rejects.toThrow(
        /ITM:role_not_self_service/,
      );
    }
  });

  it('users cannot insert roles directly', async () => {
    await expect(
      as(db, customerA, (q) => q(`insert into public.user_roles (user_id, role) values ($1, 'platform_admin')`, [customerA])),
    ).rejects.toThrow(/permission denied/);
  });

  it('only platform admins can grant staff roles', async () => {
    await expect(as(db, support, (q) => q(`select public.grant_staff_role($1, 'platform_admin')`, [customerA]))).rejects.toThrow(
      /only platform admins/,
    );
    await as(db, admin, async (q) => {
      await q(`select public.grant_staff_role($1, 'support_agent')`, [customerA]);
      await expect(q(`select public.grant_staff_role($1, 'customer')`, [customerA])).rejects.toThrow(/ITM:not_staff_role/);
    });
  });

  it('a suspended user cannot register roles or create organizations', async () => {
    const u = await createUser(db);
    await db.query(`update public.profiles set account_status = 'suspended' where id = $1`, [u]);
    await expect(as(db, u, (q) => q(`select public.register_role('customer')`))).rejects.toThrow(/ITM:account_not_active/);
    await expect(as(db, u, (q) => q(`select public.create_organization('X Corp')`))).rejects.toThrow(/ITM:account_not_active/);
  });

  it('anon cannot call any RPC', async () => {
    await expect(as(db, null, (q) => q(`select public.register_role('customer')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, null, (q) => q(`select public.get_my_context()`))).rejects.toThrow(/permission denied/);
  });
});

describe('company isolation', () => {
  it('Company A admin sees Company A members, not Company B', async () => {
    const rows = await as(db, companyAdminA, (q) =>
      q<{ user_id: string; organization_id: string }>('select user_id, organization_id from public.user_roles where organization_id is not null'),
    );
    const orgs = new Set(rows.rows.map((r) => r.organization_id));
    expect(orgs).toEqual(new Set([orgA]));
    expect(rows.rows.map((r) => r.user_id)).toContain(employeeA);
  });

  it('Company B admin cannot see Company A or its employee records', async () => {
    const orgs = await as(db, companyAdminB, (q) => q<{ id: string }>('select id from public.organizations'));
    expect(orgs.rows.map((r) => r.id)).toEqual([orgB]);
    const roles = await as(db, companyAdminB, (q) => q('select 1 from public.user_roles where organization_id = $1', [orgA]));
    expect(roles.rows).toHaveLength(0);
  });

  it('an employee sees their own org but not other members role rows', async () => {
    const orgs = await as(db, employeeA, (q) => q<{ id: string }>('select id from public.organizations'));
    expect(orgs.rows.map((r) => r.id)).toEqual([orgA]);
    const roles = await as(db, employeeA, (q) => q<{ user_id: string }>('select user_id from public.user_roles'));
    expect(new Set(roles.rows.map((r) => r.user_id))).toEqual(new Set([employeeA]));
  });

  it('Company B admin cannot rename Company A or revoke its employee', async () => {
    const r = await as(db, companyAdminB, (q) => q(`update public.organizations set name = 'Taken' where id = $1`, [orgA]));
    expect(r.affectedRows).toBe(0);
    const roleId = (await db.query<{ id: string }>('select id from public.user_roles where user_id = $1', [employeeA])).rows[0]!.id;
    await expect(as(db, companyAdminB, (q) => q('select public.revoke_role($1)', [roleId]))).rejects.toThrow(/not allowed/);
    await as(db, companyAdminA, (q) => q('select public.revoke_role($1)', [roleId])); // own company: allowed
  });

  it('company admins cannot revoke their own admin role (no orphaned company)', async () => {
    const roleId = (
      await db.query<{ id: string }>(`select id from public.user_roles where user_id = $1 and role = 'company_admin'`, [companyAdminA])
    ).rows[0]!.id;
    await expect(as(db, companyAdminA, (q) => q('select public.revoke_role($1)', [roleId]))).rejects.toThrow(/not allowed/);
  });
});

describe('legal documents and acceptance', () => {
  it('anon can read the published (non-withdrawn) documents', async () => {
    const r = await as(db, null, (q) => q('select code from public.legal_documents'));
    expect(r.rows).toHaveLength(12);
  });

  it('get_my_context lists the documents a customer must accept, then clears them on acceptance', async () => {
    await as(db, customerA, async (q) => {
      const ctx = (await q<{ c: { pending_documents: { id: string; code: string }[]; roles: { role: string }[] } }>(
        'select public.get_my_context() as c',
      )).rows[0]!.c;
      expect(ctx.roles.map((r) => r.role)).toEqual(['customer']);
      const codes = ctx.pending_documents.map((d) => d.code).sort();
      expect(codes).toContain('customer_terms');
      expect(codes).not.toContain('technician_terms');

      for (const d of ctx.pending_documents) {
        await q(`select public.accept_legal_document($1, 'web', '0.1.0')`, [d.id]);
      }
      const after = (await q<{ c: { pending_documents: unknown[] } }>('select public.get_my_context() as c')).rows[0]!.c;
      expect(after.pending_documents).toEqual([]);

      const acc = await q<{ review_status_at_acceptance: string }>('select review_status_at_acceptance from public.terms_acceptances');
      expect(acc.rows.every((r) => r.review_status_at_acceptance === 'not_started')).toBe(true);
    });
  });

  it('users cannot write legal documents or acceptances directly', async () => {
    await expect(
      as(db, customerA, (q) => q(`insert into public.legal_documents (code, version, title) values ('fake_terms', '9', 'x')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(db, customerA, (q) => q(`update public.legal_documents set review_status = 'approved'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('a withdrawn document cannot be accepted', async () => {
    const id = (
      await db.query<{ id: string }>(
        `insert into public.legal_documents (code, version, title, review_status) values ('old_terms', '0.0', 'Old', 'withdrawn') returning id`,
      )
    ).rows[0]!.id;
    await expect(as(db, customerA, (q) => q(`select public.accept_legal_document($1, 'web')`, [id]))).rejects.toThrow(
      /ITM:document_unavailable/,
    );
  });
});

describe('audit log', () => {
  it('only platform admins can read it', async () => {
    const asCustomer = await as(db, customerA, (q) => q('select 1 from public.audit_log'));
    expect(asCustomer.rows).toHaveLength(0);
    const asSupport = await as(db, support, (q) => q('select 1 from public.audit_log'));
    expect(asSupport.rows).toHaveLength(0);
    const asAdmin = await as(db, admin, (q) => q('select 1 from public.audit_log'));
    expect(asAdmin.rows.length).toBeGreaterThan(0);
  });

  it('is append-only, even for platform admins and the database owner', async () => {
    await expect(as(db, admin, (q) => q('delete from public.audit_log'))).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from public.audit_log')).rejects.toThrow(/ITM:audit_append_only/);
    await expect(db.query(`update public.audit_log set action = 'x.y'`)).rejects.toThrow(/ITM:audit_append_only/);
    await expect(db.query('truncate public.audit_log')).rejects.toThrow(/ITM:audit_append_only/);
  });

  it('users cannot insert fake audit entries', async () => {
    await expect(
      as(db, customerA, (q) => q(`insert into public.audit_log (action, entity_type) values ('fake.entry', 'x')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, customerA, (q) => q(`select private.audit('fake.entry', 'x', null)`))).rejects.toThrow(/permission denied/);
  });
});

describe('schema guardrails', () => {
  it('every public table has RLS enabled', async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(r.rows).toEqual([]);
  });

  it('V1 has no payment, wallet or commission tables (business-model §3)', async () => {
    const r = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name ~ '(payment|wallet|payout|commission|escrow|order)'`,
    );
    expect(r.rows).toEqual([]);
  });

  it('every SECURITY DEFINER function pins search_path', async () => {
    const r = await db.query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(r.rows).toEqual([]);
  });
});
