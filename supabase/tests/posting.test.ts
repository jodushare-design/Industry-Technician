/**
 * Posting a request when matching finds nobody, and provider offers.
 * Builds on the demo world (scripts/demo/seed.mjs).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ES module shared with the demo server
import { seedDemo } from '../../scripts/demo/seed.mjs';
import { as, asCommit, createTestDb, createUser, type Db } from './helpers/db';

type Seeded = { users: Record<string, string>; factory: string; ravi: string; company: string };
type Open = { request_id: string; provider_id: string; machine_type: string; locality: string; district: string; distance_km: number; my_offer: string | null } & Record<string, unknown>;

let db: Db;
let w: Seeded;
let customer: string; // Lakshmi
let raviU: string;
let companyAdmin: string;
let otherCustomer: string;
let farTechU: string;
let farTech: string;
let request: string;

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const one = async <T>(user: string, sql: string, params: unknown[] = []) => asCommit(db, user, async (q) => (await q<T>(sql, params)).rows[0]!);
const openFor = (user: string) => as(db, user, async (q) => (await q<{ r: Open[] }>('select public.list_open_requests() as r')).rows[0]!.r);

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

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  w = (await seedDemo({ db, asCaller, storageDir: mkdtempSync(join(tmpdir(), 'itm-post-')) })) as Seeded;
  customer = w.users['9000000001']!;
  raviU = w.users['9000000002']!;
  companyAdmin = w.users['9000000003']!;
  const admin = w.users['9000000009']!;

  // A weighbridge technician in Warangal: about 120 km from the mill, beyond his 80 km radius
  farTechU = await createUser(db, '919200000001');
  await asCommit(db, farTechU, (q) => q(`select public.register_role('technician')`));
  await acceptTerms(farTechU);
  farTech = (await db.query<{ id: string }>(`select id from public.provider_profiles where user_id = $1 and kind = 'individual'`, [farTechU])).rows[0]!.id;
  await asCommit(db, farTechU, async (q) => {
    await q(`update public.provider_profiles set display_name = 'Warangal Weighing Services', years_experience = 9, languages = '{te}',
               base_locality = 'Hanamkonda', base_district = 'Warangal', base_latitude = 17.97, base_longitude = 79.59,
               service_radius_km = 80, service_districts = '{Warangal}' where id = $1`, [farTech]);
    await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 9)`, [farTech, await key('machine.weighbridge')]);
  });
  await asCommit(db, farTechU, (q) => q('insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', ['provider-documents', `${farTech}/id.pdf`, farTechU]));
  const doc = (await one<{ id: string }>(farTechU, `select public.register_provider_document($1, 'identity', $2, 'Identity', 'application/pdf', 100) as id`, [farTech, `${farTech}/id.pdf`])).id;
  await asCommit(db, farTechU, (q) => q('select public.submit_provider_profile($1)', [farTech]));
  await asCommit(db, admin, async (q) => {
    await q(`select public.record_verification_check($1, 'identity', true, null, null, $2, 'ok')`, [farTech, doc]);
    await q(`select public.set_provider_status($1, 'approved')`, [farTech]);
  });

  otherCustomer = await createUser(db, '919200000002');
  await asCommit(db, otherCustomer, (q) => q(`select public.register_role('customer')`));
  await acceptTerms(otherCustomer);

  request = (await one<{ id: string }>(customer,
    `select public.create_service_request($1, 'breakdown', 'Weighbridge display shows wrong weight after the storm.', '{electrical_fault}', null, $2) as id`,
    [w.factory, await key('machine.weighbridge')])).id;
}, 120_000);

describe('posting a request when nobody matches', () => {
  it('matching finds no provider within travel distance', async () => {
    const m = (await one<{ m: unknown[] }>(customer, 'select public.match_providers($1) as m', [request])).m;
    expect(m).toEqual([]);
  });

  it('only the customer can post; posting is invisible until then', async () => {
    expect((await openFor(farTechU)).map((o) => o.request_id)).not.toContain(request);
    for (const u of [raviU, otherCustomer, farTechU]) {
      await expect(as(db, u, (q) => q('select public.post_service_request($1)', [request]))).rejects.toThrow(/not allowed/);
    }
    const n = (await one<{ n: number }>(customer, 'select public.post_service_request($1) as n', [request])).n;
    expect(n).toBe(1);
    const note = await db.query(`select 1 from public.notifications where user_id = $1 and kind = 'request_posted'`, [farTechU]);
    expect(note.rows.length).toBe(1);
  });

  it('suitable providers in a wider area see it without the customer’s name or address; others do not', async () => {
    const list = await openFor(farTechU);
    const item = list.find((o) => o.request_id === request)!;
    expect(item).toMatchObject({ provider_id: farTech, machine_type: 'Weighbridge', locality: 'Miryalaguda', district: 'Nalgonda', my_offer: null });
    expect(item.distance_km).toBeGreaterThan(100);
    const text = JSON.stringify(item);
    expect(text).not.toContain('Lakshmi');
    expect(text).not.toContain('Survey No.');
    expect(text).not.toContain('Sri Lakshmi Rice Mill');
    // Not a weighbridge technician; not a provider at all
    expect((await openFor(raviU)).map((o) => o.request_id)).not.toContain(request);
    expect(await openFor(otherCustomer)).toEqual([]);
    // Still no direct access to the request row
    expect(await as(db, farTechU, async (q) => (await q('select 1 from public.service_requests where id = $1', [request])).rows.length)).toBe(0);
  });

  it('a provider offers to help; the customer is notified; others cannot offer', async () => {
    await expect(as(db, raviU, (q) => q('select public.offer_to_help($1, $2)', [request, w.ravi]))).rejects.toThrow(/request_not_posted/);
    await expect(as(db, raviU, (q) => q('select public.offer_to_help($1, $2)', [request, farTech]))).rejects.toThrow(/not allowed/);
    await asCommit(db, farTechU, (q) => q(`select public.offer_to_help($1, $2, 'I service this make. Can come tomorrow morning.')`, [request, farTech]));
    await expect(as(db, farTechU, (q) => q('select public.offer_to_help($1, $2)', [request, farTech]))).rejects.toThrow(/already_offered/);
    expect((await openFor(farTechU)).find((o) => o.request_id === request)!.my_offer).toBe('pending');

    const offers = await as(db, customer, async (q) => (await q<{ provider_profile_id: string; message: string; status: string }>(
      'select provider_profile_id, message, status from public.request_offers where request_id = $1', [request])).rows);
    expect(offers).toEqual([{ provider_profile_id: farTech, message: 'I service this make. Can come tomorrow morning.', status: 'pending' }]);
    expect(await as(db, otherCustomer, async (q) => (await q('select 1 from public.request_offers')).rows.length)).toBe(0);
    const note = await db.query(`select link from public.notifications where user_id = $1 and kind = 'offer_received' and link like $2`, [customer, `%${request}%`]);
    expect(note.rows).toEqual([{ link: `/requests/${request}#offers` }]);
  });

  it('only the customer answers; accepting invites the provider, who then accepts as usual', async () => {
    const offer = (await db.query<{ id: string }>('select id from public.request_offers where request_id = $1', [request])).rows[0]!.id;
    for (const u of [farTechU, raviU, otherCustomer]) {
      await expect(as(db, u, (q) => q('select public.respond_to_offer($1, true)', [offer]))).rejects.toThrow(/not allowed/);
    }
    await asCommit(db, customer, (q) => q('select public.respond_to_offer($1, true)', [offer]));
    const inv = (await db.query<{ id: string; status: string }>('select id, status from public.request_invitations where request_id = $1 and provider_profile_id = $2', [request, farTech])).rows[0]!;
    expect(inv.status).toBe('invited');
    // Once invited, it leaves the provider's open list (it is in their normal inbox)
    expect((await openFor(farTechU)).map((o) => o.request_id)).not.toContain(request);
    await asCommit(db, farTechU, (q) => q('select public.respond_to_invitation($1, true)', [inv.id]));
    const seen = await as(db, farTechU, async (q) => (await q<{ r: Record<string, unknown> }>('select public.get_request_for_provider($1) as r', [request])).rows[0]!.r);
    expect(JSON.stringify(seen)).toContain('Survey No. 214');
  });

  it('posting ends when the customer selects a provider; the customer can also stop it', async () => {
    await asCommit(db, customer, (q) => q('select public.select_provider($1, $2)', [request, farTech]));
    expect((await db.query<{ posted_at: string | null }>('select posted_at from public.service_requests where id = $1', [request])).rows[0]!.posted_at).toBeNull();

    const r2 = (await one<{ id: string }>(customer,
      `select public.create_service_request($1, 'maintenance', 'Annual calibration of the weighbridge before the season.', '{regular_service}', null, $2) as id`,
      [w.factory, await key('machine.weighbridge')])).id;
    await asCommit(db, customer, (q) => q('select public.post_service_request($1)', [r2]));
    expect((await openFor(farTechU)).map((o) => o.request_id)).toContain(r2);
    await asCommit(db, customer, (q) => q('select public.unpost_service_request($1)', [r2]));
    expect((await openFor(farTechU)).map((o) => o.request_id)).not.toContain(r2);
    await expect(as(db, farTechU, (q) => q('select public.offer_to_help($1, $2)', [r2, farTech]))).rejects.toThrow(/request_not_posted/);
  });

  it('a declined offer stays on record; the provider can withdraw a pending offer', async () => {
    const r3 = (await one<{ id: string }>(customer,
      `select public.create_service_request($1, 'inspection', 'Weighbridge load cells need inspection after flooding.', '{other}', null, $2) as id`,
      [w.factory, await key('machine.weighbridge')])).id;
    await asCommit(db, customer, (q) => q('select public.post_service_request($1)', [r3]));
    const o = (await one<{ id: string }>(farTechU, 'select public.offer_to_help($1, $2) as id', [r3, farTech])).id;
    await asCommit(db, farTechU, (q) => q('select public.withdraw_offer($1)', [o]));
    await expect(as(db, customer, (q) => q('select public.respond_to_offer($1, false)', [o]))).rejects.toThrow(/offer_decided/);
    await asCommit(db, farTechU, (q) => q(`select public.offer_to_help($1, $2, 'Offer again')`, [r3, farTech]));
    await asCommit(db, customer, (q) => q('select public.respond_to_offer($1, false)', [o]));
    const st = (await db.query<{ status: string }>('select status from public.request_offers where id = $1', [o])).rows[0]!.status;
    expect(st).toBe('declined');
    await expect(as(db, customer, (q) => q('delete from public.request_offers where id = $1', [o]))).rejects.toThrow(/permission denied/);
  });

  it('a company is shown open requests only to its company admin', async () => {
    // Alpha Mill Services works on whiteners; post a whitener request far from its base but inside twice its radius
    const r4 = (await one<{ id: string }>(customer,
      `select public.create_service_request($1, 'breakdown', 'Whitener screen torn, rice breaking badly.', '{low_output}', null, $2) as id`,
      [w.factory, await key('machine.rice_whitener')])).id;
    await asCommit(db, customer, (q) => q('select public.post_service_request($1)', [r4]));
    expect((await openFor(companyAdmin)).some((o) => o.request_id === r4 && o.provider_id === w.company)).toBe(true);
    const employee = w.users['9000000004']!;
    expect((await openFor(employee)).map((o) => o.request_id)).not.toContain(r4);
  });
});
