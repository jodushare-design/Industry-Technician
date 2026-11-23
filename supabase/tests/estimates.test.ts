import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let customer: string;
let otherCustomer: string;
let tech: string;
let rival: string;
let admin: string;
let support: string;
let compAdmin: string;
let employee: string;
let techProfile: string;
let rivalProfile: string;
let companyProfile: string;
let memberProfile: string;
let request: string;

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const status = async (id = request) => (await db.query<{ status: string }>('select status from public.service_requests where id = $1', [id])).rows[0]!.status;
const rev = async (id: string) =>
  (await db.query<{ status: string; total: string; content_hash: string | null; revision_no: number }>('select status, total::text, content_hash, revision_no from public.estimate_revisions where id = $1', [id])).rows[0]!;
const future = (days = 14) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const fields = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    inspection_fee: '0', visit_charge: '300', labour: '2500', travel: '200', parts: '4800', other_charges: '0',
    tax_amount: '1404', tax_note: 'GST 18% on labour and parts', scope: 'Replace both rubber rolls and set roll gap; test run with paddy.',
    exclusions: 'Motor and gearbox work', expected_completion: 'Same day', valid_until: future(), ...over,
  });

async function draft(user: string, provider: string, kind: string, f: string, estimate: string | null = null) {
  return asCommit(db, user, async (q) =>
    (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, $3, $4::public.estimate_kind, null, $5::jsonb) as id`, [request, provider, estimate, kind, f])).rows[0]!.id,
  );
}
const send = (user: string, revision: string) => asCommit(db, user, async (q) => (await q<{ h: string }>('select public.send_estimate_revision($1) as h', [revision])).rows[0]!.h);
const decide = (user: string, revision: string, decision: string, hash: string, note: string | null = null) =>
  asCommit(db, user, (q) => q('select public.decide_estimate($1, $2, $3, $4)', [revision, decision, hash, note]));

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`);
  customer = await createUser(db);
  otherCustomer = await createUser(db);
  tech = await createUser(db);
  rival = await createUser(db);
  admin = await createUser(db);
  support = await createUser(db);
  compAdmin = await createUser(db);
  employee = await createUser(db);
  await grantRole(db, admin, 'platform_admin');
  await grantRole(db, support, 'support_agent');
  for (const c of [customer, otherCustomer]) await asCommit(db, c, (q) => q(`select public.register_role('customer')`));
  for (const t of [tech, rival]) await asCommit(db, t, (q) => q(`select public.register_role('technician')`));
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Ravi Tech' where user_id = $1`, [tech]);
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Rival Tech' where user_id = $1`, [rival]);
  techProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [tech])).rows[0]!.id;
  rivalProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [rival])).rows[0]!.id;
  const org = (await asCommit(db, compAdmin, (q) => q<{ id: string }>(`select public.create_organization('Alpha Mill Services') as id`))).rows[0]!.id;
  await db.query(`update public.provider_profiles set status = 'approved' where organization_id = $1 and kind = 'company'`, [org]);
  companyProfile = (await db.query<{ id: string }>(`select id from public.provider_profiles where organization_id = $1 and kind = 'company'`, [org])).rows[0]!.id;
  await grantRole(db, employee, 'company_technician', org);
  memberProfile = (await db.query<{ id: string }>(`insert into public.provider_profiles (kind, user_id, organization_id, display_name, status) values ('company_member', $1, $2, 'Suresh', 'approved') returning id`, [employee, org])).rows[0]!.id;

  const factory = await asCommit(db, customer, async (q) => (await q<{ id: string }>(`insert into public.factories (name, locality) values ('Sri Lakshmi Rice Mill', 'Miryalaguda') returning id`)).rows[0]!.id);
  request = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Husker rolls slipping, low husking', '{low_output}', null, $2) as id`, [factory, await key('machine.rubber_roll_husker')])).rows[0]!.id,
  );
  await asCommit(db, customer, async (q) => {
    for (const p of [techProfile, rivalProfile, companyProfile]) await q('select public.invite_provider($1, $2)', [request, p]);
  });
  for (const [u, p] of [[tech, techProfile], [rival, rivalProfile], [compAdmin, companyProfile]] as const) {
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [p])).rows[0]!.id;
    await asCommit(db, u, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
  }
});

describe('drafts and sending', () => {
  let r1: string;

  it('only an engaged provider can prepare estimates; customers never see drafts', async () => {
    await expect(as(db, otherCustomer, (q) => q(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb)`, [request, techProfile, fields()]))).rejects.toThrow(/not allowed/);
    await expect(as(db, customer, (q) => q(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb)`, [request, techProfile, fields()]))).rejects.toThrow(/not allowed/);
    r1 = await draft(tech, techProfile, 'repair', fields());
    expect((await as(db, customer, (q) => q('select 1 from public.estimate_revisions where id = $1', [r1]))).rows).toHaveLength(0);
    expect((await as(db, rival, (q) => q('select 1 from public.estimate_revisions where id = $1', [r1]))).rows).toHaveLength(0);
    expect((await rev(r1)).total).toBe('9204.00');
  });

  it('refuses incomplete estimates: scope, validity, total', async () => {
    const bad = await draft(rival, rivalProfile, 'repair', fields({ scope: 'short' }));
    await expect(send(rival, bad)).rejects.toThrow(/ITM:scope_required/);
    await draft(rival, rivalProfile, 'repair', fields({ valid_until: '2020-01-01' }), (await db.query<{ estimate_id: string }>('select estimate_id from public.estimate_revisions where id = $1', [bad])).rows[0]!.estimate_id);
    await expect(send(rival, bad)).rejects.toThrow(/ITM:validity_required/);
    await expect(as(db, rival, (q) => q(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb)`, [request, rivalProfile, fields({ labour: '-5' })]))).rejects.toThrow(/check/);
  });

  it('sending freezes the revision, fingerprints it, posts an estimate card and moves the request to awaiting approval', async () => {
    const hash = await send(tech, r1);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await rev(r1)).toMatchObject({ status: 'sent', content_hash: hash });
    expect(await status()).toBe('awaiting_approval');
    await expect(db.query(`update public.estimate_revisions set labour = 1 where id = $1`, [r1])).rejects.toThrow(/ITM:estimate_sent_frozen/);
    await expect(db.query(`delete from public.estimate_revisions where id = $1`, [r1])).rejects.toThrow(/ITM:estimate_record/);
    const card = await as(db, customer, (q) => q<{ kind: string; ref_id: string; body: string }>(`select kind, ref_id, body from public.messages where kind = 'estimate_card'`));
    expect(card.rows[0]).toMatchObject({ kind: 'estimate_card', ref_id: r1 });
    expect(card.rows[0]!.body).toContain('₹9,204.00');
    const n = await as(db, customer, (q) => q<{ kind: string }>(`select kind from public.notifications where kind = 'estimate_received'`));
    expect(n.rows).toHaveLength(1);
  });
});

describe('customer decisions', () => {
  let r1: string;
  let r2: string;
  let hash1: string;

  beforeAll(async () => {
    r1 = (await db.query<{ id: string }>(`select v.id from public.estimate_revisions v join public.estimates e on e.id = v.estimate_id where e.provider_profile_id = $1 and v.status = 'sent'`, [techProfile])).rows[0]!.id;
    hash1 = (await rev(r1)).content_hash!;
  });

  it('only the customer can decide — not the provider, other customers, support or platform admins', async () => {
    for (const who of [tech, otherCustomer, support, admin, compAdmin]) {
      await expect(as(db, who, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [r1, hash1]))).rejects.toThrow(/only the customer/);
    }
    await expect(as(db, customer, (q) => q(`update public.estimate_revisions set status = 'accepted' where id = $1`, [r1]))).rejects.toThrow(/permission denied/);
  });

  it('asking for changes needs a note; the provider then revises (new revision, old one kept)', async () => {
    await expect(decide(customer, r1, 'request_revision', hash1, '')).rejects.toThrow(/ITM:note_required/);
    await decide(customer, r1, 'request_revision', hash1, 'Please quote both rolls separately and lower travel');
    expect((await rev(r1)).status).toBe('revision_requested');
    expect(await status()).toBe('discussion');

    const estimateId = (await db.query<{ estimate_id: string }>('select estimate_id from public.estimate_revisions where id = $1', [r1])).rows[0]!.estimate_id;
    r2 = await draft(tech, techProfile, 'repair', fields({ travel: '0', tax_amount: '1368' }), estimateId);
    expect((await rev(r2)).revision_no).toBe(2);
    await send(tech, r2);
    expect((await rev(r1)).status).toBe('superseded');
    expect((await rev(r2)).total).toBe('8968.00');
  });

  it('a revised price is never accepted with an old fingerprint or an older revision', async () => {
    await expect(decide(customer, r1, 'accept', hash1)).rejects.toThrow(/ITM:estimate_not_open/);
    await expect(decide(customer, r2, 'accept', hash1)).rejects.toThrow(/ITM:estimate_changed/);
  });

  it('accepting locks the revision, selects the provider, closes the others and approves the job', async () => {
    const h2 = (await rev(r2)).content_hash!;
    await decide(customer, r2, 'accept', h2);
    expect((await rev(r2)).status).toBe('accepted');
    expect(await status()).toBe('approved');
    const sel = await db.query<{ selected_provider_id: string }>('select selected_provider_id from public.service_requests where id = $1', [request]);
    expect(sel.rows[0]!.selected_provider_id).toBe(techProfile);
    const others = await db.query<{ status: string }>(`select status from public.request_invitations where request_id = $1 and provider_profile_id <> $2`, [request, techProfile]);
    expect(others.rows.every((o) => o.status === 'not_selected')).toBe(true);
    await expect(db.query(`update public.estimate_revisions set decision_note = 'x' where id = $1`, [r2])).rejects.toThrow(/ITM:estimate_locked/);
    await expect(db.query(`update public.estimate_revisions set status = 'rejected' where id = $1`, [r2])).rejects.toThrow(/ITM:estimate_locked/);
    await expect(as(db, tech, (q) => q(`select public.save_estimate_draft($1, $2, (select estimate_id from public.estimate_revisions where id = $3), 'repair', null, $4::jsonb)`, [request, techProfile, r2, fields()]))).rejects.toThrow(/ITM:estimate_locked/);
    const audit = await db.query<{ n: number }>(`select count(*)::int n from public.audit_log where action = 'estimate.accept' and entity_id = $1`, [r2]);
    expect(audit.rows[0]!.n).toBe(1);
    const sys = await as(db, tech, (q) => q<{ body: string }>(`select body from public.messages where kind = 'system' and body like 'The customer accepted%'`));
    expect(sys.rows[0]!.body).toBe('The customer accepted Repair (revision 2) for ₹8,968.00.');
  });

  it('providers who were not selected can no longer send estimates', async () => {
    await expect(as(db, rival, (q) => q(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb)`, [request, rivalProfile, fields()]))).rejects.toThrow(/ITM:not_engaged/);
  });

  it('additional work needs its own estimate and approval; rejecting it keeps the original approval', async () => {
    const a1 = await draft(tech, techProfile, 'additional_work', fields({ labour: '800', parts: '0', tax_amount: '144', scope: 'Replace worn V-belt found during work' }));
    await send(tech, a1);
    expect(await status()).toBe('awaiting_approval');
    await decide(customer, a1, 'reject', (await rev(a1)).content_hash!, 'Not now');
    expect((await rev(a1)).status).toBe('rejected');
    expect(await status()).toBe('approved'); // the accepted repair estimate still stands
  });
});

describe('inspection-only estimates', () => {
  it('allows an inspection fee alone and refuses labour or parts in an inspection estimate', async () => {
    const factory = (await db.query<{ id: string }>('select factory_id as id from public.service_requests where id = $1', [request])).rows[0]!.id;
    const req2 = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.create_service_request($1, 'inspection', 'Not sure why output is low', '{low_output}') as id`, [factory])).rows[0]!.id,
    );
    await asCommit(db, customer, (q) => q('select public.invite_provider($1, $2)', [req2, rivalProfile]));
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where request_id = $1', [req2])).rows[0]!.id;
    await asCommit(db, rival, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
    const insp = { inspection_fee: '500', visit_charge: '0', labour: '0', travel: '0', parts: '0', tax_amount: '0', tax_note: '', scope: 'Inspection of the line. Repair price to be quoted after inspection.', exclusions: '', valid_until: future(7) };
    const bad = await asCommit(db, rival, async (q) =>
      (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, null, 'inspection', null, $3::jsonb) as id`, [req2, rivalProfile, JSON.stringify({ ...insp, labour: '100' })])).rows[0]!.id,
    );
    await expect(send(rival, bad)).rejects.toThrow(/ITM:inspection_only/);
    const est = (await db.query<{ estimate_id: string }>('select estimate_id from public.estimate_revisions where id = $1', [bad])).rows[0]!.estimate_id;
    const ok = await asCommit(db, rival, async (q) =>
      (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, $3, 'inspection', null, $4::jsonb) as id`, [req2, rivalProfile, est, JSON.stringify(insp)])).rows[0]!.id,
    );
    await asCommit(db, rival, (q) => q('select public.send_estimate_revision($1)', [ok]));
    expect((await rev(ok)).total).toBe('500.00');
    expect(await status(req2)).toBe('awaiting_approval');
  });
});

describe('company estimates and expiry', () => {
  it('an assigned employee drafts but cannot send unless the company allows it', async () => {
    const factory = (await db.query<{ id: string }>('select factory_id as id from public.service_requests where id = $1', [request])).rows[0]!.id;
    const req3 = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.create_service_request($1, 'maintenance', 'Annual service of the whitener', '{regular_service}') as id`, [factory])).rows[0]!.id,
    );
    await asCommit(db, customer, (q) => q('select public.invite_provider($1, $2)', [req3, companyProfile]));
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where request_id = $1', [req3])).rows[0]!.id;
    await asCommit(db, compAdmin, async (q) => {
      await q('select public.respond_to_invitation($1, true)', [inv]);
      await q('select public.assign_company_member($1, $2)', [inv, memberProfile]);
    });
    const d = await asCommit(db, employee, async (q) =>
      (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb) as id`, [req3, companyProfile, fields({ scope: 'Full whitener service including screen change.' })])).rows[0]!.id,
    );
    await expect(send(employee, d)).rejects.toThrow(/not allowed to send/);
    await db.query(`update public.user_roles set can_send_estimates = true where user_id = $1`, [employee]);
    await send(employee, d);
    expect((await rev(d)).status).toBe('sent');

    // expiry
    await db.query(`update public.estimate_revisions set status = 'sent' where id = $1`, [d]); // no-op guard check
    await db.exec(`alter table public.estimate_revisions disable trigger estimate_revisions_guard`);
    await db.query(`update public.estimate_revisions set valid_until = current_date - 1 where id = $1`, [d]);
    await db.exec(`alter table public.estimate_revisions enable trigger estimate_revisions_guard`);
    await expect(decide(customer, d, 'accept', (await rev(d)).content_hash!)).rejects.toThrow(/ITM:estimate_expired/);
  });
});

describe('null inputs', () => {
  it('a missing decision is refused, not treated as a change request', async () => {
    const anyRev = (await db.query<{ id: string }>(`select id from public.estimate_revisions limit 1`)).rows[0]!.id;
    await expect(as(db, customer, (q) => q('select public.decide_estimate($1, null, null)', [anyRev]))).rejects.toThrow(/ITM:invalid_decision/);
  });
});
