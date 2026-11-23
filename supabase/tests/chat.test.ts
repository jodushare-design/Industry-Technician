import { beforeAll, describe, expect, it } from 'vitest';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

let db: Db;
let customer: string;
let tech: string;
let otherTech: string;
let stranger: string;
let support: string;
let compAdmin: string;
let employee: string;
let otherEmployee: string;
let techProfile: string;
let companyProfile: string;
let memberProfile: string;
let request: string;
let conv: string;
let companyConv: string;

const PHONE_CUSTOMER = '919000000801';
const PHONE_TECH = '919000000802';

const key = async (k: string) => (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [k])).rows[0]!.id;
const convOf = async (provider: string) =>
  (await db.query<{ id: string }>('select id from public.conversations where request_id = $1 and provider_profile_id = $2', [request, provider])).rows[0]!.id;

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  await db.exec(`update public.catalogue_entities set status = 'approved'`);
  customer = await createUser(db, PHONE_CUSTOMER);
  tech = await createUser(db, PHONE_TECH);
  otherTech = await createUser(db);
  stranger = await createUser(db);
  support = await createUser(db);
  compAdmin = await createUser(db);
  employee = await createUser(db);
  otherEmployee = await createUser(db);
  await grantRole(db, support, 'support_agent');
  await asCommit(db, customer, (q) => q(`select public.register_role('customer')`));
  for (const t of [tech, otherTech]) await asCommit(db, t, (q) => q(`select public.register_role('technician')`));
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Ravi Tech' where user_id = $1`, [tech]);
  await db.query(`update public.provider_profiles set status = 'approved', display_name = 'Other Tech' where user_id = $1`, [otherTech]);
  techProfile = (await db.query<{ id: string }>('select id from public.provider_profiles where user_id = $1', [tech])).rows[0]!.id;

  const org = (await asCommit(db, compAdmin, (q) => q<{ id: string }>(`select public.create_organization('Alpha Mill Services') as id`))).rows[0]!.id;
  await db.query(`update public.provider_profiles set status = 'approved', business_phone = '+919000000899' where organization_id = $1 and kind = 'company'`, [org]);
  companyProfile = (await db.query<{ id: string }>(`select id from public.provider_profiles where organization_id = $1 and kind = 'company'`, [org])).rows[0]!.id;
  for (const [u, name] of [[employee, 'Suresh'], [otherEmployee, 'Ramesh']] as const) {
    await grantRole(db, u, 'company_technician', org);
    await db.query(`insert into public.provider_profiles (kind, user_id, organization_id, display_name, status) values ('company_member', $1, $2, $3, 'approved')`, [u, org, name]);
  }
  memberProfile = (await db.query<{ id: string }>(`select id from public.provider_profiles where user_id = $1`, [employee])).rows[0]!.id;

  const factory = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`insert into public.factories (name, locality, district) values ('Sri Lakshmi Rice Mill', 'Miryalaguda', 'Nalgonda') returning id`)).rows[0]!.id,
  );
  request = await asCommit(db, customer, async (q) =>
    (await q<{ id: string }>(`select public.create_service_request($1, 'breakdown', 'Husker stopped this morning', '{machine_stopped}', null, $2) as id`, [factory, await key('machine.rubber_roll_husker')])).rows[0]!.id,
  );
  await asCommit(db, customer, async (q) => {
    await q('select public.invite_provider($1, $2)', [request, techProfile]);
    await q('select public.invite_provider($1, $2)', [request, companyProfile]);
  });
  conv = await convOf(techProfile);
  companyConv = await convOf(companyProfile);
});

describe('conversations', () => {
  it('contacting a provider opens a job-linked conversation with a system message and notifies the provider', async () => {
    const m = await db.query<{ kind: string; body: string }>('select kind, body from public.messages where conversation_id = $1', [conv]);
    expect(m.rows).toEqual([{ kind: 'system', body: 'The customer contacted Ravi Tech about this request.' }]);
    const n = await as(db, tech, (q) => q<{ kind: string; link: string }>('select kind, link from public.notifications'));
    expect(n.rows).toEqual([{ kind: 'request_received', link: `/work/${request}` }]);
  });

  it('customer and provider exchange messages; non-participants see nothing', async () => {
    await asCommit(db, tech, (q) => q(`select public.send_message($1, 'text', 'Is the husker rubber roll worn? Please send a photo.')`, [conv]));
    await asCommit(db, customer, (q) => q(`select public.send_message($1, 'text', 'Sending now.')`, [conv]));
    expect((await as(db, customer, (q) => q('select 1 from public.messages where conversation_id = $1', [conv]))).rows).toHaveLength(3);
    for (const who of [otherTech, stranger, compAdmin, employee, support]) {
      expect((await as(db, who, (q) => q('select 1 from public.messages where conversation_id = $1', [conv]))).rows, who).toHaveLength(0);
      await expect(as(db, who, (q) => q(`select public.send_message($1, 'text', 'hi')`, [conv]))).rejects.toThrow(/not a participant/);
    }
  });

  it('messages cannot be edited, deleted or inserted directly', async () => {
    await expect(as(db, customer, (q) => q(`insert into public.messages (conversation_id, sender_id, sender_side, kind, body) values ($1, $2, 'customer', 'text', 'x')`, [conv, customer]))).rejects.toThrow(/permission denied/);
    await expect(db.query(`update public.messages set body = 'changed' where conversation_id = $1`, [conv])).rejects.toThrow(/ITM:audit_append_only/);
    await expect(db.query(`delete from public.messages where conversation_id = $1`, [conv])).rejects.toThrow(/ITM:audit_append_only/);
  });

  it('retrying with the same client id does not duplicate a message', async () => {
    const cid = crypto.randomUUID();
    const a = await asCommit(db, customer, async (q) => (await q<{ id: string }>(`select public.send_message($1, 'text', 'Retry me', null, null, null, $2) as id`, [conv, cid])).rows[0]!.id);
    const b = await asCommit(db, customer, async (q) => (await q<{ id: string }>(`select public.send_message($1, 'text', 'Retry me', null, null, null, $2) as id`, [conv, cid])).rows[0]!.id);
    expect(a).toBe(b);
  });

  it('estimate and parts cards cannot be forged from the chat box', async () => {
    await expect(as(db, tech, (q) => q(`select public.send_message($1, 'estimate_card', 'Total 500')`, [conv]))).rejects.toThrow(/ITM:kind_not_allowed/);
  });

  it('read status: one unread-messages notification per conversation, cleared when read', async () => {
    const unread = await as(db, tech, (q) => q<{ l: { id: string; unread: number }[] }>('select public.list_my_conversations() as l'));
    expect(unread.rows[0]!.l.find((c) => c.id === conv)?.unread).toBe(2);
    const notes = await as(db, tech, (q) => q(`select 1 from public.notifications where kind = 'new_message' and read_at is null`));
    expect(notes.rows).toHaveLength(1);
    await asCommit(db, tech, (q) => q('select public.mark_conversation_read($1)', [conv]));
    const after = await as(db, tech, (q) => q<{ l: { id: string; unread: number }[] }>('select public.list_my_conversations() as l'));
    expect(after.rows[0]!.l.find((c) => c.id === conv)?.unread).toBe(0);
    expect((await as(db, tech, (q) => q(`select 1 from public.notifications where kind = 'new_message' and read_at is null`))).rows).toHaveLength(0);
    const reads = await as(db, customer, (q) => q<{ user_id: string }>('select user_id from public.conversation_reads where conversation_id = $1', [conv]));
    expect(reads.rows.map((r) => r.user_id)).toContain(tech); // the customer can see the provider has read
  });

  it('notifications are private to each user', async () => {
    expect((await as(db, stranger, (q) => q('select 1 from public.notifications'))).rows).toHaveLength(0);
  });
});

describe('media in chat', () => {
  it('participants upload into the conversation folder; others cannot read', async () => {
    const path = `${conv}/${crypto.randomUUID()}.jpg`;
    await asCommit(db, customer, async (q) => {
      await q(`insert into storage.objects (bucket_id, name) values ('chat-media', $1)`, [path]);
      await q(`select public.send_message($1, 'photo', null, $2, 'image/jpeg', 2048)`, [conv, path]);
    });
    expect((await as(db, tech, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(1);
    expect((await as(db, otherTech, (q) => q('select 1 from storage.objects where name = $1', [path]))).rows).toHaveLength(0);
    await expect(as(db, otherTech, (q) => q(`insert into storage.objects (bucket_id, name) values ('chat-media', $1)`, [`${conv}/x.jpg`]))).rejects.toThrow(/row-level security/);
    await expect(as(db, customer, (q) => q(`select public.send_message($1, 'photo', null, $2, 'image/jpeg', 10)`, [conv, `${conv}/missing.jpg`]))).rejects.toThrow(/ITM:file_missing/);
  });
});

describe('company jobs: assignment', () => {
  it('the company admin chats; employees join only when assigned to the job', async () => {
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [companyProfile])).rows[0]!.id;
    await asCommit(db, compAdmin, (q) => q('select public.respond_to_invitation($1, true)', [inv]));
    await asCommit(db, compAdmin, (q) => q(`select public.send_message($1, 'text', 'We can send a technician today.')`, [companyConv]));
    expect((await as(db, employee, (q) => q('select 1 from public.messages where conversation_id = $1', [companyConv]))).rows).toHaveLength(0);

    await expect(as(db, employee, (q) => q('select public.assign_company_member($1, $2)', [inv, memberProfile]))).rejects.toThrow(/only the company admin/);
    await asCommit(db, compAdmin, (q) => q('select public.assign_company_member($1, $2)', [inv, memberProfile]));
    expect((await as(db, employee, (q) => q('select 1 from public.messages where conversation_id = $1', [companyConv]))).rows.length).toBeGreaterThan(1);
    await asCommit(db, employee, (q) => q(`select public.send_message($1, 'text', 'I will come at 4 pm.')`, [companyConv]));
    expect((await as(db, otherEmployee, (q) => q('select 1 from public.messages where conversation_id = $1', [companyConv]))).rows).toHaveLength(0);
    // the assigned employee can also see the request itself
    expect((await as(db, employee, (q) => q('select 1 from public.service_requests where id = $1', [request]))).rows).toHaveLength(1);
    const n = await as(db, employee, (q) => q<{ kind: string }>(`select kind from public.notifications where kind = 'job_assigned'`));
    expect(n.rows).toHaveLength(1);
  });
});

describe('contact sharing (optional WhatsApp hand-off)', () => {
  it('phone numbers stay hidden until BOTH sides consent, and hide again when either withdraws', async () => {
    const contacts = async (who: string) => (await as(db, who, (q) => q<{ c: { shared: boolean; customer_phone: string | null; provider_phone: string | null } }>('select public.get_conversation_contacts($1) as c', [conv]))).rows[0]!.c;
    expect(await contacts(customer)).toMatchObject({ shared: false, customer_phone: null, provider_phone: null });
    await asCommit(db, customer, (q) => q('select public.set_contact_sharing($1, true)', [conv]));
    expect(await contacts(tech)).toMatchObject({ shared: false, provider_phone: null });
    await asCommit(db, tech, (q) => q('select public.set_contact_sharing($1, true)', [conv]));
    expect(await contacts(customer)).toMatchObject({ shared: true, customer_phone: '+' + PHONE_CUSTOMER, provider_phone: '+' + PHONE_TECH });
    await asCommit(db, tech, (q) => q('select public.set_contact_sharing($1, false)', [conv]));
    expect(await contacts(customer)).toMatchObject({ shared: false, provider_phone: null });
    await expect(as(db, stranger, (q) => q('select public.get_conversation_contacts($1)', [conv]))).rejects.toThrow(/not a participant/);
  });

  it('a company shares its business phone, not the admin\'s personal number', async () => {
    await asCommit(db, customer, (q) => q('select public.set_contact_sharing($1, true)', [companyConv]));
    await asCommit(db, compAdmin, (q) => q('select public.set_contact_sharing($1, true)', [companyConv]));
    const c = (await as(db, customer, (q) => q<{ c: { provider_phone: string } }>('select public.get_conversation_contacts($1) as c', [companyConv]))).rows[0]!.c;
    expect(c.provider_phone).toBe('+919000000899');
  });

  it('consent changes are recorded in the conversation and the audit log', async () => {
    const sys = await db.query<{ body: string }>(`select body from public.messages where conversation_id = $1 and kind = 'system' order by created_at`, [conv]);
    expect(sys.rows.map((r) => r.body)).toEqual(expect.arrayContaining(['The customer agreed to share phone numbers.', 'Phone number sharing was turned off.']));
    const audit = await db.query<{ n: number }>(`select count(*)::int n from public.audit_log where entity_id = $1 and action like 'chat.contact_consent%'`, [conv]);
    expect(audit.rows[0]!.n).toBe(3);
  });
});

describe('closing', () => {
  it('a withdrawn provider keeps read access to history but cannot post, and contacts are no longer shared', async () => {
    const inv = (await db.query<{ id: string }>('select id from public.request_invitations where provider_profile_id = $1', [companyProfile])).rows[0]!.id;
    await asCommit(db, customer, (q) => q('select public.withdraw_invitation($1)', [inv]));
    await expect(as(db, compAdmin, (q) => q(`select public.send_message($1, 'text', 'Hello?')`, [companyConv]))).rejects.toThrow(/ITM:conversation_closed/);
    const c = (await as(db, customer, (q) => q<{ c: { shared: boolean } }>('select public.get_conversation_contacts($1) as c', [companyConv]))).rows[0]!.c;
    expect(c.shared).toBe(false);
  });
});
