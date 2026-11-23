/**
 * Prompt 12 pilot journeys, end to end through the same database functions
 * the website and app call, each step as the person who would do it.
 *
 * 1. Rice mill pilot: a new customer registers a mill with ten machines and
 *    takes one husker breakdown from request to confirmed completion,
 *    including media, discovery, chat, a revised estimate, a spare part and a
 *    complaint handled by support.
 * 2. General industry pilot: CNC, motor/VFD, pump, PLC and compressor jobs
 *    from request to an approved estimate.
 *
 * Builds on the fictional demo world (scripts/demo/seed.mjs): approved
 * technicians Ravi Kumar (huskers) and Srinivas Rao (colour sorters), the
 * company Alpha Mill Services, support staff and a platform admin.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ES module shared with the demo server
import { seedDemo } from '../../scripts/demo/seed.mjs';
import { as, asCommit, createTestDb, createUser, type Db } from './helpers/db';

type Seeded = { users: Record<string, string>; ravi: string; srinivas: string; company: string };
type Match = { provider_id: string; display_name: string; reasons: string[]; distance_km: number | null; rank: number };

let db: Db;
let w: Seeded;
let raviU: string;
let srinivasU: string;
let support: string;
let admin: string;

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const one = async <T>(user: string, sql: string, params: unknown[] = []) =>
  asCommit(db, user, async (q) => (await q<T>(sql, params)).rows[0]!);
const status = async (r: string) => (await db.query<{ status: string }>('select status from public.service_requests where id = $1', [r])).rows[0]!.status;
const SAFETY = JSON.stringify({ access: true, isolation: true, permits: true, ppe: true, site_contact: true });

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
  const ctx = (await one<{ c: { pending_documents: { id: string }[] } }>(user, 'select public.get_my_context() as c')).c;
  for (const d of ctx.pending_documents) await asCommit(db, user, (q) => q(`select public.accept_legal_document($1, 'web')`, [d.id]));
}

/** Upload a placeholder object as `user` (the bytes live in Storage; the database holds the row). */
async function putObject(user: string, bucket: string, path: string, mime: string, size = 2048) {
  await asCommit(db, user, (q) => q('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)',
    [bucket, path, user, JSON.stringify({ mimetype: mime, size })]));
}

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  w = (await seedDemo({ db, asCaller, storageDir: mkdtempSync(join(tmpdir(), 'itm-pilot-')) })) as Seeded;
  raviU = w.users['9000000002']!;
  srinivasU = w.users['9000000005']!;
  support = w.users['9000000008']!;
  admin = w.users['9000000009']!;
}, 120_000);

// =============================================================================
describe('rice mill pilot: husker breakdown from request to completion', () => {
  const RICE_MILL_MACHINES = [
    ['machine.paddy_cleaner', 'Pre-cleaner'],
    ['machine.destoner', 'Destoner'],
    ['machine.rubber_roll_husker', 'Husker 1'],
    ['machine.paddy_separator', 'Paddy separator'],
    ['machine.rice_whitener', 'Whitener 1'],
    ['machine.rice_polisher', 'Silky polisher'],
    ['machine.rotary_sifter', 'Rotary sifter'],
    ['machine.colour_sorter', 'Colour sorter'],
    ['machine.air_compressor', 'Compressor'],
    ['machine.electrical_panel', 'Main panel'],
  ] as const;

  let customer: string;
  let factory: string;
  let husker: string;
  let request: string;
  let raviInvite: string;
  let conversation: string;
  let estimate: string;
  let rev1: string;
  let rev2: string;
  let part: string;
  let complaint: string;

  it('customer registration: a new mill owner signs in, chooses the customer role and accepts the terms', async () => {
    customer = await createUser(db, '919100000001');
    await asCommit(db, customer, async (q) => {
      await q(`update public.profiles set full_name = 'Pilot Rice Mill Owner' where id = auth.uid()`);
      await q(`select public.register_role('customer')`);
    });
    await acceptTerms(customer);
    const ctx = (await one<{ c: { roles: { role: string }[]; pending_documents: unknown[] } }>(customer, 'select public.get_my_context() as c')).c;
    expect(ctx.roles.map((r) => r.role)).toContain('customer');
    expect(ctx.pending_documents).toEqual([]);
  });

  it('machine selection: the mill and its ten machines are registered from catalogue search', async () => {
    const found = await as(db, customer, async (q) =>
      (await q<{ r: { results: { key: string }[] } }>(`select public.search_catalogue('husker', null) as r`)).rows[0]!.r.results.map((x) => x.key));
    expect(found).toContain('machine.rubber_roll_husker');

    factory = (await one<{ id: string }>(customer,
      `insert into public.factories (name, address_line, locality, district, city, pincode, latitude, longitude)
       values ('Pilot Rice Mill', 'Survey No. 88, Nalgonda Road', 'Miryalaguda', 'Nalgonda', 'Miryalaguda', '508207', 16.86, 79.56) returning id`)).id;
    for (const [k, label] of RICE_MILL_MACHINES) {
      const id = (await one<{ id: string }>(customer,
        'insert into public.customer_machines (factory_id, machine_type_id, label) values ($1, $2, $3) returning id', [factory, await key(k), label])).id;
      if (k === 'machine.rubber_roll_husker') husker = id;
    }
    const n = await as(db, customer, async (q) => (await q('select 1 from public.customer_machines where factory_id = $1', [factory])).rows.length);
    expect(n).toBe(10);
  });

  it('fault reporting: the customer reports a breakdown on Husker 1', async () => {
    request = (await one<{ id: string }>(customer,
      `select public.create_service_request($1, 'breakdown', 'Husker 1 stopped. Rolls slipping, burning smell near the roll housing.',
         '{machine_stopped,overheating}', $2, null, $3, 'Local make', null, 'emergency') as id`,
      [factory, husker, await key('industry.rice_mill')])).id;
    expect(await status(request)).toBe('submitted');
    const ref = (await db.query<{ reference: string }>('select reference from public.service_requests where id = $1', [request])).rows[0]!.reference;
    expect(ref).toMatch(/^SR-\d{4}-\d{5}$/);
  });

  it('photo and video upload: attached to the request, refused for wrong types', async () => {
    await putObject(customer, 'request-media', `${request}/rolls.jpg`, 'image/jpeg');
    await putObject(customer, 'request-media', `${request}/noise.mp4`, 'video/mp4', 4_000_000);
    await asCommit(db, customer, async (q) => {
      await q(`select public.register_request_attachment($1, 'photo', $2, 'image/jpeg', 2048)`, [request, `${request}/rolls.jpg`]);
      await q(`select public.register_request_attachment($1, 'video', $2, 'video/mp4', 4000000)`, [request, `${request}/noise.mp4`]);
    });
    await expect(as(db, customer, (q) => q(`select public.register_request_attachment($1, 'photo', $2, 'application/x-msdownload', 100)`,
      [request, `${request}/x.exe`]))).rejects.toThrow();
  });

  it('technician discovery: matching ranks nearby husker technicians with factual reasons', async () => {
    const matches = await one<{ m: Match[] }>(customer, 'select public.match_providers($1) as m', [request]).then((r) => r.m);
    expect(await status(request)).toBe('finding_providers');
    const ravi = matches.find((m) => m.provider_id === w.ravi);
    expect(ravi, 'Ravi Kumar should match a husker breakdown').toBeDefined();
    expect(ravi!.reasons.join(' ')).toMatch(/Rubber roll husker/);
    // The unapproved technician is never offered
    expect(matches.some((m) => m.display_name === 'Anil Goud')).toBe(false);

    await asCommit(db, customer, async (q) => {
      await q('select public.invite_provider($1, $2)', [request, w.ravi]);
      await q('select public.invite_provider($1, $2)', [request, w.company]);
    });
    expect(await status(request)).toBe('provider_contacted');
    raviInvite = (await db.query<{ id: string }>('select id from public.request_invitations where request_id = $1 and provider_profile_id = $2', [request, w.ravi])).rows[0]!.id;
    // Before accepting, the provider sees the job but not the exact address
    const preview = await as(db, raviU, async (q) => (await q<{ r: Record<string, unknown> }>('select public.get_request_for_provider($1) as r', [request])).rows[0]!.r);
    expect(JSON.stringify(preview)).not.toContain('Survey No. 88');
    await asCommit(db, raviU, (q) => q('select public.respond_to_invitation($1, true)', [raviInvite]));
    const after = await as(db, raviU, async (q) => (await q<{ r: Record<string, unknown> }>('select public.get_request_for_provider($1) as r', [request])).rows[0]!.r);
    expect(JSON.stringify(after)).toContain('Survey No. 88');
    // The accepted provider can open the customer's photo; an uninvolved technician cannot
    const sees = (u: string) => as(db, u, async (q) => (await q(`select 1 from storage.objects where bucket_id = 'request-media' and name = $1`, [`${request}/rolls.jpg`])).rows.length);
    expect(await sees(raviU)).toBe(1);
    expect(await sees(srinivasU)).toBe(0);
  });

  it('in-app chat: customer and technician talk; outsiders cannot', async () => {
    conversation = (await db.query<{ id: string }>('select id from public.conversations where request_id = $1 and provider_profile_id = $2', [request, w.ravi])).rows[0]!.id;
    await asCommit(db, raviU, (q) => q(`select public.send_message($1, 'text', 'Can you send a photo of the roll gap handle?')`, [conversation]));
    await asCommit(db, customer, (q) => q(`select public.send_message($1, 'text', 'Handle is stiff. Machine is stopped now.')`, [conversation]));
    const texts = await as(db, customer, async (q) =>
      (await q<{ body: string }>(`select body from public.messages where conversation_id = $1 and kind = 'text' order by created_at, id`, [conversation])).rows.map((m) => m.body));
    expect(texts).toEqual(['Can you send a photo of the roll gap handle?', 'Handle is stiff. Machine is stopped now.']);
    await expect(as(db, srinivasU, (q) => q(`select public.send_message($1, 'text', 'hi')`, [conversation]))).rejects.toThrow();
  });

  it('estimate and revision: the customer asks for a change; revision 1 is preserved', async () => {
    rev1 = (await one<{ id: string }>(raviU, `select public.save_estimate_draft($1, $2, null, 'repair', 'Husker roll replacement', $3::jsonb) as id`, [request, w.ravi,
      JSON.stringify({ visit_charge: '300', labour: '3000', travel: '200', scope: 'Replace both rubber rolls, free the gap adjustment, test run with paddy.',
        exclusions: 'Motor and panel work', expected_completion: 'Same day', valid_until: inDays(7) })])).id;
    await expect(as(db, customer, (q) => q('select public.send_estimate_revision($1)', [rev1]))).rejects.toThrow();
    const h1 = (await one<{ h: string }>(raviU, 'select public.send_estimate_revision($1) as h', [rev1])).h;
    expect(await status(request)).toBe('awaiting_approval');
    await asCommit(db, customer, (q) => q(`select public.decide_estimate($1, 'request_revision', $2, 'Labour seems high; please include the belt check.')`, [rev1, h1]));

    estimate = (await db.query<{ estimate_id: string }>('select estimate_id from public.estimate_revisions where id = $1', [rev1])).rows[0]!.estimate_id;
    rev2 = (await one<{ id: string }>(raviU, `select public.save_estimate_draft($1, $2, $3, 'repair', 'Husker roll replacement', $4::jsonb) as id`, [request, w.ravi, estimate,
      JSON.stringify({ visit_charge: '300', labour: '2500', travel: '200', scope: 'Replace both rubber rolls, free the gap adjustment, check belts, test run with paddy.',
        exclusions: 'Motor and panel work', expected_completion: 'Same day', valid_until: inDays(7) })])).id;
    await one(raviU, 'select public.send_estimate_revision($1) as h', [rev2]);
    const revs = await db.query<{ revision_no: number; status: string; total: string }>(
      'select revision_no, status, total::text as total from public.estimate_revisions where estimate_id = $1 order by revision_no', [estimate]);
    // Revision 1 is kept (superseded, with its own total) when revision 2 is sent
    expect(revs.rows.map((r) => [r.revision_no, r.status, r.total])).toEqual([[1, 'superseded', '3500.00'], [2, 'sent', '3000.00']]);
  });

  it('customer approval: only the customer approves, and only the exact content they saw', async () => {
    const h2 = (await db.query<{ content_hash: string }>('select content_hash from public.estimate_revisions where id = $1', [rev2])).rows[0]!.content_hash;
    for (const other of [raviU, support, admin]) {
      await expect(as(db, other, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev2, h2]))).rejects.toThrow();
    }
    await expect(as(db, customer, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev2, 'a'.repeat(64)]))).rejects.toThrow();
    await asCommit(db, customer, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev2, h2]));
    expect(await status(request)).toBe('approved');
    const sel = (await db.query<{ selected_provider_id: string }>('select selected_provider_id from public.service_requests where id = $1', [request])).rows[0]!;
    expect(sel.selected_provider_id).toBe(w.ravi);
  });

  it('parts coordination: the part cost is approved separately by the customer, then tracked to installation', async () => {
    part = (await one<{ id: string }>(raviU, 'select public.create_part_request($1, $2, $3::jsonb) as id', [request, w.ravi, JSON.stringify({
      part_name: 'Rubber roll 10 inch', part_number: 'RR-10', manufacturer_text: 'Roll supplier', quantity: '2', unit: 'pcs',
      specifications: '10 inch, as per worn roll', availability: 'in_stock', unit_price: '2400' })])).id;
    await asCommit(db, raviU, (q) => q(`select public.set_part_compatibility($1, 'confirmed_by_provider', 'Matched against the worn roll')`, [part]));
    const h = (await one<{ h: string }>(raviU, 'select public.submit_part_for_approval($1) as h', [part])).h;
    await expect(as(db, raviU, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [part, h]))).rejects.toThrow();
    await asCommit(db, customer, (q) => q(`select public.decide_part($1, true, $2, 'provider')`, [part, h]));
    for (const stage of ['arranged', 'received', 'installed']) {
      await asCommit(db, raviU, (q) => q('select public.advance_part($1, $2::public.part_stage)', [part, stage]));
    }
    const p = (await db.query<{ stage: string; total_price: string }>('select stage, total_price::text from public.part_requests where id = $1', [part])).rows[0]!;
    expect(p).toEqual({ stage: 'installed', total_price: '4800.00' });
  });

  it('job status: scheduled, site safety confirmed by both sides, travelling, arrived, work in progress', async () => {
    await asCommit(db, raviU, (q) => q('select public.schedule_job($1, $2)', [request, new Date(Date.now() + 3 * 3600000).toISOString()]));
    expect(await status(request)).toBe('scheduled');
    await asCommit(db, raviU, (q) => q(`select public.update_job_progress($1, 'provider_travelling')`, [request]));
    await asCommit(db, raviU, (q) => q(`select public.update_job_progress($1, 'provider_arrived')`, [request]));
    await expect(asCommit(db, raviU, (q) => q(`select public.update_job_progress($1, 'work_in_progress')`, [request]))).rejects.toThrow(); // safety not confirmed yet
    await asCommit(db, raviU, (q) => q('select public.acknowledge_site_safety($1, $2::jsonb)', [request, SAFETY]));
    await asCommit(db, customer, (q) => q('select public.acknowledge_site_safety($1, $2::jsonb)', [request, SAFETY]));
    await asCommit(db, raviU, (q) => q(`select public.update_job_progress($1, 'work_in_progress')`, [request]));
    for (const phase of ['before', 'after']) {
      const path = `${request}/${phase}.jpg`;
      await putObject(raviU, 'job-photos', path, 'image/jpeg');
      await asCommit(db, raviU, (q) => q('select public.add_job_photo($1, $2, $3)', [request, phase, path]));
    }
  });

  it('completion report and customer confirmation close the job', async () => {
    await asCommit(db, raviU, (q) => q('select public.submit_completion_report($1, $2::jsonb)', [request, JSON.stringify({
      fault_identified: 'Both rubber rolls worn unevenly; gap adjustment seized.',
      work_performed: 'Replaced both rolls, freed and greased the gap mechanism, checked belts, 30-minute test run with paddy.',
      remaining_issues: 'None found', recommendations: 'Check roll wear every 2 weeks during the season.', completed_on: today() })]));
    expect(await status(request)).toBe('customer_confirmation_pending');
    const report = (await db.query<{ parts_used: { part_name: string }[]; content_hash: string }>(
      'select parts_used, content_hash from public.completion_reports where request_id = $1', [request])).rows[0]!;
    expect(report.parts_used.map((p) => p.part_name)).toEqual(['Rubber roll 10 inch']);
    expect(report.content_hash).toMatch(/^[0-9a-f]{64}$/);

    await expect(as(db, raviU, (q) => q('select public.confirm_completion($1)', [request]))).rejects.toThrow();
    await asCommit(db, customer, (q) => q(`select public.confirm_completion($1, 5::smallint, 'Machine running again the same day.')`, [request]));
    expect(await status(request)).toBe('closed');

    const history = (await db.query<{ to_status: string }>('select to_status::text from public.job_status_events where request_id = $1 order by id', [request])).rows.map((e) => e.to_status);
    expect(history).toEqual([
      'submitted', 'finding_providers', 'provider_contacted', 'discussion', 'estimate_sent', 'awaiting_approval', 'discussion',
      'estimate_sent', 'awaiting_approval', 'approved', 'scheduled', 'provider_travelling', 'provider_arrived', 'work_in_progress',
      'work_completed', 'customer_confirmation_pending', 'closed',
    ]);
  });

  it('complaint handling: support acknowledges, both sides are heard, it is resolved and kept on record', async () => {
    complaint = (await one<{ id: string }>(customer,
      `select public.open_complaint($1, 'work_quality', 'Two days later the husker is slipping again at full load.', $2) as id`, [request, w.ravi])).id;
    const c0 = (await db.query<{ status: string; ack_due_at: string; created_at: string }>('select status, ack_due_at, created_at from public.complaints where id = $1', [complaint])).rows[0]!;
    expect(c0.status).toBe('open');
    expect(new Date(c0.ack_due_at).getTime() - new Date(c0.created_at).getTime()).toBe(24 * 3600000);

    // The provider named in the complaint can see it and respond; another technician cannot
    expect(await as(db, raviU, async (q) => (await q('select 1 from public.complaints where id = $1', [complaint])).rows.length)).toBe(1);
    expect(await as(db, srinivasU, async (q) => (await q('select 1 from public.complaints where id = $1', [complaint])).rows.length)).toBe(0);

    await asCommit(db, support, (q) => q(`select public.acknowledge_complaint($1, 'We have received this and contacted the provider.')`, [complaint]));
    await asCommit(db, raviU, (q) => q(`select public.add_complaint_message($1, 'I will visit tomorrow to check belt tension at no extra labour.')`, [complaint]));
    await asCommit(db, support, (q) => q(`select public.add_complaint_message($1, 'Provider offered a revisit; customer agreed by phone.', true)`, [complaint]));
    // Internal staff notes are not shown to the parties
    const customerView = await as(db, customer, async (q) => (await q<{ body: string }>('select body from public.complaint_events where complaint_id = $1', [complaint])).rows.map((e) => e.body));
    expect(customerView.join(' ')).toContain('I will visit tomorrow');
    expect(customerView.join(' ')).not.toContain('customer agreed by phone');

    await expect(as(db, customer, (q) => q(`select public.set_complaint_status($1, 'resolved', 'resolved_between_parties', 'x')`, [complaint]))).rejects.toThrow();
    await asCommit(db, support, (q) => q(`select public.set_complaint_status($1, 'resolved', 'resolved_between_parties', 'Provider revisited and re-tensioned the belts.')`, [complaint]));
    await asCommit(db, support, (q) => q(`select public.set_complaint_status($1, 'closed')`, [complaint]));
    const c1 = (await db.query<{ status: string; resolution: string }>('select status, resolution from public.complaints where id = $1', [complaint])).rows[0]!;
    expect(c1).toEqual({ status: 'closed', resolution: 'resolved_between_parties' });
    await expect(db.query('delete from public.complaints where id = $1', [complaint])).rejects.toThrow();

    // Every step is in the audit log
    const actions = (await db.query<{ action: string }>(
      `select distinct action from public.audit_log where entity_id in ($1, $2, $3, $4, $5)`, [request, complaint, rev1, rev2, part])).rows.map((a) => a.action);
    expect(actions.length).toBeGreaterThanOrEqual(5);
  });
});

// =============================================================================
describe('general industry pilot', () => {
  let customer: string;
  let factory: string;
  let techU: string;
  let tech: string;

  beforeAll(async () => {
    // A Hyderabad-area engineering technician, verified by staff
    techU = await createUser(db, '919100000002');
    await asCommit(db, techU, (q) => q(`select public.register_role('technician')`));
    await acceptTerms(techU);
    tech = (await db.query<{ id: string }>(`select id from public.provider_profiles where user_id = $1 and kind = 'individual'`, [techU])).rows[0]!.id;
    await asCommit(db, techU, async (q) => {
      await q(`update public.provider_profiles set display_name = 'Imran Engineering Services', bio = 'CNC, drives, PLCs, pumps and compressors.',
                 years_experience = 14, languages = '{te,hi,en}', base_locality = 'Patancheru', base_district = 'Sangareddy',
                 base_latitude = 17.53, base_longitude = 78.26, service_radius_km = 60, service_districts = '{Sangareddy,Hyderabad,Medchal-Malkajgiri}'
               where id = $1`, [tech]);
      for (const k of ['machine.vmc', 'machine.electric_motor', 'machine.vfd', 'machine.centrifugal_pump', 'machine.plc_system', 'machine.air_compressor']) {
        await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience, level) values ($1, $2, 10, 'expert')`, [tech, await key(k)]);
      }
    });
    const path = `${tech}/identity.pdf`;
    await putObject(techU, 'provider-documents', path, 'application/pdf', 100);
    const doc = (await one<{ id: string }>(techU, `select public.register_provider_document($1, 'identity', $2, 'Identity (test)', 'application/pdf', 100) as id`, [tech, path])).id;
    await asCommit(db, techU, (q) => q('select public.submit_provider_profile($1)', [tech]));
    await asCommit(db, admin, async (q) => {
      await q(`select public.record_verification_check($1, 'identity', true, null, null, $2, 'Checked against original')`, [tech, doc]);
      await q(`select public.set_provider_status($1, 'approved')`, [tech]);
    });

    customer = await createUser(db, '919100000003');
    await asCommit(db, customer, (q) => q(`select public.register_role('customer')`));
    await acceptTerms(customer);
    factory = (await one<{ id: string }>(customer,
      `insert into public.factories (name, address_line, locality, district, city, pincode, latitude, longitude)
       values ('Pilot Precision Components', 'Plot 21, IDA Patancheru', 'Patancheru', 'Sangareddy', 'Hyderabad', '502319', 17.53, 78.27) returning id`)).id;
  });

  const SCENARIOS = [
    { name: 'CNC machine breakdown', machine: 'machine.vmc', type: 'breakdown', symptoms: '{machine_stopped,automation_fault}', text: 'VMC spindle alarm, axis will not home after power cut.' },
    { name: 'motor / VFD fault', machine: 'machine.vfd', type: 'breakdown', symptoms: '{electrical_fault,machine_stopped}', text: 'VFD trips on overcurrent when the conveyor motor starts.' },
    { name: 'pump repair', machine: 'machine.centrifugal_pump', type: 'breakdown', symptoms: '{low_output,unusual_noise}', text: 'Cooling water pump noisy with low delivery pressure.' },
    { name: 'PLC troubleshooting', machine: 'machine.plc_system', type: 'breakdown', symptoms: '{automation_fault}', text: 'PLC on the washing line shows an I/O module fault intermittently.' },
    { name: 'compressor maintenance', machine: 'machine.air_compressor', type: 'maintenance', symptoms: '{regular_service}', text: 'Screw compressor due for 4000-hour service: oil, filters, separator.' },
  ] as const;

  it.each(SCENARIOS)('$name: request, discovery, acceptance, estimate and approval', async (s) => {
    const r = (await one<{ id: string }>(customer, `select public.create_service_request($1, $2::public.service_type, $3, $4, null, $5) as id`,
      [factory, s.type, s.text, s.symptoms, await key(s.machine)])).id;
    const matches = (await one<{ m: Match[] }>(customer, 'select public.match_providers($1) as m', [r])).m;
    expect(matches.map((m) => m.provider_id), `${s.name}: the verified specialist should be discovered`).toContain(tech);
    // Rice-mill specialists far away are not offered for factory automation work
    expect(matches.map((m) => m.provider_id)).not.toContain(w.srinivas);

    await asCommit(db, customer, (q) => q('select public.invite_provider($1, $2)', [r, tech]));
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where request_id = $1', [r])).rows[0]!.id;
    await asCommit(db, techU, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
    const conv = (await db.query<{ id: string }>('select id from public.conversations where request_id = $1', [r])).rows[0]!.id;
    await asCommit(db, techU, (q) => q(`select public.send_message($1, 'text', 'I can inspect today afternoon.')`, [conv]));

    // Breakdowns start with an inspection visit (inspection fee only); maintenance is quoted as repair work
    const kind = s.type === 'maintenance' ? 'repair' : 'inspection';
    const fields = kind === 'inspection' ? { inspection_fee: '800' } : { visit_charge: '800', labour: '1500' };
    const rev = (await one<{ id: string }>(techU, `select public.save_estimate_draft($1, $2, null, $3::public.estimate_kind, $4, $5::jsonb) as id`, [r, tech, kind, s.name,
      JSON.stringify({ ...fields, scope: `Inspect and diagnose: ${s.text}`, valid_until: inDays(5) })])).id;
    const h = (await one<{ h: string }>(techU, 'select public.send_estimate_revision($1) as h', [rev])).h;
    await asCommit(db, customer, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev, h]));
    expect(await status(r)).toBe('approved');
  });
});
