import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let admin: string;
let customer: string;
let otherCustomer: string;
let near: string; // husker expert near the mill
let far: string; // husker expert far away, small radius
let generalist: string; // grain-machinery category only
let unapproved: string;
let compAdmin: string;
let companyEmployee: string;
let orgId: string;
let factory: string;
let husker: string;
let request: string;
const ids: Record<string, string> = {};

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const provider = async (user: string, kind = 'individual') =>
  (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1 and kind = $2', [user, kind])).rows[0]!.id;

/** Set up an approved provider directly (as the operator) — onboarding itself is tested elsewhere. */
async function approvedTech(name: string, opts: { lat: number; lng: number; radius: number; district: string; skills: [string, number][]; make?: string; availability?: string }) {
  const u = await createUser(db);
  await grantRole(db, u, 'technician');
  const p = (await db.query<{ id: string }>(
    `insert into public.provider_profiles (kind, user_id, display_name, languages, base_locality, base_district, base_latitude, base_longitude,
       service_radius_km, status, availability)
     values ('individual', $1, $2, '{te}', $3, $3, $4, $5, $6, 'approved', $7::public.availability_status) returning id`,
    [u, name, opts.district, opts.lat, opts.lng, opts.radius, opts.availability ?? 'available'],
  )).rows[0]!.id;
  for (const [k, years] of opts.skills) {
    const s = (await db.query<{ id: string }>(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, $3) returning id`, [p, await key(k), years])).rows[0]!.id;
    if (opts.make && k === 'machine.rubber_roll_husker') {
      await db.query(`insert into public.provider_make_model_experience (provider_skill_id, manufacturer_text) values ($1, $2)`, [s, opts.make]);
    }
  }
  ids[name] = p;
  return u;
}

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`);
  admin = await createUser(db);
  await grantRole(db, admin, 'platform_admin');
  customer = await createUser(db);
  otherCustomer = await createUser(db);
  for (const c of [customer, otherCustomer]) await asCommit(db, c, (q) => q(`select public.register_role('customer')`));
  husker = await key('machine.rubber_roll_husker');

  // Mill in Miryalaguda (Nalgonda district)
  factory = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`insert into public.factories (name, locality, district, latitude, longitude) values ('Sri Lakshmi Rice Mill', 'Miryalaguda', 'Nalgonda', 16.872, 79.563) returning id`)).rows[0]!.id,
  );

  near = await approvedTech('Near Husker Expert', { lat: 16.95, lng: 79.5, radius: 50, district: 'Nalgonda', skills: [['machine.rubber_roll_husker', 12]], make: 'Some Make' });
  far = await approvedTech('Far Husker Expert', { lat: 17.385, lng: 78.4867, radius: 30, district: 'Hyderabad', skills: [['machine.rubber_roll_husker', 20]] });
  generalist = await approvedTech('Grain Generalist', { lat: 17.0, lng: 79.6, radius: 80, district: 'Suryapet', skills: [['category.grain_processing', 6]] });
  await approvedTech('Busy Expert', { lat: 16.9, lng: 79.55, radius: 50, district: 'Nalgonda', skills: [['machine.rubber_roll_husker', 15]], availability: 'unavailable' });
  unapproved = await createUser(db);
  await grantRole(db, unapproved, 'technician');
  await db.query(
    `insert into public.provider_profiles (kind, user_id, display_name, base_district, service_districts, status) values ('individual', $1, 'Draft Tech', 'Nalgonda', '{Nalgonda}', 'submitted')`,
    [unapproved],
  );
  await db.query(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 30)`, [await provider(unapproved), husker]);

  // A company whose employee knows huskers (company itself lists none)
  compAdmin = await createUser(db);
  orgId = (await asCommit(db, compAdmin, (q) => q<{ id: string }>(`select public.create_organization('Alpha Mill Services') as id`))).rows[0]!.id;
  await db.query(`update public.provider_profiles set status = 'approved', base_district = 'Nalgonda', base_locality = 'Nalgonda' where organization_id = $1 and kind = 'company'`, [orgId]);
  ids['Alpha Mill Services'] = (await db.query<{ id: string }>(`select id from public.provider_profiles where organization_id = $1 and kind = 'company'`, [orgId])).rows[0]!.id;
  companyEmployee = await createUser(db);
  await grantRole(db, companyEmployee, 'company_technician', orgId);
  const m = (await db.query<{ id: string }>(`insert into public.provider_profiles (kind, user_id, organization_id, display_name, status) values ('company_member', $1, $2, 'Suresh', 'approved') returning id`, [companyEmployee, orgId])).rows[0]!.id;
  await db.query(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 9)`, [m, husker]);
});

describe('creating a request', () => {
  it('a customer creates a request for a machine at their factory; it gets a reference and a status history', async () => {
    const machine = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`insert into public.customer_machines (factory_id, machine_type_id, label, manufacturer_text) values ($1, $2, 'Husker 1', 'some make') returning id`, [factory, husker])).rows[0]!.id,
    );
    request = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(
        `select public.create_service_request($1, 'breakdown', 'Husker stopped, rolls slipping and a burning smell', '{machine_stopped,overheating}', $2, null, $3, null, null, 'emergency') as id`,
        [factory, machine, await key('industry.rice_mill')],
      )).rows[0]!.id,
    );
    const r = (await db.query<{ reference: string; status: string; machine_type_id: string; manufacturer_text: string }>('select reference, status, machine_type_id, manufacturer_text from public.service_requests where id = $1', [request])).rows[0]!;
    expect(r.reference).toMatch(/^SR-\d{4}-\d{5}$/);
    expect(r).toMatchObject({ status: 'submitted', machine_type_id: husker, manufacturer_text: 'some make' });
    const ev = await db.query<{ to_status: string }>('select to_status from public.job_status_events where request_id = $1', [request]);
    expect(ev.rows.map((e) => e.to_status)).toEqual(['submitted']);
  });

  it('"I don\'t know the machine" works when no machine is chosen', async () => {
    const id = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.create_service_request($1, 'inspection', 'Something in the cleaning section is making a loud noise', '{unusual_noise}') as id`, [factory])).rows[0]!.id,
    );
    const r = await db.query<{ key: string }>('select e.key from public.service_requests r join public.catalogue_entities e on e.id = r.machine_type_id where r.id = $1', [id]);
    expect(r.rows[0]!.key).toBe('machine.unknown');
  });

  it('refuses other customers\' factories and machines, non-customers, bad symptoms and past dates', async () => {
    await expect(as(db, otherCustomer, (q) => q(`select public.create_service_request($1, 'breakdown', 'Not my factory at all here')`, [factory]))).rejects.toThrow(/ITM:factory_not_yours/);
    await expect(as(db, near, (q) => q(`select public.create_service_request($1, 'breakdown', 'Providers cannot do this')`, [factory]))).rejects.toThrow(/only customers/);
    await expect(as(db, customer, (q) => q(`select public.create_service_request($1, 'breakdown', 'Bad symptom code here', '{exploding}')`, [factory]))).rejects.toThrow(/check/);
    await expect(as(db, customer, (q) => q(`select public.create_service_request($1, 'breakdown', 'Date in the past here', '{}', null, null, null, null, null, 'flexible', '2020-01-01')`, [factory]))).rejects.toThrow(/ITM:date_in_past/);
    await expect(as(db, customer, (q) => q(`select public.create_service_request($1, 'breakdown', 'short')`, [factory]))).rejects.toThrow(/check/);
  });

  it('other customers and uninvited providers cannot see the request', async () => {
    expect((await as(db, otherCustomer, (q) => q('select 1 from public.service_requests where id = $1', [request]))).rows).toHaveLength(0);
    expect((await as(db, near, (q) => q('select 1 from public.service_requests where id = $1', [request]))).rows).toHaveLength(0);
    expect((await as(db, near, (q) => q<{ r: unknown }>('select public.get_request_for_provider($1) as r', [request]))).rows[0]!.r).toBeNull();
  });
});

describe('matching', () => {
  type Match = { provider_id: string; display_name: string; reasons: string[]; distance_km: number | null; rank: number };
  let matches: Match[];

  it('only the customer can run matching; it moves the request to finding providers', async () => {
    await expect(as(db, otherCustomer, (q) => q('select public.match_providers($1)', [request]))).rejects.toThrow(/not allowed/);
    matches = await asCommit(db, customer, async (q) => (await q<{ m: Match[] }>('select public.match_providers($1) as m', [request])).rows[0]!.m);
    expect((await db.query<{ status: string }>('select status from public.service_requests where id = $1', [request])).rows[0]!.status).toBe('finding_providers');
  });

  it('ranks the nearby husker expert first, with factual reasons', () => {
    const names = matches.map((m) => m.display_name);
    expect(names[0]).toBe('Near Husker Expert');
    const top = matches[0]!;
    expect(top.reasons).toEqual(expect.arrayContaining([
      'Lists Rubber roll husker — 12 years (stated by provider)',
      'Has worked on Some Make (stated by provider)',
      'Available for new work',
    ]));
    expect(top.reasons.some((r) => /^About \d+ km away \(travels up to 50 km\)$/.test(r))).toBe(true);
    expect(JSON.stringify(matches)).not.toMatch(/certified|guarantee|verified expert/i);
  });

  it('includes a company because one of its approved employees knows the machine', () => {
    expect(matches.map((m) => m.display_name)).toContain('Alpha Mill Services');
  });

  it('includes category-level matches within range', () => {
    const g = matches.find((m) => m.display_name === 'Grain Generalist');
    expect(g?.reasons).toContain('Works on Grain and rice milling machinery (stated by provider)');
  });

  it('excludes providers out of range, unavailable or not approved', () => {
    const names = matches.map((m) => m.display_name);
    expect(names).not.toContain('Far Husker Expert');
    expect(names).not.toContain('Busy Expert');
    expect(names).not.toContain('Draft Tech');
  });

  it('never reveals provider coordinates; stores a snapshot for the customer only', async () => {
    expect(JSON.stringify(matches)).not.toMatch(/latitude|longitude|16\.95|79\.5[^0-9]/);
    const snap = await as(db, customer, (q) => q('select count(*)::int n from public.match_results where request_id = $1', [request]));
    expect((snap.rows[0] as { n: number }).n).toBe(matches.length);
    expect((await as(db, near, (q) => q('select 1 from public.match_results'))).rows).toHaveLength(0);
  });
});

describe('invitations and selection', () => {
  it('the customer contacts providers (up to 5 open); the request moves to provider contacted', async () => {
    await asCommit(db, customer, async (q) => {
      await q('select public.invite_provider($1, $2)', [request, ids['Near Husker Expert']]);
      await q('select public.invite_provider($1, $2)', [request, ids['Alpha Mill Services']]);
    });
    await expect(as(db, customer, (q) => q('select public.invite_provider($1, $2)', [request, ids['Near Husker Expert']]))).rejects.toThrow(/ITM:already_invited/);
    const draft = await provider(unapproved); // looked up as the operator: RLS hides it from the customer
    await expect(as(db, customer, (q) => q('select public.invite_provider($1, $2)', [request, draft]))).rejects.toThrow(/ITM:provider_unavailable/);
    await expect(as(db, otherCustomer, (q) => q('select public.invite_provider($1, $2)', [request, ids['Far Husker Expert']]))).rejects.toThrow(/not allowed/);
    expect((await db.query<{ status: string }>('select status from public.service_requests where id = $1', [request])).rows[0]!.status).toBe('provider_contacted');
  });

  it('an invited provider sees the request without the exact address or full customer name', async () => {
    const view = (await as(db, near, (q) => q<{ r: Record<string, unknown> }>('select public.get_request_for_provider($1) as r', [request]))).rows[0]!.r;
    expect(view).toMatchObject({ machine_type: 'Rubber roll husker', locality: 'Miryalaguda', district: 'Nalgonda', engaged: false, factory_name: null, address_line: null });
    expect(JSON.stringify(view)).not.toMatch(/\+91|919000/);
    // and only its own invitation
    expect((view.invitations as unknown[]).length).toBe(1);
    expect((await as(db, near, (q) => q('select 1 from public.service_requests where id = $1', [request]))).rows).toHaveLength(1);
  });

  it('only the invited provider (or its company admin) can respond; employees cannot answer for the company', async () => {
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [ids['Near Husker Expert']])).rows[0]!.id;
    const compInv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [ids['Alpha Mill Services']])).rows[0]!.id;
    await expect(as(db, far, (q) => q('select public.respond_to_invitation($1, true)', [inv]))).rejects.toThrow(/not allowed/);
    await expect(as(db, companyEmployee, (q) => q('select public.respond_to_invitation($1, true)', [compInv]))).rejects.toThrow(/not allowed/);
    await asCommit(db, near, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
    await asCommit(db, compAdmin, (q) => q(`select public.respond_to_invitation($1, false, 'Team busy this week')`, [compInv]));
    expect((await db.query<{ status: string }>('select status from public.service_requests where id = $1', [request])).rows[0]!.status).toBe('discussion');
  });

  it('after accepting, the provider sees the factory name, address and customer name', async () => {
    const view = (await as(db, near, (q) => q<{ r: Record<string, unknown> }>('select public.get_request_for_provider($1) as r', [request]))).rows[0]!.r;
    expect(view).toMatchObject({ engaged: true, factory_name: 'Sri Lakshmi Rice Mill' });
  });

  it('the customer selects an engaged provider; others cannot be selected', async () => {
    await expect(as(db, customer, (q) => q('select public.select_provider($1, $2)', [request, ids['Alpha Mill Services']]))).rejects.toThrow(/ITM:provider_not_engaged/);
    await asCommit(db, customer, (q) => q('select public.select_provider($1, $2)', [request, ids['Near Husker Expert']]));
    const r = await db.query<{ selected_provider_id: string }>('select selected_provider_id from public.service_requests where id = $1', [request]);
    expect(r.rows[0]!.selected_provider_id).toBe(ids['Near Husker Expert']);
    const inbox = (await as(db, near, (q) => q<{ l: { selected_you: boolean }[] }>('select public.list_my_invitations() as l'))).rows[0]!.l;
    expect(inbox[0]!.selected_you).toBe(true);
  });

  it('withdrawing the only engaged provider moves the request back', async () => {
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [ids['Near Husker Expert']])).rows[0]!.id;
    await asCommit(db, customer, (q) => q('select public.withdraw_invitation($1)', [inv]));
    const r = await db.query<{ status: string; selected_provider_id: string | null }>('select status, selected_provider_id from public.service_requests where id = $1', [request]);
    expect(r.rows[0]).toEqual({ status: 'finding_providers', selected_provider_id: null });
    // a withdrawn provider no longer sees the request
    expect((await as(db, near, (q) => q('select 1 from public.service_requests where id = $1', [request]))).rows).toHaveLength(0);
  });

  it('cancelling needs a reason, closes open invitations and is recorded', async () => {
    await asCommit(db, customer, (q) => q('select public.invite_provider($1, $2)', [request, ids['Near Husker Expert']]));
    await expect(as(db, customer, (q) => q(`select public.cancel_service_request($1, '')`, [request]))).rejects.toThrow(/ITM:note_required/);
    await asCommit(db, customer, (q) => q(`select public.cancel_service_request($1, 'Fixed it ourselves')`, [request]));
    const inv = await db.query<{ status: string }>(`select status from public.request_invitations where request_id = $1 and provider_profile_id = $2`, [request, ids['Near Husker Expert']]);
    expect(inv.rows[0]!.status).toBe('closed');
    await expect(as(db, customer, (q) => q('select public.invite_provider($1, $2)', [request, ids['Grain Generalist']]))).rejects.toThrow(/ITM:request_not_open/);
    const ev = await db.query<{ to_status: string }>('select to_status from public.job_status_events where request_id = $1 order by id', [request]);
    expect(ev.rows.map((e) => e.to_status)).toEqual(['submitted', 'finding_providers', 'provider_contacted', 'discussion', 'finding_providers', 'provider_contacted', 'cancelled']);
    await expect(db.query('delete from public.job_status_events')).rejects.toThrow(/ITM:audit_append_only/);
  });

  it('invalid status jumps are refused by the state machine', async () => {
    const ok = await db.query<{ a: boolean; b: boolean }>(`select private.job_transition_allowed('submitted', 'work_completed') a, private.job_transition_allowed('customer_confirmation_pending', 'closed') b`);
    expect(ok.rows[0]).toEqual({ a: false, b: true });
  });
});

describe('request media', () => {
  it('the customer uploads into the request folder; invited providers can read, others cannot', async () => {
    const r2 = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Whitener vibrating badly since morning', '{vibration}', null, $2) as id`, [factory, await key('machine.rice_whitener')])).rows[0]!.id,
    );
    const path = `${r2}/${crypto.randomUUID()}.jpg`;
    await asCommit(db, customer, async (q) => {
      await q(`insert into storage.objects (bucket_id, name) values ('request-media', $1)`, [path]);
      await q(`select public.register_request_attachment($1, 'photo', $2, 'image/jpeg', 2048)`, [r2, path]);
    });
    await expect(as(db, otherCustomer, (q) => q(`insert into storage.objects (bucket_id, name) values ('request-media', $1)`, [`${r2}/x.jpg`]))).rejects.toThrow(/row-level security/);
    expect((await as(db, near, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
    await asCommit(db, customer, (q) => q('select public.invite_provider($1, $2)', [r2, ids['Near Husker Expert']]));
    expect((await as(db, near, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(1);
    expect((await as(db, otherCustomer, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
    expect((await as(db, null, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
  });

  it('rejects wrong media types', async () => {
    const r = (await db.query<{ id: string }>(`select id from public.service_requests where customer_id = $1 order by created_at desc limit 1`, [customer])).rows[0]!.id;
    const path = `${r}/${crypto.randomUUID()}.exe`;
    await expect(
      asCommit(db, customer, async (q) => {
        await q(`insert into storage.objects (bucket_id, name) values ('request-media', $1)`, [path]);
        await q(`select public.register_request_attachment($1, 'photo', $2, 'application/x-msdownload', 10)`, [r, path]);
      }),
    ).rejects.toThrow(/attachment_mime/);
  });
});
