import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let admin: string;
let support: string;
let custA: string;
let custB: string;
let techA: string;
let techB: string;
let compAdminA: string;
let compAdminB: string;
let employee: string;
let outsider: string;
let orgA: string;
let orgB: string;

const PHONE_EMPLOYEE = '919000000501';

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const profileOf = async (userId: string, kind = 'individual') =>
  (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1 and kind = $2', [userId, kind])).rows[0]!.id;
const companyProfile = async (org: string) =>
  (await db.query<{ id: string }>(`select id from public.provider_profiles where organization_id = $1 and kind = 'company'`, [org])).rows[0]!.id;

async function acceptAllTerms(user: string) {
  await asCommit(db, user, async (q) => {
    const ctx = (await q<{ c: { pending_documents: { id: string }[] } }>('select public.get_my_context() as c')).rows[0]!.c;
    for (const d of ctx.pending_documents) await q(`select public.accept_legal_document($1, 'web')`, [d.id]);
  });
}

async function completeIndividual(user: string, name: string) {
  const id = await profileOf(user);
  await asCommit(db, user, async (q) => {
    await q(
      `update public.provider_profiles set display_name = $2, languages = '{te,en}', base_locality = 'Miryalaguda',
         base_district = 'Nalgonda', service_radius_km = 60 where id = $1`,
      [id, name],
    );
    await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience, level) values ($1, $2, 8, 'expert')`, [
      id,
      await key('machine.rubber_roll_husker'),
    ]);
  });
  await acceptAllTerms(user);
  return id;
}

/** Upload a file as `user` into the provider folder and register it. */
async function uploadDoc(user: string, profile: string, type: string, title: string, mime = 'application/pdf', validUntil: string | null = null) {
  const path = `${profile}/${crypto.randomUUID()}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`;
  return asCommit(db, user, async (q) => {
    await q(`insert into storage.objects (bucket_id, name) values ('provider-documents', $1)`, [path]);
    const id = (await q<{ id: string }>(`select public.register_provider_document($1, $2::public.provider_document_type, $3, $4, $5, 1000, null, $6::date) as id`, [
      profile, type, path, title, mime, validUntil,
    ])).rows[0]!.id;
    return { id, path };
  });
}

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`); // starter taxonomy approved for these tests
  admin = await createUser(db);
  support = await createUser(db);
  custA = await createUser(db);
  custB = await createUser(db);
  techA = await createUser(db);
  techB = await createUser(db);
  compAdminA = await createUser(db);
  compAdminB = await createUser(db);
  employee = await createUser(db, PHONE_EMPLOYEE);
  outsider = await createUser(db);
  await grantRole(db, admin, 'platform_admin');
  await grantRole(db, support, 'support_agent');
  for (const u of [custA, custB]) await asCommit(db, u, (q) => q(`select public.register_role('customer')`));
  for (const u of [techA, techB]) await asCommit(db, u, (q) => q(`select public.register_role('technician')`));
  orgA = (await asCommit(db, compAdminA, (q) => q<{ id: string }>(`select public.create_organization('Alpha Mill Services') as id`))).rows[0]!.id;
  orgB = (await asCommit(db, compAdminB, (q) => q<{ id: string }>(`select public.create_organization('Beta Engineering') as id`))).rows[0]!.id;
});

describe('customers: factories and machines', () => {
  let factoryA: string;

  it('a customer adds factories and machines (generic machine allowed)', async () => {
    factoryA = await asCommit(db, custA, async (q) => {
      const f = (await q<{ id: string }>(
        `insert into public.factories (name, locality, district, pincode, latitude, longitude)
         values ('Sri Lakshmi Rice Mill', 'Miryalaguda', 'Nalgonda', '508207', 16.872, 79.563) returning id`,
      )).rows[0]!.id;
      await q(`insert into public.factories (name, locality) values ('Second unit', 'Suryapet')`);
      await q(`insert into public.customer_machines (factory_id, machine_type_id, label) values ($1, $2, 'Husker 1')`, [f, await key('machine.rubber_roll_husker')]);
      await q(`insert into public.customer_machines (factory_id, machine_type_id, manufacturer_text, model_text) values ($1, $2, 'Not sure', 'Old blue one')`, [
        f,
        await key('machine.unknown'),
      ]);
      return f;
    });
    const ctx = await as(db, custA, (q) => q<{ c: { factory_count: number } }>('select public.get_my_context() as c'));
    expect(ctx.rows[0]!.c.factory_count).toBe(2);
  });

  it('Customer B cannot see or change Customer A factories or machines', async () => {
    const f = await as(db, custB, (q) => q('select * from public.factories'));
    expect(f.rows).toHaveLength(0);
    const m = await as(db, custB, (q) => q('select * from public.customer_machines'));
    expect(m.rows).toHaveLength(0);
    const u = await as(db, custB, (q) => q(`update public.factories set name = 'Hacked' where id = $1`, [factoryA]));
    expect(u.affectedRows).toBe(0);
    await expect(
      as(db, custB, async (q) => q(`insert into public.customer_machines (factory_id, machine_type_id) values ($1, $2)`, [factoryA, await key('machine.destoner')])),
    ).rejects.toThrow(/ITM:factory_not_yours/);
  });

  it('only customers can add factories; machines must be approved catalogue machine types', async () => {
    await expect(as(db, techA, (q) => q(`insert into public.factories (name, locality) values ('X', 'Y place')`))).rejects.toThrow(/row-level security/);
    await expect(
      as(db, custA, async (q) => q(`insert into public.customer_machines (factory_id, machine_type_id) values ($1, $2)`, [factoryA, await key('component.bearing')])),
    ).rejects.toThrow(/ITM:catalogue_ref_invalid/);
  });

  it('validates pincode, GSTIN and coordinates', async () => {
    await expect(as(db, custA, (q) => q(`insert into public.factories (name, locality, pincode) values ('X Mill', 'Y place', '12345')`))).rejects.toThrow(/check/);
    await expect(as(db, custA, (q) => q(`insert into public.factories (name, locality, gstin) values ('X Mill', 'Y place', 'ABC')`))).rejects.toThrow(/check/);
    await expect(as(db, custA, (q) => q(`insert into public.factories (name, locality, latitude) values ('X Mill', 'Y place', 17.4)`))).rejects.toThrow(/factory_coordinates_pair/);
  });

  it('support staff can read factories for complaints; providers cannot', async () => {
    expect((await as(db, support, (q) => q('select 1 from public.factories'))).rows.length).toBe(2);
    expect((await as(db, techA, (q) => q('select 1 from public.factories'))).rows.length).toBe(0);
  });
});

describe('provider profiles', () => {
  it('registering as technician creates a draft individual profile; companies get a company profile', async () => {
    const r = await db.query<{ kind: string; status: string }>(`select kind, status from public.provider_profiles where user_id = $1`, [techA]);
    expect(r.rows).toEqual([{ kind: 'individual', status: 'draft' }]);
    const c = await db.query<{ display_name: string }>(`select display_name from public.provider_profiles where organization_id = $1 and kind = 'company'`, [orgA]);
    expect(c.rows[0]?.display_name).toBe('Alpha Mill Services');
  });

  it('Technician A cannot see or edit Technician B profile or skills', async () => {
    const b = await profileOf(techB);
    const sel = await as(db, techA, (q) => q('select id from public.provider_profiles where id = $1', [b]));
    expect(sel.rows).toHaveLength(0);
    const upd = await as(db, techA, (q) => q(`update public.provider_profiles set bio = 'x' where id = $1`, [b]));
    expect(upd.affectedRows).toBe(0);
    await expect(
      as(db, techA, async (q) => q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id) values ($1, $2)`, [b, await key('machine.destoner')])),
    ).rejects.toThrow(/row-level security/);
  });

  it('providers cannot set their own status or business fields on an individual profile', async () => {
    const a = await profileOf(techA);
    await expect(as(db, techA, (q) => q(`update public.provider_profiles set status = 'approved' where id = $1`, [a]))).rejects.toThrow(/ITM:status_change_forbidden/);
    await expect(as(db, techA, (q) => q(`update public.provider_profiles set gstin = '36ABCDE1234F1Z5' where id = $1`, [a]))).rejects.toThrow(/business_fields_company_only/);
  });

  it('skills must be approved machine types, categories or service skills, one row per item with its own years', async () => {
    const a = await profileOf(techA);
    await expect(
      as(db, techA, async (q) => q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id) values ($1, $2)`, [a, await key('fault.vibration')])),
    ).rejects.toThrow(/ITM:skill_ref_invalid/);
    await asCommit(db, techA, async (q) => {
      await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 3)`, [a, await key('machine.colour_sorter')]);
      await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 12)`, [a, await key('skill.motor_rewinding')]);
    });
    const r = await db.query<{ n: number }>('select count(*)::int n from public.provider_skills where provider_profile_id = $1', [a]);
    expect(r.rows[0]!.n).toBe(2);
  });

  it('make/model experience attaches to machine-type skills, free text allowed when not catalogued', async () => {
    const a = await profileOf(techA);
    const sorter = (await db.query<{ id: string }>(
      `select s.id from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id where s.provider_profile_id = $1 and e.key = 'machine.colour_sorter'`, [a],
    )).rows[0]!.id;
    const rewinding = (await db.query<{ id: string }>(
      `select s.id from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id where s.provider_profile_id = $1 and e.key = 'skill.motor_rewinding'`, [a],
    )).rows[0]!.id;
    await asCommit(db, techA, (q) => q(`insert into public.provider_make_model_experience (provider_skill_id, manufacturer_text, model_text, years_experience) values ($1, 'Some Make', 'Model as on plate', 3)`, [sorter]));
    await expect(as(db, techA, (q) => q(`insert into public.provider_make_model_experience (provider_skill_id, manufacturer_text) values ($1, 'X')`, [rewinding]))).rejects.toThrow(/ITM:make_model_needs_machine/);
    await expect(as(db, techA, (q) => q(`insert into public.provider_make_model_experience (provider_skill_id) values ($1)`, [sorter]))).rejects.toThrow(/make_or_model_given/);
  });
});

describe('submission and approval', () => {
  it('lists what is missing and refuses incomplete submissions', async () => {
    const b = await profileOf(techB);
    const gaps = await as(db, techB, (q) => q<{ g: string[] }>('select public.provider_profile_gaps($1) as g', [b]));
    expect(gaps.rows[0]!.g).toEqual(expect.arrayContaining(['Choose the languages you speak', 'Add at least one machine you work on, with your years of experience']));
    await expect(as(db, techB, (q) => q('select public.submit_provider_profile($1)', [b]))).rejects.toThrow(/ITM:profile_incomplete/);
  });

  it('a complete profile is submitted; approval needs a passed identity check; only admins approve', async () => {
    const a = await completeIndividual(techA, 'Ravi Kumar');
    await asCommit(db, techA, (q) => q('select public.submit_provider_profile($1)', [a]));
    await expect(as(db, support, (q) => q(`select public.set_provider_status($1, 'approved')`, [a]))).rejects.toThrow(/only platform admins/);
    await expect(as(db, admin, (q) => q(`select public.set_provider_status($1, 'approved')`, [a]))).rejects.toThrow(/ITM:identity_check_required/);

    const doc = await uploadDoc(techA, a, 'identity', 'Aadhaar (masked)');
    await asCommit(db, admin, (q) => q(`select public.record_verification_check($1, 'identity', true, null, null, $2, 'Checked against original')`, [a, doc.id]));
    await asCommit(db, admin, (q) => q(`select public.set_provider_status($1, 'approved')`, [a]));
    const st = await db.query<{ status: string }>('select status from public.provider_profiles where id = $1', [a]);
    expect(st.rows[0]!.status).toBe('approved');
  });

  it('a failed later identity decision removes the requirement being met', async () => {
    const a = await profileOf(techA);
    await asCommit(db, admin, (q) => q(`select public.record_verification_check($1, 'identity', false, null, null, null, 'Mismatch found')`, [a]));
    const ok = await db.query<{ ok: boolean }>(`select private.has_current_check($1, 'identity') as ok`, [a]);
    expect(ok.rows[0]!.ok).toBe(false);
    await asCommit(db, admin, (q) => q(`select public.record_verification_check($1, 'identity', true, null, null, null, 'Rechecked in person')`, [a]));
  });

  it('changing the name after approval sends the profile back to review', async () => {
    const a = await profileOf(techA);
    await asCommit(db, techA, (q) => q(`update public.provider_profiles set display_name = 'Ravi K.' where id = $1`, [a]));
    const st = await db.query<{ status: string }>('select status from public.provider_profiles where id = $1', [a]);
    expect(st.rows[0]!.status).toBe('submitted');
    await asCommit(db, admin, (q) => q(`select public.set_provider_status($1, 'approved')`, [a]));
    // non-identity edits keep approval
    await asCommit(db, techA, (q) => q(`update public.provider_profiles set availability = 'limited' where id = $1`, [a]));
    expect((await db.query<{ status: string }>('select status from public.provider_profiles where id = $1', [a])).rows[0]!.status).toBe('approved');
  });

  it('rejecting and suspending need a reason; transitions are checked; everything is audited', async () => {
    const a = await profileOf(techA);
    await expect(as(db, admin, (q) => q(`select public.set_provider_status($1, 'suspended')`, [a]))).rejects.toThrow(/ITM:note_required/);
    await expect(as(db, admin, (q) => q(`select public.set_provider_status($1, 'submitted', 'x')`, [a]))).rejects.toThrow(/ITM:invalid_transition/);
    const audit = await db.query<{ n: number }>(`select count(*)::int n from public.audit_log where entity_id = $1 and action like 'provider.%'`, [a]);
    expect(audit.rows[0]!.n).toBeGreaterThanOrEqual(3);
  });
});

describe('verification badges', () => {
  it('a certificate badge appears only when its check passed, is linked to the document and is in date', async () => {
    const a = await profileOf(techA);
    const cert = await uploadDoc(techA, a, 'certificate', 'Colour sorter training', 'application/pdf', '2030-01-01');
    await expect(as(db, admin, (q) => q(`select public.record_verification_check($1, 'certificate', true, 'Colour sorter training', '2030-01-01')`, [a]))).rejects.toThrow(/ITM:document_required/);
    await expect(as(db, admin, (q) => q(`select public.record_verification_check($1, 'certificate', true, 'Old cert', '2020-01-01', $2)`, [a, cert.id]))).rejects.toThrow(/ITM:expired/);
    await asCommit(db, admin, (q) => q(`select public.record_verification_check($1, 'certificate', true, 'Colour sorter training', '2030-01-01', $2)`, [a, cert.id]));

    const pub = await as(db, null, (q) => q<{ p: { badges: { kind: string; label: string | null }[] } }>('select public.get_provider_public($1) as p', [a]));
    const badges = pub.rows[0]!.p.badges.map((b) => `${b.kind}:${b.label ?? ''}`);
    expect(badges.sort()).toEqual(['certificate:Colour sorter training', 'identity:']);
    const doc = await db.query<{ review_status: string }>('select review_status from public.provider_documents where id = $1', [cert.id]);
    expect(doc.rows[0]!.review_status).toBe('accepted');
  });

  it('revoked checks disappear from badges', async () => {
    const a = await profileOf(techA);
    const c = (await db.query<{ id: string }>(`select id from public.verification_checks where provider_profile_id = $1 and kind = 'certificate'`, [a])).rows[0]!.id;
    await asCommit(db, admin, (q) => q(`select public.revoke_verification_check($1, 'Issuer withdrew it')`, [c]));
    const pub = await as(db, null, (q) => q<{ p: { badges: { kind: string }[] } }>('select public.get_provider_public($1) as p', [a]));
    expect(pub.rows[0]!.p.badges.map((b) => b.kind)).toEqual(['identity']);
  });
});

describe('private documents', () => {
  it('customers and anonymous visitors never read identity documents; the provider and staff can', async () => {
    const a = await profileOf(techA);
    const idDoc = (await db.query<{ storage_path: string; id: string }>(`select id, storage_path from public.provider_documents where provider_profile_id = $1 and doc_type = 'identity'`, [a])).rows[0]!;
    for (const who of [custA, techB, compAdminA, null]) {
      const files = await as(db, who, (q) => q('select name from storage.objects where name = $1', [idDoc.storage_path]));
      expect(files.rows, `user ${who}`).toHaveLength(0);
      if (who) {
        const meta = await as(db, who, (q) => q('select id from public.provider_documents where id = $1', [idDoc.id]));
        expect(meta.rows).toHaveLength(0);
      }
    }
    expect((await as(db, techA, (q) => q('select name from storage.objects where name = $1', [idDoc.storage_path]))).rows).toHaveLength(1);
    expect((await as(db, support, (q) => q('select name from storage.objects where name = $1', [idDoc.storage_path]))).rows).toHaveLength(1);
  });

  it('the public profile has no documents, phone numbers or coordinates', async () => {
    const a = await profileOf(techA);
    const pub = (await as(db, null, (q) => q<{ p: Record<string, unknown> }>('select public.get_provider_public($1) as p', [a]))).rows[0]!.p;
    const text = JSON.stringify(pub);
    expect(text).not.toMatch(/\+91|919000|storage_path|identity document|latitude|longitude/i);
    expect(pub).not.toHaveProperty('base_latitude');
    expect(pub.mobile_verified).toBe(true);
  });

  it('accepted work photos of approved providers are public; pending ones are not', async () => {
    const a = await profileOf(techA);
    const photo = await uploadDoc(techA, a, 'work_photo', 'Husker overhaul', 'image/jpeg');
    expect((await as(db, null, (q) => q('select 1 from storage.objects where name = $1', [photo.path]))).rows).toHaveLength(0);
    await asCommit(db, admin, (q) => q('select public.review_provider_document($1, true)', [photo.id]));
    expect((await as(db, null, (q) => q('select 1 from storage.objects where name = $1', [photo.path]))).rows).toHaveLength(1);
    const pub = (await as(db, null, (q) => q<{ p: { work_photos: unknown[] } }>('select public.get_provider_public($1) as p', [a]))).rows[0]!.p;
    expect(pub.work_photos).toHaveLength(1);
  });

  it('files must be uploaded into your own folder, and reviewed documents cannot be deleted', async () => {
    const a = await profileOf(techA);
    const b = await profileOf(techB);
    await expect(as(db, techA, (q) => q(`insert into storage.objects (bucket_id, name) values ('provider-documents', $1)`, [`${b}/sneaky.pdf`]))).rejects.toThrow(/row-level security/);
    const idDoc = (await db.query<{ id: string }>(`select id from public.provider_documents where provider_profile_id = $1 and doc_type = 'identity'`, [a])).rows[0]!.id;
    await expect(as(db, techA, (q) => q('select public.delete_provider_document($1)', [idDoc]))).rejects.toThrow(/ITM:document_reviewed/);
    await expect(as(db, techA, (q) => q(`select public.register_provider_document($1, 'certificate', $2, 'x cert', 'application/pdf', 10)`, [a, `${a}/missing.pdf`]))).rejects.toThrow(/ITM:file_missing/);
  });

  it('an unapproved provider profile is not visible to the public', async () => {
    const b = await profileOf(techB);
    const r = await as(db, null, (q) => q<{ p: unknown }>('select public.get_provider_public($1) as p', [b]));
    expect(r.rows[0]!.p).toBeNull();
  });
});

describe('service companies and employees', () => {
  it('the company admin invites an employee; only the person with that verified number can accept', async () => {
    const invite = (await asCommit(db, compAdminA, (q) => q<{ id: string }>(`select public.company_invite_member($1, '+${PHONE_EMPLOYEE}', 'Suresh') as id`, [orgA]))).rows[0]!.id;
    await expect(as(db, compAdminB, (q) => q(`select public.company_invite_member($1, '+919000000777')`, [orgA]))).rejects.toThrow(/only the company admin/);
    await expect(as(db, outsider, (q) => q('select public.accept_company_invite($1)', [invite]))).rejects.toThrow(/ITM:invite_invalid/);
    const ctx = (await as(db, employee, (q) => q<{ c: { invites: { organization_name: string }[] } }>('select public.get_my_context() as c'))).rows[0]!.c;
    expect(ctx.invites.map((i) => i.organization_name)).toEqual(['Alpha Mill Services']);
    await asCommit(db, employee, (q) => q('select public.accept_company_invite($1)', [invite]));
    const roles = await db.query<{ role: string }>(`select role from public.user_roles where user_id = $1 and revoked_at is null`, [employee]);
    expect(roles.rows.map((r) => r.role)).toEqual(['company_technician']);
  });

  it('company skills are NOT given to employees automatically; copying is explicit and per skill', async () => {
    const company = await companyProfile(orgA);
    const member = await profileOf(employee, 'company_member');
    await asCommit(db, compAdminA, async (q) => {
      await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 15)`, [company, await key('category.grain_processing')]);
      await q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 10)`, [company, await key('machine.rice_whitener')]);
    });
    const before = await db.query<{ n: number }>('select count(*)::int n from public.provider_skills where provider_profile_id = $1', [member]);
    expect(before.rows[0]!.n).toBe(0);

    const whitener = (await db.query<{ id: string }>(
      `select s.id from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id where s.provider_profile_id = $1 and e.key = 'machine.rice_whitener'`, [company],
    )).rows[0]!.id;
    await asCommit(db, compAdminA, (q) => q(`select public.copy_company_skill_to_member($1, $2, 4, 'experienced')`, [whitener, member]));
    const after = await db.query<{ years_experience: number; copied_from_skill_id: string }>('select years_experience, copied_from_skill_id from public.provider_skills where provider_profile_id = $1', [member]);
    expect(after.rows).toEqual([{ years_experience: 4, copied_from_skill_id: whitener }]);

    // A forged "copied" flag through a direct insert is refused.
    await expect(
      as(db, compAdminA, async (q) => q(`insert into public.provider_skills (provider_profile_id, catalogue_entity_id, copied_from_skill_id) values ($1, $2, $3)`, [member, await key('machine.destoner'), whitener])),
    ).rejects.toThrow(/row-level security/);
  });

  it('the employee and their company admin can edit the employee profile; Company B cannot see any of it', async () => {
    const member = await profileOf(employee, 'company_member');
    await asCommit(db, employee, (q) => q(`update public.provider_profiles set bio = 'Whitener specialist' where id = $1`, [member]));
    await asCommit(db, compAdminA, (q) => q(`update public.provider_profiles set languages = '{te}' where id = $1`, [member]));
    for (const q of ['select id from public.provider_profiles where organization_id = $1', 'select id from public.organization_invites where organization_id = $1']) {
      expect((await as(db, compAdminB, (x) => x(q, [orgA]))).rows).toHaveLength(0);
    }
    expect((await as(db, compAdminB, (x) => x('select s.id from public.provider_skills s where s.provider_profile_id = $1', [member]))).rows).toHaveLength(0);
    const upd = await as(db, compAdminB, (x) => x(`update public.provider_profiles set bio = 'x' where id = $1`, [member]));
    expect(upd.affectedRows).toBe(0);
  });

  it("a company admin cannot upload or read an employee's identity document", async () => {
    const member = await profileOf(employee, 'company_member');
    await expect(uploadDoc(compAdminA, member, 'identity', 'Employee ID')).rejects.toThrow(/ITM:identity_self_only/);
    const own = await uploadDoc(employee, member, 'identity', 'My ID');
    expect((await as(db, compAdminA, (q) => q('select 1 from public.provider_documents where id = $1', [own.id]))).rows).toHaveLength(0);
    expect((await as(db, compAdminA, (q) => q('select 1 from storage.objects where name = $1', [own.path]))).rows).toHaveLength(0);
  });

  it('companies need a business check before approval; employees need an approved company', async () => {
    const company = await companyProfile(orgA);
    const member = await profileOf(employee, 'company_member');
    await asCommit(db, compAdminA, (q) =>
      q(`update public.provider_profiles set languages = '{te,en}', base_locality = 'Nalgonda', business_phone = '+919000000600', business_address = 'Plot 1, IDA Nalgonda' where id = $1`, [company]),
    );
    await acceptAllTerms(compAdminA);
    await asCommit(db, compAdminA, (q) => q('select public.submit_provider_profile($1)', [company]));

    await asCommit(db, employee, (q) => q(`update public.provider_profiles set base_locality = 'Nalgonda' where id = $1`, [member]));
    await acceptAllTerms(employee);
    await asCommit(db, employee, (q) => q('select public.submit_provider_profile($1)', [member]));
    await expect(as(db, admin, (q) => q(`select public.set_provider_status($1, 'approved')`, [member]))).rejects.toThrow(/ITM:company_not_approved/);

    await expect(as(db, admin, (q) => q(`select public.set_provider_status($1, 'approved')`, [company]))).rejects.toThrow(/ITM:business_check_required/);
    await expect(as(db, admin, (q) => q(`select public.record_verification_check($1, 'identity', true)`, [company]))).rejects.toThrow(/ITM:identity_check_person_only/);
    await asCommit(db, admin, async (q) => {
      await q(`select public.record_verification_check($1, 'business', true, null, null, null, 'GST and address checked')`, [company]);
      await q(`select public.set_provider_status($1, 'approved')`, [company]);
      await q(`select public.set_provider_status($1, 'approved')`, [member]);
    });
    const pub = (await as(db, null, (q) => q<{ p: { team_size: number; badges: { kind: string }[] } }>('select public.get_provider_public($1) as p', [company]))).rows[0]!.p;
    expect(pub.team_size).toBe(1);
    expect(pub.badges.map((b) => b.kind)).toEqual(['business']);
    const memberPub = (await as(db, null, (q) => q<{ p: { company_name: string } }>('select public.get_provider_public($1) as p', [member]))).rows[0]!.p;
    expect(memberPub.company_name).toBe('Alpha Mill Services');
  });

  it('removing an employee keeps history, revokes access and hides them publicly', async () => {
    const member = await profileOf(employee, 'company_member');
    await expect(as(db, compAdminB, (q) => q(`select public.company_remove_member($1, 'x')`, [member]))).rejects.toThrow(/not allowed/);
    await asCommit(db, compAdminA, (q) => q(`select public.company_remove_member($1, 'Left the company')`, [member]));
    const row = await db.query<{ archived_at: string | null }>('select archived_at from public.provider_profiles where id = $1', [member]);
    expect(row.rows[0]!.archived_at).not.toBeNull();
    const upd = await as(db, employee, (q) => q(`update public.provider_profiles set bio = 'x' where id = $1`, [member]));
    expect(upd.affectedRows).toBe(0);
    expect((await as(db, null, (q) => q<{ p: unknown }>('select public.get_provider_public($1) as p', [member]))).rows[0]!.p).toBeNull();
  });
});
