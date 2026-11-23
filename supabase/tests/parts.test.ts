import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let customer: string;
let tech: string;
let rival: string;
let stranger: string;
let admin: string;
let techProfile: string;
let rivalProfile: string;
let request: string;
let estimateTotal: string;

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const part = async (id: string) =>
  (await db.query<{ stage: string; total_price: string | null; approval_hash: string | null; compatibility: string; arranged_by: string | null }>(
    'select stage, total_price::text, approval_hash, compatibility, arranged_by from public.part_requests where id = $1', [id],
  )).rows[0]!;
const fields = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ part_name: 'Rubber roll 10 inch', part_number: 'RR-10-STD', manufacturer_text: 'Some Roll Co', quantity: '2', unit: 'pcs',
    specifications: '10 inch, hardness as per existing roll', ...over });
const create = (user: string, f = fields()) =>
  asCommit(db, user, async (q) => (await q<{ id: string }>('select public.create_part_request($1, $2, $3::jsonb) as id', [request, techProfile, f])).rows[0]!.id);

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`);
  customer = await createUser(db);
  tech = await createUser(db);
  rival = await createUser(db);
  stranger = await createUser(db);
  admin = await createUser(db);
  await grantRole(db, admin, 'platform_admin');
  await asCommit(db, customer, (q) => q(`select public.register_role('customer')`));
  for (const t of [tech, rival]) await asCommit(db, t, (q) => q(`select public.register_role('technician')`));
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Ravi Tech' where user_id = $1`, [tech]);
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Rival Tech' where user_id = $1`, [rival]);
  techProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [tech])).rows[0]!.id;
  rivalProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [rival])).rows[0]!.id;
  const factory = await asCommit(db, customer, async (q) => (await q<{ id: string }>(`insert into public.factories (name, locality) values ('Mill', 'Miryalaguda') returning id`)).rows[0]!.id);
  request = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Husker rolls worn out completely', '{low_output}', null, $2) as id`, [factory, await key('machine.rubber_roll_husker')])).rows[0]!.id,
  );
  await asCommit(db, customer, async (q) => {
    await q('select public.invite_provider($1, $2)', [request, techProfile]);
    await q('select public.invite_provider($1, $2)', [request, rivalProfile]);
  });
  const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [techProfile])).rows[0]!.id;
  await asCommit(db, tech, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
  // An accepted labour-only estimate
  const valid = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rev = await asCommit(db, tech, async (q) =>
    (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb) as id`, [request, techProfile,
      JSON.stringify({ labour: '2500', visit_charge: '300', scope: 'Fit new rolls and set roll gap; parts approved separately.', valid_until: valid })])).rows[0]!.id,
  );
  const hash = await asCommit(db, tech, async (q) => (await q<{ h: string }>('select public.send_estimate_revision($1) as h', [rev])).rows[0]!.h);
  await asCommit(db, customer, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev, hash]));
  estimateTotal = (await db.query<{ t: string }>('select total::text t from public.estimate_revisions where id = $1', [rev])).rows[0]!.t;
});

describe('creating and pricing parts', () => {
  it('either side of the engaged job can add a part; others cannot', async () => {
    const p1 = await create(tech);
    expect(await part(p1)).toMatchObject({ stage: 'identified', compatibility: 'unknown' });
    await create(customer, fields({ part_name: 'V-belt B-52' }));
    await expect(as(db, stranger, (q) => q('select public.create_part_request($1, $2, $3::jsonb)', [request, techProfile, fields()]))).rejects.toThrow(/not allowed/);
    await expect(as(db, rival, (q) => q('select public.create_part_request($1, $2, $3::jsonb)', [request, techProfile, fields()]))).rejects.toThrow(/not allowed/);
    await expect(as(db, rival, (q) => q('select public.create_part_request($1, $2, $3::jsonb)', [request, rivalProfile, fields()]))).rejects.toThrow(/ITM:not_engaged/);
  });

  it('compatibility starts unknown; only the provider can confirm on its own behalf; supplier confirmation needs a note', async () => {
    const p = (await db.query<{ id: string }>(`select id from public.part_requests where part_name = 'Rubber roll 10 inch'`)).rows[0]!.id;
    await expect(as(db, customer, (q) => q(`select public.set_part_compatibility($1, 'confirmed_by_provider', 'looks right')`, [p]))).rejects.toThrow(/ITM:provider_only/);
    await expect(as(db, customer, (q) => q(`select public.set_part_compatibility($1, 'confirmed_by_supplier', '')`, [p]))).rejects.toThrow(/ITM:note_required/);
    await asCommit(db, tech, (q) => q(`select public.set_part_compatibility($1, 'confirmed_by_provider', 'Matched against the old roll part number')`, [p]));
    expect((await part(p)).compatibility).toBe('confirmed_by_provider');
  });

  it('cannot be sent for approval without availability and price', async () => {
    const p = (await db.query<{ id: string }>(`select id from public.part_requests where part_name = 'Rubber roll 10 inch'`)).rows[0]!.id;
    await expect(asCommit(db, tech, (q) => q('select public.submit_part_for_approval($1)', [p]))).rejects.toThrow(/ITM:price_required/);
    await asCommit(db, tech, (q) => q(`select public.update_part_request($1, '{"unit_price": "2400"}'::jsonb)`, [p]));
    await expect(asCommit(db, tech, (q) => q('select public.submit_part_for_approval($1)', [p]))).rejects.toThrow(/ITM:availability_required/);
    await asCommit(db, tech, (q) => q(`select public.update_part_request($1, '{"availability": "to_order", "supplier_name": "Sri Ram Traders", "supplier_contact": "Shop 4, Miryalaguda", "expected_delivery": "2030-01-05"}'::jsonb)`, [p]));
    expect((await part(p)).total_price).toBe('4800.00');
  });
});

describe('customer approval', () => {
  let p: string;
  let hash: string;

  beforeAll(async () => {
    p = (await db.query<{ id: string }>(`select id from public.part_requests where part_name = 'Rubber roll 10 inch'`)).rows[0]!.id;
  });

  it('sending for approval freezes the part, fingerprints it and posts a parts card', async () => {
    hash = await asCommit(db, tech, async (q) => (await q<{ h: string }>('select public.submit_part_for_approval($1) as h', [p])).rows[0]!.h);
    expect(await part(p)).toMatchObject({ stage: 'awaiting_approval', approval_hash: hash });
    await expect(asCommit(db, tech, (q) => q(`select public.update_part_request($1, '{"unit_price": "1"}'::jsonb)`, [p]))).rejects.toThrow(/ITM:part_frozen/);
    await expect(db.query(`update public.part_requests set quantity = 5 where id = $1`, [p])).rejects.toThrow(/ITM:part_frozen/);
    await expect(db.query(`delete from public.part_requests where id = $1`, [p])).rejects.toThrow(/ITM:part_record/);
    const card = await as(db, customer, (q) => q<{ body: string }>(`select body from public.messages where kind = 'parts_card' and ref_id = $1`, [p]));
    expect(card.rows[0]!.body).toBe('Rubber roll 10 inch × 2 pcs — ₹4,800.00 (confirmed by provider)');
  });

  it('only the customer approves; with the matching fingerprint; choosing who arranges', async () => {
    for (const who of [tech, stranger, admin]) {
      await expect(as(db, who, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [p, hash]))).rejects.toThrow(/only the customer/);
    }
    await expect(as(db, customer, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [p, 'f'.repeat(64)]))).rejects.toThrow(/ITM:part_changed/);
    await expect(as(db, customer, (q) => q(`select public.decide_part($1, true, $2)`, [p, hash]))).rejects.toThrow(/ITM:arranged_by_required/);
    await asCommit(db, customer, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [p, hash]));
    expect(await part(p)).toMatchObject({ stage: 'approved', arranged_by: 'provider' });
  });

  it('an approved part cost is NOT added to the accepted estimate', async () => {
    const t = await db.query<{ t: string }>(`select v.total::text t from public.estimate_revisions v join public.estimates e on e.id = v.estimate_id where e.request_id = $1 and v.status = 'accepted'`, [request]);
    expect(t.rows[0]!.t).toBe(estimateTotal);
    expect(estimateTotal).toBe('2800.00');
  });

  it('moves arranged → received → installed; only the provider records installation; history kept', async () => {
    await expect(asCommit(db, customer, (q) => q(`select public.advance_part($1, 'arranged')`, [p]))).rejects.toThrow(/ITM:invalid_part_step/); // provider arranges
    await asCommit(db, tech, (q) => q(`select public.advance_part($1, 'arranged', 'Ordered from Sri Ram Traders')`, [p]));
    await asCommit(db, tech, (q) => q(`select public.advance_part($1, 'received', 'Collected')`, [p]));
    await expect(asCommit(db, customer, (q) => q(`select public.advance_part($1, 'installed')`, [p]))).rejects.toThrow(/ITM:invalid_part_step/);
    await asCommit(db, tech, (q) => q(`select public.advance_part($1, 'installed')`, [p]));
    const ev = await db.query<{ to_stage: string }>('select to_stage from public.part_status_events where part_id = $1 order by id', [p]);
    expect(ev.rows.map((e) => e.to_stage)).toEqual(['identified', 'awaiting_approval', 'approved', 'arranged', 'received', 'installed']);
    await expect(db.query('delete from public.part_status_events')).rejects.toThrow(/ITM:audit_append_only/);
  });

  it('a rejected part stays on record and cannot be arranged; cancelling needs a reason', async () => {
    const b = (await db.query<{ id: string }>(`select id from public.part_requests where part_name = 'V-belt B-52'`)).rows[0]!.id;
    await asCommit(db, customer, (q) => q(`select public.update_part_request($1, '{"unit_price": "450", "availability": "in_stock"}'::jsonb)`, [b]));
    const h = await asCommit(db, customer, async (q) => (await q<{ h: string }>('select public.submit_part_for_approval($1) as h', [b])).rows[0]!.h);
    await asCommit(db, customer, (q) => q(`select public.decide_part($1, false, $2, null, 'Will reuse the old belt')`, [b, h]));
    expect((await part(b)).stage).toBe('rejected');
    await expect(asCommit(db, tech, (q) => q(`select public.advance_part($1, 'arranged')`, [b]))).rejects.toThrow(/ITM:invalid_part_step/);
    const c = await create(customer, fields({ part_name: 'Spare bearing' }));
    await expect(asCommit(db, customer, (q) => q(`select public.advance_part($1, 'cancelled', '')`, [c]))).rejects.toThrow(/ITM:note_required/);
    await asCommit(db, customer, (q) => q(`select public.advance_part($1, 'cancelled', 'Not needed')`, [c]));
  });
});

describe('privacy', () => {
  it('parts are visible to the customer, the engaged provider and staff only', async () => {
    expect((await as(db, customer, (q) => q('select 1 from public.part_requests'))).rows.length).toBe(3);
    expect((await as(db, tech, (q) => q('select 1 from public.part_requests'))).rows.length).toBe(3);
    expect((await as(db, rival, (q) => q('select 1 from public.part_requests'))).rows).toHaveLength(0);
    expect((await as(db, stranger, (q) => q('select 1 from public.part_requests'))).rows).toHaveLength(0);
    expect((await as(db, admin, (q) => q('select 1 from public.part_requests'))).rows.length).toBe(3);
  });

  it('part photos: job participants only', async () => {
    const p = (await db.query<{ id: string }>(`select id from public.part_requests where part_name = 'Spare bearing'`)).rows[0]!.id;
    const path = `${p}/${crypto.randomUUID()}.jpg`;
    await asCommit(db, customer, async (q) => {
      await q(`insert into storage.objects (bucket_id, name) values ('part-photos', $1)`, [path]);
    });
    expect((await as(db, tech, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(1);
    expect((await as(db, rival, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
    await expect(as(db, stranger, (q) => q(`insert into storage.objects (bucket_id, name) values ('part-photos', $1)`, [`${p}/x.jpg`]))).rejects.toThrow(/row-level security/);
  });

  it('there is no payment or commission data anywhere in parts', async () => {
    const cols = await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'part_requests'`);
    expect(cols.rows.map((c) => c.column_name).join(' ')).not.toMatch(/payment|commission|paid|fee_to_platform/);
  });
});
