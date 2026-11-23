/**
 * Demo data for the LOCAL demo backend (scripts/demo/server.mjs).
 * Everything is created through the same database functions the apps use,
 * as the right person, so every business rule applies. Fictional people.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const DEMO_ACCOUNTS = [
  { phone: '9000000001', name: 'Lakshmi Reddy', role: 'Customer — Sri Lakshmi Rice Mill, Miryalaguda' },
  { phone: '9000000002', name: 'Ravi Kumar', role: 'Independent technician (approved) — huskers, whiteners' },
  { phone: '9000000003', name: 'Priya Sharma', role: 'Service company admin — Alpha Mill Services' },
  { phone: '9000000004', name: 'Suresh Babu', role: 'Company technician at Alpha Mill Services' },
  { phone: '9000000005', name: 'Srinivas Rao', role: 'Independent technician (approved) — colour sorters' },
  { phone: '9000000006', name: 'Anil Goud', role: 'Technician waiting for verification' },
  { phone: '9000000008', name: 'Meena Iyer', role: 'Platform support (admin portal)' },
  { phone: '9000000009', name: 'Arjun Das', role: 'Platform administrator (admin portal)' },
];

/** Seeds the fictional demo world. Returns the user ids (by phone) and key record ids. */
export async function seedDemo({ db, asCaller, storageDir }) {
  const users = {};
  for (const a of DEMO_ACCOUNTS) {
    const id = randomUUID();
    await db.query('insert into auth.users (id, phone) values ($1, $2)', [id, `91${a.phone}`]);
    users[a.phone] = id;
  }
  const as = (phone, sql, params = []) => asCaller({ sub: users[phone], role: 'authenticated' }, () => db.query(sql, params));
  const one = async (phone, sql, params) => (await as(phone, sql, params)).rows[0];
  const key = async (k) => (await db.query('select id from public.catalogue_entities where key = $1', [k])).rows[0].id;
  const acceptTerms = async (phone) => {
    const ctx = (await one(phone, 'select public.get_my_context() as c')).c;
    for (const d of ctx.pending_documents) await as(phone, `select public.accept_legal_document($1, 'web')`, [d.id]);
  };
  const putFile = async (phone, bucket, path, mime, bytes) => {
    await as(phone, 'insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)', [
      bucket, path, users[phone], JSON.stringify({ mimetype: mime, size: bytes.length }),
    ]);
    const full = join(storageDir, bucket, ...path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
  };
  const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  // Staff, names and catalogue
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'platform_admin'), ($2, 'support_agent')`, [users['9000000009'], users['9000000008']]);
  for (const a of DEMO_ACCOUNTS) await as(a.phone, 'update public.profiles set full_name = $1 where id = $2', [a.name, users[a.phone]]);
  const admin = '9000000009';
  await as(admin, `select public.catalogue_set_status(array(select id from public.catalogue_entities where status = 'pending_review'), 'approved', 'Demo: starter taxonomy approved')`);

  // ---- Customer: factory and machines
  const C = '9000000001';
  await as(C, `select public.register_role('customer')`);
  await acceptTerms(C);
  const factory = (await one(C,
    `insert into public.factories (name, address_line, locality, district, city, pincode, latitude, longitude)
     values ('Sri Lakshmi Rice Mill', 'Survey No. 214, Nalgonda Road', 'Miryalaguda', 'Nalgonda', 'Miryalaguda', '508207', 16.872, 79.563) returning id`)).id;
  const machine = async (type, label, make) =>
    (await one(C, 'insert into public.customer_machines (factory_id, machine_type_id, label, manufacturer_text, year_installed) values ($1, $2, $3, $4, 2018) returning id', [factory, await key(type), label, make])).id;
  const husker = await machine('machine.rubber_roll_husker', 'Husker 1', 'Local make');
  await machine('machine.rice_whitener', 'Whitener', null);
  const sorter = await machine('machine.colour_sorter', 'Colour sorter', null);

  // ---- Providers
  const tech = async (phone, name, opts) => {
    await as(phone, `select public.register_role('technician')`);
    await acceptTerms(phone);
    const pid = (await db.query(`select id from public.provider_profiles where user_id = $1 and kind = 'individual'`, [users[phone]])).rows[0].id;
    await as(phone,
      `update public.provider_profiles set display_name = $2, bio = $3, years_experience = $4, languages = '{te,en,hi}',
         base_locality = $5, base_district = $6, base_latitude = $7, base_longitude = $8, service_radius_km = $9, service_districts = $10
       where id = $1`,
      [pid, name, opts.bio, opts.years, opts.locality, opts.district, opts.lat, opts.lng, opts.radius, `{${opts.districts.join(',')}}`]);
    for (const [k, y, level] of opts.skills) {
      const s = (await one(phone, `insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience, level) values ($1, $2, $3, $4) returning id`, [pid, await key(k), y, level])).id;
      if (opts.make && k === opts.make[0]) await as(phone, 'insert into public.provider_make_model_experience (provider_skill_id, manufacturer_text, years_experience) values ($1, $2, $3)', [s, opts.make[1], opts.make[2]]);
    }
    return pid;
  };
  const ravi = await tech('9000000002', 'Ravi Kumar', {
    bio: 'Rice mill mechanic for 12 years. Huskers, whiteners and paddy separators.', years: 12, locality: 'Miryalaguda', district: 'Nalgonda',
    lat: 16.9, lng: 79.55, radius: 60, districts: ['Nalgonda', 'Suryapet'],
    skills: [['machine.rubber_roll_husker', 12, 'expert'], ['machine.rice_whitener', 9, 'expert'], ['machine.paddy_separator', 7, 'experienced'], ['skill.rubber_roll_replacement', 12, 'expert']],
    make: ['machine.rubber_roll_husker', 'Local make', 8],
  });
  const srinivas = await tech('9000000005', 'Srinivas Rao', {
    bio: 'Colour sorter calibration and ejector service.', years: 10, locality: 'Suryapet', district: 'Suryapet',
    lat: 17.14, lng: 79.62, radius: 80, districts: ['Nalgonda', 'Suryapet', 'Khammam'],
    skills: [['machine.colour_sorter', 10, 'expert'], ['skill.colour_sorter_calibration', 10, 'expert'], ['machine.air_compressor', 6, 'experienced']],
  });
  const anil = await tech('9000000006', 'Anil Goud', {
    bio: 'Electrical panels and motors.', years: 5, locality: 'Nalgonda', district: 'Nalgonda', lat: 17.05, lng: 79.27, radius: 40, districts: ['Nalgonda'],
    skills: [['machine.electric_motor', 5, 'experienced'], ['machine.electrical_panel', 4, 'experienced'], ['skill.motor_rewinding', 5, 'experienced']],
  });

  // Identity documents (placeholder files) and admin verification
  const verify = async (phone, pid, approve) => {
    const path = `${pid}/${randomUUID()}.pdf`;
    await putFile(phone, 'provider-documents', path, 'application/pdf', Buffer.from('%PDF-1.4\n% Demo identity document placeholder\n'));
    const doc = (await one(phone, `select public.register_provider_document($1, 'identity', $2, 'Identity document (demo)', 'application/pdf', 60) as id`, [pid, path])).id;
    await as(phone, 'select public.submit_provider_profile($1)', [pid]);
    if (approve) {
      await as(admin, `select public.record_verification_check($1, 'identity', true, null, null, $2, 'Checked against original (demo)')`, [pid, doc]);
      await as(admin, `select public.set_provider_status($1, 'approved')`, [pid]);
    }
  };
  await verify('9000000002', ravi, true);
  await verify('9000000005', srinivas, true);
  await verify('9000000006', anil, false); // stays in the verification queue

  // ---- Service company with an employee
  const P = '9000000003';
  const org = (await one(P, `select public.create_organization('Alpha Mill Services') as id`)).id;
  await acceptTerms(P);
  const company = (await db.query(`select id from public.provider_profiles where organization_id = $1 and kind = 'company'`, [org])).rows[0].id;
  await as(P,
    `update public.provider_profiles set bio = 'Rice mill installation and maintenance team serving Nalgonda and Suryapet.', years_experience = 15,
       languages = '{te,en}', base_locality = 'Nalgonda', base_district = 'Nalgonda', base_latitude = 17.05, base_longitude = 79.27,
       service_radius_km = 90, service_districts = '{Nalgonda,Suryapet,Yadadri Bhuvanagiri}', business_phone = '+919000000099',
       business_address = 'Plot 12, IDA Nalgonda', business_pincode = '508001', gstin = '36ABCDE1234F1Z5' where id = $1`, [company]);
  for (const [k, y] of [['category.grain_processing', 15], ['machine.rice_whitener', 12], ['machine.paddy_dryer', 10]]) {
    await as(P, 'insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, $3)', [company, await key(k), y]);
  }
  await as(P, 'select public.submit_provider_profile($1)', [company]);
  await as(admin, `select public.record_verification_check($1, 'business', true, null, null, null, 'GST and address checked (demo)')`, [company]);
  await as(admin, `select public.set_provider_status($1, 'approved')`, [company]);
  const invite = (await one(P, `select public.company_invite_member($1, '+919000000004', 'Suresh Babu') as id`, [org])).id;
  const S = '9000000004';
  const member = (await one(S, 'select public.accept_company_invite($1) as id', [invite])).id;
  await acceptTerms(S);
  await as(S, `update public.provider_profiles set languages = '{te}', base_locality = 'Nalgonda', bio = 'Whitener and dryer technician.' where id = $1`, [member]);
  await as(S, 'insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience) values ($1, $2, 6)', [member, await key('machine.rice_whitener')]);
  await as(S, 'select public.submit_provider_profile($1)', [member]);
  await as(admin, `select public.set_provider_status($1, 'approved')`, [member]);

  // ---- Request 1: husker breakdown — Ravi accepted, chatting, estimate waiting for the customer
  const r1 = (await one(C,
    `select public.create_service_request($1, 'breakdown', 'Husker 1 stopped husking properly this morning. Rolls slipping and a burning smell near the roll housing.', '{machine_stopped,overheating}', $2, null, $3, null, null, 'emergency') as id`,
    [factory, husker, await key('industry.rice_mill')])).id;
  await as(C, 'select public.match_providers($1)', [r1]);
  await as(C, 'select public.invite_provider($1, $2)', [r1, ravi]);
  await as(C, 'select public.invite_provider($1, $2)', [r1, company]);
  const inv1 = (await db.query('select id from public.request_invitations where request_id = $1 and provider_profile_id = $2', [r1, ravi])).rows[0].id;
  await as('9000000002', 'select public.respond_to_invitation($1, true)', [inv1]);
  const conv1 = (await db.query('select id from public.conversations where request_id = $1 and provider_profile_id = $2', [r1, ravi])).rows[0].id;
  for (const [who, text] of [
    ['9000000002', 'Namaste. Can you send a photo of the rolls? Is the gap adjustment handle moving freely?'],
    [C, 'Rolls look worn on one side. The handle is stiff. Machine is stopped now.'],
    ['9000000002', 'Probably both rolls need replacing. I can come today by 3 pm. I will send an estimate.'],
  ]) {
    await as(who, `select public.send_message($1, 'text', $2)`, [conv1, text]);
  }
  const est1 = (await one('9000000002', `select public.save_estimate_draft($1, $2, null, 'repair', 'Husker roll replacement', $3::jsonb) as id`, [r1, ravi, JSON.stringify({
    visit_charge: '300', labour: '2500', travel: '200', parts: '0', tax_amount: '0',
    scope: 'Replace both rubber rolls, free the gap adjustment mechanism, set roll gap and test run with paddy. Rolls quoted separately as spare parts.',
    exclusions: 'Motor, belts and electrical panel work', expected_completion: 'Same day', valid_until: days(7),
  })])).id;
  await as('9000000002', 'select public.send_estimate_revision($1)', [est1]);
  const part = (await one('9000000002', 'select public.create_part_request($1, $2, $3::jsonb) as id', [r1, ravi, JSON.stringify({
    part_name: 'Rubber roll 10 inch', part_number: 'RR-10', manufacturer_text: 'Roll supplier', quantity: '2', unit: 'pcs',
    specifications: '10 inch, same hardness as existing roll', supplier_name: 'Sri Ram Traders, Miryalaguda', supplier_contact: 'Main Road shop',
    availability: 'in_stock', unit_price: '2400',
  })])).id;
  await as('9000000002', `select public.set_part_compatibility($1, 'confirmed_by_provider', 'Matched against the worn roll size')`, [part]);

  // ---- Request 2: colour sorter — approved, work done, waiting for the customer's confirmation
  const r2 = (await one(C, `select public.create_service_request($1, 'maintenance', 'Colour sorter rejecting good grain. Needs calibration and ejector check.', '{low_output}', $2, null, $3) as id`, [factory, sorter, await key('industry.rice_mill')])).id;
  await as(C, 'select public.invite_provider($1, $2)', [r2, srinivas]);
  const inv2 = (await db.query('select id from public.request_invitations where request_id = $1', [r2])).rows[0].id;
  await as('9000000005', 'select public.respond_to_invitation($1, true)', [inv2]);
  const est2 = (await one('9000000005', `select public.save_estimate_draft($1, $2, null, 'repair', 'Colour sorter calibration', $3::jsonb) as id`, [r2, srinivas, JSON.stringify({
    visit_charge: '500', labour: '3500', tax_amount: '720', tax_note: 'GST 18%', scope: 'Clean optics, calibrate for current paddy variety, check and clean ejectors, test with sample.',
    exclusions: 'Replacement of cameras or ejector valves', expected_completion: '1 day', valid_until: days(10),
  })])).id;
  const h2 = (await one('9000000005', 'select public.send_estimate_revision($1) as h', [est2])).h;
  await as(C, `select public.decide_estimate($1, 'accept', $2)`, [est2, h2]);
  const safe = JSON.stringify({ access: true, isolation: true, permits: true, ppe: true, site_contact: true });
  await as('9000000005', 'select public.acknowledge_site_safety($1, $2::jsonb)', [r2, safe]);
  await as(C, 'select public.acknowledge_site_safety($1, $2::jsonb)', [r2, safe]);
  await as('9000000005', `select public.update_job_progress($1, 'work_in_progress')`, [r2]);
  await as('9000000005', 'select public.submit_completion_report($1, $2::jsonb)', [r2, JSON.stringify({
    fault_identified: 'Dust on the optical window and calibration set for a different paddy variety. Two ejectors sticking.',
    work_performed: 'Cleaned optics and chutes, recalibrated with current paddy, cleaned and tested all ejectors, 30-minute test run.',
    remaining_issues: 'Air filter is clogged; compressor air contains moisture.', recommendations: 'Replace the air filter and check the air dryer within two weeks.',
    completed_on: days(0),
  })]);

  // ---- Request 3: whitener request with Alpha Mill Services (company), plus an open complaint about delay
  const r3 = (await one(C, `select public.create_service_request($1, 'maintenance', 'Annual service of the whitener before the season.', '{regular_service}', null, $2) as id`, [factory, await key('machine.rice_whitener')])).id;
  await as(C, 'select public.invite_provider($1, $2)', [r3, company]);
  const inv3 = (await db.query('select id from public.request_invitations where request_id = $1', [r3])).rows[0].id;
  await as(P, 'select public.respond_to_invitation($1, true)', [inv3]);
  await as(P, 'select public.assign_company_member($1, $2)', [inv3, member]);
  await as(C, `select public.open_complaint($1, 'delay', 'The visit was promised for Monday but nobody came and there was no message.')`, [r3]);

  // Ids for callers that build on the demo (the security tests use them).
  return { users, factory, ravi, srinivas, anil, org, company, member, r1, r2, r3, conv1, est1, est2, part };
}
