import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let customer: string;
let tech: string;
let rival: string;
let stranger: string;
let support: string;
let admin: string;
let techProfile: string;
let rivalProfile: string;
let request: string;

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const status = async (id = request) => (await db.query<{ status: string }>('select status from public.service_requests where id = $1', [id])).rows[0]!.status;
const SAFETY = JSON.stringify({ access: true, isolation: true, permits: true, ppe: true, site_contact: true });
const valid = () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

async function newApprovedJob(): Promise<string> {
  const factory = (await db.query<{ id: string }>('select id from public.factories where owner_id = $1 limit 1', [customer])).rows[0]!.id;
  const r = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Whitener vibrating badly today', '{vibration}', null, $2) as id`, [factory, await key('machine.rice_whitener')])).rows[0]!.id,
  );
  await asCommit(db, customer, async (q) => {
    await q('select public.invite_provider($1, $2)', [r, techProfile]);
    await q('select public.invite_provider($1, $2)', [r, rivalProfile]);
  });
  const inv = (await db.query<{ id: string }>('select id from public.request_invitations where request_id = $1 and provider_profile_id = $2', [r, techProfile])).rows[0]!.id;
  await asCommit(db, tech, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
  const rev = await asCommit(db, tech, async (q) =>
    (await q<{ id: string }>(`select public.save_estimate_draft($1, $2, null, 'repair', null, $3::jsonb) as id`, [r, techProfile,
      JSON.stringify({ labour: '1800', scope: 'Balance rotor, replace bearings, test run.', valid_until: valid() })])).rows[0]!.id,
  );
  const h = await asCommit(db, tech, async (q) => (await q<{ h: string }>('select public.send_estimate_revision($1) as h', [rev])).rows[0]!.h);
  await asCommit(db, customer, (q) => q(`select public.decide_estimate($1, 'accept', $2)`, [rev, h]));
  return r;
}

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`);
  customer = await createUser(db);
  tech = await createUser(db);
  rival = await createUser(db);
  stranger = await createUser(db);
  support = await createUser(db);
  admin = await createUser(db);
  await grantRole(db, support, 'support_agent');
  await grantRole(db, admin, 'platform_admin');
  await asCommit(db, customer, (q) => q(`select public.register_role('customer')`));
  for (const t of [tech, rival]) await asCommit(db, t, (q) => q(`select public.register_role('technician')`));
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Ravi Tech' where user_id = $1`, [tech]);
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Rival Tech' where user_id = $1`, [rival]);
  techProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [tech])).rows[0]!.id;
  rivalProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [rival])).rows[0]!.id;
  await asCommit(db, customer, (q) => q(`insert into public.factories (name, locality) values ('Mill', 'Miryalaguda')`));
  request = await newApprovedJob();
});

describe('job progress', () => {
  it('only the selected provider schedules and updates progress', async () => {
    const when = new Date(Date.now() + 86400000).toISOString();
    for (const who of [customer, rival, stranger, admin]) {
      await expect(as(db, who, (q) => q('select public.schedule_job($1, $2)', [request, when]))).rejects.toThrow(/only the selected provider/);
    }
    await asCommit(db, tech, (q) => q(`select public.schedule_job($1, $2, 'Morning visit')`, [request, when]));
    expect(await status()).toBe('scheduled');
    await asCommit(db, tech, (q) => q(`select public.update_job_progress($1, 'provider_travelling')`, [request]));
    await asCommit(db, tech, (q) => q(`select public.update_job_progress($1, 'provider_arrived')`, [request]));
    await expect(as(db, customer, (q) => q(`select public.update_job_progress($1, 'work_in_progress')`, [request]))).rejects.toThrow(/only the selected provider/);
  });

  it('work cannot start before the provider confirms the site-safety checklist (every item)', async () => {
    await expect(asCommit(db, tech, (q) => q(`select public.update_job_progress($1, 'work_in_progress')`, [request]))).rejects.toThrow(/ITM:safety_ack_required/);
    await expect(asCommit(db, tech, (q) => q(`select public.acknowledge_site_safety($1, '{"access": true}'::jsonb)`, [request]))).rejects.toThrow(/ITM:checklist_incomplete/);
    await asCommit(db, tech, (q) => q(`select public.acknowledge_site_safety($1, $2::jsonb)`, [request, SAFETY]));
    await asCommit(db, customer, (q) => q(`select public.acknowledge_site_safety($1, $2::jsonb)`, [request, SAFETY]));
    await asCommit(db, tech, (q) => q(`select public.update_job_progress($1, 'work_in_progress')`, [request]));
    expect(await status()).toBe('work_in_progress');
    await expect(asCommit(db, tech, (q) => q(`select public.update_job_progress($1, 'closed')`, [request]))).rejects.toThrow(/ITM:not_a_provider_step/);
  });

  it('job photos: provider uploads before/after; job parties read; others cannot', async () => {
    const path = `${request}/${crypto.randomUUID()}.jpg`;
    await asCommit(db, tech, async (q) => {
      await q(`insert into storage.objects (bucket_id, name) values ('job-photos', $1)`, [path]);
      await q(`select public.add_job_photo($1, 'before', $2)`, [request, path]);
    });
    expect((await as(db, customer, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(1);
    expect((await as(db, stranger, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
    await expect(as(db, customer, (q) => q(`insert into storage.objects (bucket_id, name) values ('job-photos', $1)`, [`${request}/c.jpg`]))).rejects.toThrow(/row-level security/);
  });
});

describe('completion report and confirmation', () => {
  it('the provider submits an immutable, fingerprinted report listing installed parts; job waits for the customer', async () => {
    await expect(as(db, customer, (q) => q(`select public.submit_completion_report($1, '{}'::jsonb)`, [request]))).rejects.toThrow(/only the selected provider/);
    await asCommit(db, tech, (q) =>
      q(`select public.submit_completion_report($1, $2::jsonb)`, [request, JSON.stringify({
        fault_identified: 'Worn rotor bearings and rotor imbalance', work_performed: 'Replaced both bearings, balanced rotor, test run 30 min',
        remaining_issues: 'Screen is near end of life', recommendations: 'Replace screen within a month', completed_on: new Date().toISOString().slice(0, 10),
      })]),
    );
    expect(await status()).toBe('customer_confirmation_pending');
    const rep = await as(db, customer, (q) => q<{ fault_identified: string; content_hash: string; parts_used: unknown[] }>('select fault_identified, content_hash, parts_used from public.completion_reports where request_id = $1', [request]));
    expect(rep.rows[0]).toMatchObject({ fault_identified: 'Worn rotor bearings and rotor imbalance', parts_used: [] });
    expect(rep.rows[0]!.content_hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(db.query(`update public.completion_reports set fault_identified = 'x' where request_id = $1`, [request])).rejects.toThrow(/ITM:audit_append_only/);
    await expect(asCommit(db, tech, (q) => q(`select public.submit_completion_report($1, '{"fault_identified":"again","work_performed":"again"}'::jsonb)`, [request]))).rejects.toThrow(/ITM:not_in_progress/);
  });

  it('only the customer confirms; confirming closes the job and stores private feedback', async () => {
    await expect(as(db, tech, (q) => q('select public.confirm_completion($1)', [request]))).rejects.toThrow(/only the customer/);
    await asCommit(db, customer, (q) => q(`select public.confirm_completion($1, 5::smallint, 'Quick and tidy')`, [request]));
    expect(await status()).toBe('closed');
    expect((await as(db, tech, (q) => q('select 1 from public.job_feedback'))).rows).toHaveLength(0); // feedback is not shown to providers
    expect((await as(db, support, (q) => q<{ rating: number }>('select rating from public.job_feedback where request_id = $1', [request]))).rows[0]!.rating).toBe(5);
  });
});

describe('concerns, complaints and disputes', () => {
  let job2: string;
  let complaint: string;

  it('a concern after the report disputes the job and opens a complaint with 24 h / 15 day deadlines', async () => {
    job2 = await newApprovedJob();
    await asCommit(db, tech, async (q) => {
      await q('select public.acknowledge_site_safety($1, $2::jsonb)', [job2, SAFETY]);
      await q(`select public.update_job_progress($1, 'work_in_progress')`, [job2]);
      await q(`select public.submit_completion_report($1, '{"fault_identified":"Loose mounting","work_performed":"Tightened mounting bolts"}'::jsonb)`, [job2]);
    });
    await expect(as(db, stranger, (q) => q(`select public.report_concern($1, 'work_quality', 'Not fixed properly at all')`, [job2]))).rejects.toThrow(/only the customer/);
    complaint = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.report_concern($1, 'work_quality', 'Vibration came back the same evening') as id`, [job2])).rows[0]!.id,
    );
    expect(await status(job2)).toBe('disputed');
    const c = (await db.query<{ reference: string; against_provider_id: string; ack: string; res: string; created_at: string }>(
      `select reference, against_provider_id, extract(epoch from ack_due_at - created_at)::int::text ack, extract(epoch from resolve_due_at - created_at)::int::text res, created_at from public.complaints where id = $1`, [complaint],
    )).rows[0]!;
    expect(c.reference).toMatch(/^CMP-\d{4}-\d{5}$/);
    expect(c.against_provider_id).toBe(techProfile);
    expect(Number(c.ack)).toBe(24 * 3600);
    expect(Number(c.res)).toBe(15 * 86400);
  });

  it('complaint parties are the complainant, the job customer and the named provider — and staff', async () => {
    expect((await as(db, tech, (q) => q('select 1 from public.complaints where id = $1', [complaint]))).rows).toHaveLength(1);
    expect((await as(db, support, (q) => q('select 1 from public.complaints where id = $1', [complaint]))).rows).toHaveLength(1);
    for (const who of [rival, stranger]) {
      expect((await as(db, who, (q) => q('select 1 from public.complaints where id = $1', [complaint]))).rows).toHaveLength(0);
    }
    await expect(as(db, stranger, (q) => q(`select public.open_complaint($1, 'other', 'I was never part of this job')`, [job2]))).rejects.toThrow(/only complain about jobs you are part of/);
  });

  it('staff acknowledge and work the complaint; internal notes are hidden from the parties', async () => {
    await expect(as(db, customer, (q) => q('select public.acknowledge_complaint($1)', [complaint]))).rejects.toThrow(/staff only/);
    await asCommit(db, support, async (q) => {
      await q('select public.acknowledge_complaint($1)', [complaint]);
      await q(`select public.add_complaint_message($1, 'Provider said bearing grade was wrong; checking with both.', true)`, [complaint]);
      await q(`select public.add_complaint_message($1, 'We have asked the provider to revisit. Please share a video of the vibration.')`, [complaint]);
    });
    await asCommit(db, tech, (q) => q(`select public.add_complaint_message($1, 'I can revisit tomorrow at 10.')`, [complaint]));
    const seen = await as(db, customer, (q) => q<{ kind: string }>('select kind from public.complaint_events where complaint_id = $1 order by id', [complaint]));
    expect(seen.rows.map((r) => r.kind)).toEqual(['created', 'acknowledged', 'message', 'message']);
    await expect(as(db, customer, (q) => q(`select public.add_complaint_message($1, 'x', true)`, [complaint]))).rejects.toThrow(/staff only/);
  });

  it('staff can read the job conversation only through the complaint, and every view is recorded', async () => {
    const conv = (await db.query<{ id: string }>('select id from public.conversations where request_id = $1 and provider_profile_id = $2', [job2, techProfile])).rows[0]!.id;
    expect((await as(db, support, (q) => q('select 1 from public.messages where conversation_id = $1', [conv]))).rows).toHaveLength(0);
    const msgs = await asCommit(db, support, async (q) => (await q<{ m: unknown[] }>('select public.staff_read_conversation($1, $2) as m', [complaint, conv])).rows[0]!.m);
    expect(msgs.length).toBeGreaterThan(0);
    const otherConv = (await db.query<{ id: string }>('select id from public.conversations where request_id = $1 limit 1', [request])).rows[0]!.id;
    await expect(as(db, support, (q) => q('select public.staff_read_conversation($1, $2)', [complaint, otherConv]))).rejects.toThrow(/ITM:not_linked/);
    const audit = await db.query<{ n: number }>(`select count(*)::int n from public.audit_log where action = 'complaint.conversation_viewed' and entity_id = $1`, [conv]);
    expect(audit.rows[0]!.n).toBe(1);
  });

  it('a disputed job closes only via staff after the complaint is resolved with a handling note', async () => {
    await expect(as(db, customer, (q) => q(`select public.close_disputed_job($1, 'done')`, [job2]))).rejects.toThrow(/staff only/);
    await expect(as(db, support, (q) => q(`select public.close_disputed_job($1, 'done')`, [job2]))).rejects.toThrow(/ITM:complaint_open/);
    await expect(as(db, support, (q) => q(`select public.set_complaint_status($1, 'resolved')`, [complaint]))).rejects.toThrow(/ITM:resolution_required/);
    await asCommit(db, support, async (q) => {
      await q(`select public.set_complaint_status($1, 'resolved', 'resolved_between_parties', 'Provider revisited and replaced the bearings at no charge, as agreed between them.')`, [complaint]);
      await q(`select public.close_disputed_job($1, 'Resolved between the parties')`, [job2]);
    });
    expect(await status(job2)).toBe('closed');
  });
});

describe('safety incidents and retention', () => {
  it('a safety incident is critical, escalated and alerts every platform admin and support agent', async () => {
    const id = await asCommit(db, customer, async (q) =>
      (await q<{ id: string }>(`select public.open_complaint($1, 'safety_incident', 'Electric shock to our operator during the visit') as id`, [request])).rows[0]!.id,
    );
    const c = (await db.query<{ severity: string; escalated: boolean }>('select severity, escalated from public.complaints where id = $1', [id])).rows[0]!;
    expect(c).toEqual({ severity: 'critical', escalated: true });
    for (const s of [support, admin]) {
      expect((await as(db, s, (q) => q(`select 1 from public.notifications where kind = 'incident'`))).rows).toHaveLength(1);
    }
  });

  it('complaints, their history and attachments can never be deleted — including after suspension', async () => {
    await db.query(`update public.profiles set account_status = 'suspended' where id = $1`, [tech]);
    await expect(db.query('delete from public.complaints')).rejects.toThrow(/ITM:audit_append_only/);
    await expect(db.query('delete from public.complaint_events')).rejects.toThrow(/ITM:audit_append_only/);
    await expect(db.query('update public.complaint_events set body = null')).rejects.toThrow(/ITM:audit_append_only/);
    await expect(as(db, customer, (q) => q('delete from public.complaints'))).rejects.toThrow(/permission denied/);
    expect((await db.query<{ n: number }>('select count(*)::int n from public.complaints')).rows[0]!.n).toBe(2);
  });
});
