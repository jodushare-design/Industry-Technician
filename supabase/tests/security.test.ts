/**
 * Prompt 11 security suite.
 *
 * Builds the fictional demo world (scripts/demo/seed.mjs) plus a second
 * customer and a second service company, then checks the access guarantees
 * the platform makes, platform-wide invariants (RLS everywhere, definer
 * functions pinned to an empty search_path, private buckets, anon surface),
 * settings, rate limits and reports.
 *
 * Every per-feature suite (onboarding, requests, chat, estimates, parts,
 * completion) has its own detailed denial tests; this file is the single
 * place that states the headline guarantees.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ES module shared with the demo server
import { seedDemo } from '../../scripts/demo/seed.mjs';
import { as, asCommit, createTestDb, createUser, type Db } from './helpers/db';

type Seeded = {
  users: Record<string, string>;
  factory: string; ravi: string; srinivas: string; anil: string; org: string; company: string; member: string;
  r1: string; r2: string; r3: string; conv1: string; est1: string; est2: string; part: string;
};

let db: Db;
let w: Seeded;
// People
let custA: string; // Lakshmi
let raviU: string; // independent technician on request 1
let companyAdminA: string; // Priya, Alpha Mill Services
let employeeA: string; // Suresh
let srinivasU: string; // independent technician on request 2
let anilU: string; // technician waiting for verification
let support: string;
let admin: string;
let custB: string;
let companyAdminB: string;
let employeeB: string;
// Records
let requestB: string;
let orgB: string;
let memberB: string;
let memberBDocPath: string;
let raviDocPath: string;

async function asCaller(claims: { sub?: string; role: string }, fn: () => Promise<unknown>) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await db.exec(claims.role === 'authenticated' ? 'set local role authenticated' : 'set local role anon');
    const out = await fn();
    await db.exec('commit');
    return out;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

async function acceptTerms(user: string) {
  const ctx = await asCommit(db, user, async (q) => (await q<{ c: { pending_documents: { id: string }[] } }>('select public.get_my_context() as c')).rows[0]!.c);
  for (const d of ctx.pending_documents) await asCommit(db, user, (q) => q(`select public.accept_legal_document($1, 'web')`, [d.id]));
}

const count = async (user: string | null, sql: string, params: unknown[] = []) =>
  as(db, user, async (q) => (await q(sql, params)).rows.length);

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  w = (await seedDemo({ db, asCaller, storageDir: mkdtempSync(join(tmpdir(), 'itm-sec-')) })) as Seeded;
  custA = w.users['9000000001']!;
  raviU = w.users['9000000002']!;
  companyAdminA = w.users['9000000003']!;
  employeeA = w.users['9000000004']!;
  srinivasU = w.users['9000000005']!;
  anilU = w.users['9000000006']!;
  support = w.users['9000000008']!;
  admin = w.users['9000000009']!;

  // Customer B with a factory and a request of their own
  custB = await createUser(db, '919000000701');
  await asCommit(db, custB, (q) => q(`select public.register_role('customer')`));
  await acceptTerms(custB);
  const factoryB = await asCommit(db, custB, async (q) =>
    (await q<{ id: string }>(`insert into public.factories (name, address_line, locality, district, city, pincode)
       values ('Venkata Rice Industries', 'Plot 4, Industrial Area', 'Suryapet', 'Suryapet', 'Suryapet', '508213') returning id`)).rows[0]!.id);
  requestB = await asCommit(db, custB, async (q) =>
    (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Destoner motor trips after five minutes.', '{machine_stopped}', null, $2) as id`,
      [factoryB, await key('machine.destoner')])).rows[0]!.id);

  // Company B with an employee who uploaded an identity document
  companyAdminB = await createUser(db, '919000000702');
  orgB = await asCommit(db, companyAdminB, async (q) => (await q<{ id: string }>(`select public.create_organization('Beta Engineering Works') as id`)).rows[0]!.id);
  await acceptTerms(companyAdminB);
  const invite = await asCommit(db, companyAdminB, async (q) =>
    (await q<{ id: string }>(`select public.company_invite_member($1, '+919000000703', 'Kiran B') as id`, [orgB])).rows[0]!.id);
  employeeB = await createUser(db, '919000000703');
  memberB = await asCommit(db, employeeB, async (q) => (await q<{ id: string }>('select public.accept_company_invite($1) as id', [invite])).rows[0]!.id);
  memberBDocPath = `${memberB}/identity.pdf`;
  await asCommit(db, employeeB, async (q) => {
    await q('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)',
      ['provider-documents', memberBDocPath, employeeB, JSON.stringify({ mimetype: 'application/pdf', size: 100 })]);
    await q(`select public.register_provider_document($1, 'identity', $2, 'Aadhaar (test)', 'application/pdf', 100)`, [memberB, memberBDocPath]);
  });
  raviDocPath = (await db.query<{ storage_path: string }>(`select storage_path from public.provider_documents where provider_profile_id = $1 and doc_type = 'identity'`, [w.ravi])).rows[0]!.storage_path;
}, 120_000);

// -----------------------------------------------------------------------------
describe('headline guarantees', () => {
  it('Customer A cannot see Customer B’s jobs (and the reverse)', async () => {
    expect(await count(custA, 'select 1 from public.service_requests where id = $1', [requestB])).toBe(0);
    expect(await count(custA, 'select 1 from public.job_status_events where request_id = $1', [requestB])).toBe(0);
    expect(await count(custA, 'select 1 from public.service_requests where customer_id = $1', [custB])).toBe(0);
    expect(await count(custB, 'select 1 from public.service_requests where id = any($1::uuid[])', [`{${w.r1},${w.r2},${w.r3}}`])).toBe(0);
    expect(await count(custB, 'select 1 from public.estimates where request_id = $1', [w.r1])).toBe(0);
    expect(await count(custB, 'select 1 from public.complaints where request_id = $1', [w.r3])).toBe(0);
    // Owners still see their own
    expect(await count(custB, 'select 1 from public.service_requests where id = $1', [requestB])).toBe(1);
    expect(await count(custA, 'select 1 from public.service_requests where id = $1', [w.r1])).toBe(1);
  });

  it('Technician A cannot see Technician B’s private jobs', async () => {
    // Ravi was never contacted about request 2 (Srinivas’s job), and the reverse for request 1
    for (const [tech, req] of [[raviU, w.r2], [srinivasU, w.r1]] as const) {
      expect(await count(tech, 'select 1 from public.service_requests where id = $1', [req])).toBe(0);
      expect(await count(tech, 'select 1 from public.conversations where request_id = $1', [req])).toBe(0);
      expect(await count(tech, 'select 1 from public.estimates where request_id = $1', [req])).toBe(0);
      expect(await count(tech, 'select 1 from public.part_requests where request_id = $1', [req])).toBe(0);
      expect(await count(tech, 'select 1 from public.completion_reports where request_id = $1', [req])).toBe(0);
      expect(await as(db, tech, async (q) => (await q<{ r: unknown }>('select public.get_request_for_provider($1) as r', [req])).rows[0]!.r)).toBeNull();
    }
    // A technician who is not approved sees no customer jobs at all
    expect(await count(anilU, 'select 1 from public.service_requests')).toBe(0);
    // The provider on the job does see it
    expect(await count(srinivasU, 'select 1 from public.completion_reports where request_id = $1', [w.r2])).toBe(1);
  });

  it('Company A cannot see Company B’s employee records', async () => {
    expect(await count(companyAdminA, 'select 1 from public.provider_profiles where id = $1', [memberB])).toBe(0);
    expect(await count(companyAdminA, 'select 1 from public.organization_invites where organization_id = $1', [orgB])).toBe(0);
    expect(await count(companyAdminA, 'select 1 from public.user_roles where organization_id = $1', [orgB])).toBe(0);
    expect(await count(companyAdminA, 'select 1 from public.provider_documents where provider_profile_id = $1', [memberB])).toBe(0);
    expect(await count(companyAdminA, `select 1 from storage.objects where bucket_id = 'provider-documents' and name = $1`, [memberBDocPath])).toBe(0);
    // Company A cannot manage Company B
    await expect(as(db, companyAdminA, (q) => q(`select public.company_invite_member($1, '+919000000799', 'Intruder')`, [orgB]))).rejects.toThrow();
    await expect(as(db, companyAdminA, (q) => q('select public.company_remove_member($1)', [memberB]))).rejects.toThrow();
    // Company B cannot read Company A’s invites or its employee’s documents
    expect(await count(companyAdminB, 'select 1 from public.organization_invites where organization_id = $1', [w.org])).toBe(0);
    expect(await count(companyAdminB, 'select 1 from public.provider_documents where provider_profile_id = $1', [w.member])).toBe(0);
    // Company B’s admin sees its own invite
    expect(await count(companyAdminB, 'select 1 from public.organization_invites where organization_id = $1', [orgB])).toBe(1);
  });

  it('nonparticipants cannot read or write a conversation', async () => {
    expect(await count(custA, 'select 1 from public.messages where conversation_id = $1', [w.conv1])).toBeGreaterThan(0);
    for (const outsider of [srinivasU, custB, anilU, companyAdminB, employeeB]) {
      expect(await count(outsider, 'select 1 from public.conversations where id = $1', [w.conv1])).toBe(0);
      expect(await count(outsider, 'select 1 from public.messages where conversation_id = $1', [w.conv1])).toBe(0);
      await expect(as(db, outsider, (q) => q(`select public.send_message($1, 'text', 'hello')`, [w.conv1]))).rejects.toThrow();
    }
    // Support can only read a conversation through the audited staff function, not by querying it directly
    expect(await count(support, 'select 1 from public.messages where conversation_id = $1', [w.conv1])).toBe(0);
  });

  it('only the customer who owns the request can approve an estimate or a part cost', async () => {
    const hash = (await db.query<{ content_hash: string }>('select content_hash from public.estimate_revisions where id = $1', [w.est1])).rows[0]!.content_hash;
    for (const other of [raviU, companyAdminA, employeeA, support, admin, custB]) {
      await expect(as(db, other, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [w.est1, hash]))).rejects.toThrow();
      expect(await as(db, other, async (q) => {
        try {
          return (await q(`update public.estimate_revisions set status = 'accepted' where id = $1 returning id`, [w.est1])).rows.length;
        } catch { return 0; }
      })).toBe(0);
    }
    // Part cost: submitted by the provider, approved only by the customer
    const partHash = await asCommit(db, raviU, async (q) => (await q<{ h: string }>('select public.submit_part_for_approval($1) as h', [w.part])).rows[0]!.h);
    for (const other of [raviU, companyAdminA, support, admin, custB]) {
      await expect(as(db, other, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [w.part, partHash]))).rejects.toThrow();
    }
    // The customer can
    await as(db, custA, async (q) => {
      await q(`select public.decide_estimate($1, 'accept', $2)`, [w.est1, hash]);
      await q(`select public.decide_part($1, true, $2, 'provider')`, [w.part, partHash]);
    });
  });

  it('private identity documents are never publicly accessible', async () => {
    const buckets = (await db.query<{ id: string; public: boolean }>('select id, public from storage.buckets')).rows;
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.filter((b) => b.public)).toEqual([]);
    expect(await count(null, `select 1 from storage.objects where bucket_id = 'provider-documents'`)).toBe(0);
    await expect(count(null, 'select 1 from public.provider_documents')).rejects.toThrow(/permission denied/);
    for (const viewer of [custA, custB, srinivasU, companyAdminB]) {
      expect(await count(viewer, `select 1 from storage.objects where bucket_id = 'provider-documents' and name = $1`, [raviDocPath])).toBe(0);
      expect(await count(viewer, `select 1 from public.provider_documents where provider_profile_id = $1 and doc_type = 'identity'`, [w.ravi])).toBe(0);
    }
    // The owner and staff can
    expect(await count(raviU, `select 1 from storage.objects where bucket_id = 'provider-documents' and name = $1`, [raviDocPath])).toBe(1);
    expect(await count(support, `select 1 from storage.objects where bucket_id = 'provider-documents' and name = $1`, [raviDocPath])).toBe(1);
  });
});

// -----------------------------------------------------------------------------
describe('platform invariants', () => {
  it('every table in the public schema has row level security enabled', async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('every SECURITY DEFINER function pins an empty search_path', async () => {
    const { rows } = await db.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosecdef
          and not coalesce(p.proconfig @> array['search_path=""'], false)`);
    expect(rows.map((r) => r.fn)).toEqual([]);
  });

  it('anonymous visitors can write to no table and call only the public catalogue and profile functions', async () => {
    const writes = await db.query<{ t: string }>(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and (has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))`);
    // Supabase grants table privileges to anon by default; RLS must then deny every write.
    for (const { t } of writes.rows) {
      await expect(count(null, `delete from public.${t} returning 1`)).resolves.toBe(0);
    }
    const fns = await db.query<{ fn: string }>(
      `select p.proname as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`);
    expect(new Set(fns.rows.map((r) => r.fn))).toEqual(new Set(['search_catalogue', 'get_provider_public']));
  });

  it('storage buckets limit file size and type', async () => {
    const { rows } = await db.query<{ id: string; file_size_limit: number | null; allowed_mime_types: string[] | null }>(
      'select id, file_size_limit, allowed_mime_types from storage.buckets');
    for (const b of rows) {
      expect(b.file_size_limit, b.id).toBeGreaterThan(0);
      expect(b.file_size_limit!, b.id).toBeLessThanOrEqual(52428800);
      expect(b.allowed_mime_types?.length, b.id).toBeGreaterThan(0);
      expect(b.allowed_mime_types!.some((m) => /html|javascript|svg|x-msdownload|octet-stream/.test(m)), b.id).toBe(false);
    }
  });

  it('files can only be uploaded into a folder the uploader is allowed to use', async () => {
    await expect(as(db, custB, (q) =>
      q(`insert into storage.objects (bucket_id, name, owner) values ('provider-documents', $1, $2)`, [`${w.ravi}/forged.pdf`, custB]))).rejects.toThrow();
    await expect(as(db, custB, (q) =>
      q(`insert into storage.objects (bucket_id, name, owner) values ('request-media', $1, $2)`, [`${w.r1}/forged.jpg`, custB]))).rejects.toThrow();
  });

  it('the audit log is append-only and not readable by ordinary users', async () => {
    expect(await count(custA, 'select 1 from public.audit_log')).toBe(0);
    await expect(as(db, admin, (q) => q('delete from public.audit_log'))).rejects.toThrow();
    await expect(db.query('update public.audit_log set action = action')).rejects.toThrow(/audit_append_only/);
  });
});

// -----------------------------------------------------------------------------
describe('settings', () => {
  it('staff can read settings; other users cannot', async () => {
    expect(await count(support, 'select 1 from public.platform_settings')).toBeGreaterThan(0);
    expect(await count(custA, 'select 1 from public.platform_settings')).toBe(0);
    expect(await count(null, 'select 1 from public.platform_settings').catch(() => 0)).toBe(0);
  });

  it('only a platform admin can change a setting, with validation and an audit record', async () => {
    const set = (u: string, k: string, v: unknown) => as(db, u, (q) => q('select public.set_platform_setting($1, $2::jsonb)', [k, JSON.stringify(v)]));
    await expect(set(support, 'rate_limit.message', { max: 5, window_seconds: 60 })).rejects.toThrow(/admin_only/);
    await expect(set(custA, 'rate_limit.message', { max: 5, window_seconds: 60 })).rejects.toThrow(/admin_only/);
    await expect(set(admin, 'rate_limit.nope', { max: 5, window_seconds: 60 })).rejects.toThrow(/unknown_setting/);
    await expect(set(admin, 'rate_limit.message', [5, 60])).rejects.toThrow(/invalid_setting/);
    await expect(set(admin, 'rate_limit.message', { max: 5 })).rejects.toThrow(/invalid_setting/);
    await expect(set(admin, 'rate_limit.message', { max: 1.5, window_seconds: 60 })).rejects.toThrow(/invalid_setting/);
    await expect(set(admin, 'rate_limit.message', { max: 0, window_seconds: 60 })).rejects.toThrow(/invalid_setting/);
    await expect(set(admin, 'rate_limit.message', { max: 5, window_seconds: 1 })).rejects.toThrow(/invalid_setting/);
    await expect(set(admin, 'rate_limit.message', { max: 5, window_seconds: 60, extra: 1 })).rejects.toThrow(/invalid_setting/);
    await as(db, admin, async (q) => {
      await q('select public.set_platform_setting($1, $2::jsonb)', ['rate_limit.message', JSON.stringify({ max: 50, window_seconds: 60 })]);
      const a = (await q<{ details: { old: unknown; new: unknown } }>(
        `select details from public.audit_log where action = 'settings.updated' and entity_id = 'rate_limit.message' order by id desc limit 1`)).rows[0]!;
      expect(a.details.new).toEqual({ max: 50, window_seconds: 60 });
      expect(a.details.old).toEqual({ max: 30, window_seconds: 60 });
    });
    // Direct writes are refused even for admins
    await expect(as(db, admin, (q) => q(`update public.platform_settings set value = '{}'::jsonb`))).rejects.toThrow(/permission denied/);
  });
});

// -----------------------------------------------------------------------------
describe('rate limits', () => {
  it('limits chat messages per person; system notes and other people are not affected', async () => {
    await db.query('delete from private.rate_limit_hits'); // the demo seed already sent messages as Ravi
    await db.query(`update public.platform_settings set value = '{"max": 3, "window_seconds": 60}' where key = 'rate_limit.message'`);
    try {
      for (let i = 1; i <= 3; i++) {
        await asCommit(db, raviU, (q) => q(`select public.send_message($1, 'text', $2)`, [w.conv1, `Update ${i}`]));
      }
      await expect(asCommit(db, raviU, (q) => q(`select public.send_message($1, 'text', 'One more')`, [w.conv1]))).rejects.toThrow(/rate_limited/);
      await asCommit(db, custA, (q) => q(`select public.send_message($1, 'text', 'Thanks, noted')`, [w.conv1]));
    } finally {
      await db.query(`update public.platform_settings set value = '{"max": 30, "window_seconds": 60}' where key = 'rate_limit.message'`);
      await db.query('delete from private.rate_limit_hits');
    }
  });

  it('limits new service requests per customer', async () => {
    await db.query(`update public.platform_settings set value = '{"max": 1, "window_seconds": 86400}' where key = 'rate_limit.service_request'`);
    try {
      await db.query('delete from private.rate_limit_hits');
      const fb = (await db.query<{ id: string }>('select id from public.factories where owner_id = $1', [custB])).rows[0]!.id;
      const create = async (text: string) => asCommit(db, custB, async (q) =>
        q(`select public.create_service_request($1, 'breakdown', $2, '{machine_stopped}', null, $3)`, [fb, text, await key('machine.destoner')]));
      await create('Elevator belt slipping since morning.');
      await expect(create('Second request in the same day.')).rejects.toThrow(/rate_limited/);
      // Another customer is not affected
      await asCommit(db, custA, async (q) =>
        q(`select public.create_service_request($1, 'maintenance', 'Dryer burner check before season.', '{regular_service}', null, $2)`, [w.factory, await key('machine.paddy_dryer')]));
    } finally {
      await db.query(`update public.platform_settings set value = '{"max": 10, "window_seconds": 86400}' where key = 'rate_limit.service_request'`);
      await db.query('delete from private.rate_limit_hits');
    }
  });

  it('the rate-limit counters are not reachable through the API', async () => {
    await expect(count(custA, 'select 1 from private.rate_limit_hits')).rejects.toThrow(/permission denied/);
    await expect(as(db, custA, (q) => q(`select private.enforce_rate_limit('message')`))).rejects.toThrow(/permission denied/);
  });
});

// -----------------------------------------------------------------------------
describe('reports', () => {
  const today = new Date().toISOString().slice(0, 10);

  it('are staff only', async () => {
    for (const u of [custA, raviU, companyAdminA]) {
      await expect(as(db, u, (q) => q('select public.admin_report($1, $2)', [today, today]))).rejects.toThrow(/staff only/);
    }
    await expect(count(null, `select public.admin_report('2026-01-01', '2026-01-02')`)).rejects.toThrow(/permission denied/);
  });

  it('summarise requests, complaints and providers without money figures', async () => {
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const r = await as(db, support, async (q) => (await q<{ r: Record<string, Record<string, unknown>> }>('select public.admin_report($1, $2) as r', [from, to])).rows[0]!.r);
    expect(r.requests!.created).toBeGreaterThanOrEqual(4);
    expect(r.funnel!.provider_accepted).toBeGreaterThanOrEqual(3);
    expect(r.funnel!.estimate_accepted).toBeGreaterThanOrEqual(1);
    expect(r.complaints!.opened).toBeGreaterThanOrEqual(1);
    expect(r.providers!.waiting_verification).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(r)).not.toMatch(/amount|total|price|inr|paise/i);
  });

  it('reject bad ranges', async () => {
    await expect(as(db, support, (q) => q(`select public.admin_report('2026-02-01', '2026-01-01')`))).rejects.toThrow(/invalid_range/);
    await expect(as(db, support, (q) => q(`select public.admin_report('2024-01-01', '2026-01-01')`))).rejects.toThrow(/invalid_range/);
  });
});
