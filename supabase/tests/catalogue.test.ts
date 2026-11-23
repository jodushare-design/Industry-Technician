import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOGUE_KINDS, CATALOGUE_RELATIONS, normalizeCatalogueText, relationAllowed, validateImportRows } from '../../packages/core/src/catalogue';
import starterRows from '../../scripts/catalogue/starter-data.mjs';
import { buildJson, buildSql } from '../../scripts/catalogue/build-seed.mjs';
import { readFileSync } from 'node:fs';
import { as, asCommit, createTestDb, createUser, grantRole, type Db } from './helpers/db';

type Q = Db['query'];
let db: Db;
let admin: string;
let support: string;
let customer: string;
let customer2: string;

const idOf = async (key: string) =>
  (await db.query<{ id: string }>('select id from public.catalogue_entities where key = $1', [key])).rows[0]!.id;

/** Approve everything in the starter catalogue (as the admin would with bulk approve). */
async function approveAll() {
  await asCommit(db, admin, (q) =>
    q(`select public.catalogue_set_status(array(select id from public.catalogue_entities where status = 'pending_review'), 'approved', 'bulk approve starter taxonomy')`),
  );
}

beforeAll(async () => {
  db = await createTestDb({ seed: 'full' });
  admin = await createUser(db);
  support = await createUser(db);
  customer = await createUser(db);
  customer2 = await createUser(db);
  await grantRole(db, admin, 'platform_admin');
  await grantRole(db, support, 'support_agent');
  await grantRole(db, customer, 'customer');
  await grantRole(db, customer2, 'customer');
});

describe('starter catalogue content', () => {
  it('passes the shared TypeScript import validation', () => {
    const { problems } = validateImportRows(starterRows as unknown[]);
    expect(problems).toEqual([]);
  });

  it('generated seed files are up to date (run npm run catalogue:build)', () => {
    expect(readFileSync('supabase/seed/catalogue/starter-catalogue.json', 'utf8')).toBe(buildJson());
    expect(readFileSync('supabase/seed/catalogue.sql', 'utf8')).toBe(buildSql());
  });

  it('imports every row with no errors, all pending review', async () => {
    const b = await db.query<{ created_count: number; error_count: number; duplicate_count: number }>(
      'select created_count, error_count, duplicate_count from public.catalogue_import_batches',
    );
    expect(b.rows[0]).toMatchObject({ created_count: starterRows.length, error_count: 0, duplicate_count: 0 });
    const s = await db.query<{ status: string }>('select distinct status from public.catalogue_entities');
    expect(s.rows.map((r) => r.status)).toEqual(['pending_review']);
  });

  it('has the 15 rice-mill process stages in order', async () => {
    const r = await db.query<{ name: string }>(
      `select e.name from public.catalogue_entities e
       join public.catalogue_links l on l.from_id = e.id and l.relation = 'stage_of'
       join public.catalogue_entities i on i.id = l.to_id and i.key = 'industry.rice_mill'
       order by e.sort_order`,
    );
    expect(r.rows.map((x) => x.name)).toEqual([
      'Paddy receiving and handling', 'Cleaning and pre-cleaning', 'Destoning', 'Drying', 'Parboiling',
      'Husking and dehusking', 'Paddy separation', 'Whitening', 'Polishing', 'Grading', 'Colour sorting',
      'Packing', 'Laboratory testing', 'Air and utility systems', 'Electrical and automation systems',
    ]);
  });

  it('contains every rice-mill machine type the brief requires, linked to a rice-mill stage', async () => {
    const required = [
      'paddy_cleaner', 'destoner', 'paddy_dryer', 'rubber_roll_husker', 'paddy_separator', 'rice_whitener',
      'rice_polisher', 'rotary_sifter', 'thickness_grader', 'length_grader', 'colour_sorter', 'packing_machine',
      'bucket_elevator', 'belt_conveyor', 'screw_conveyor', 'air_compressor', 'boiler', 'electric_motor',
      'gearbox', 'electrical_panel', 'plc_system', 'vfd',
    ];
    const r = await db.query<{ key: string }>(
      `select distinct e.key from public.catalogue_entities e
       join public.catalogue_links l on l.from_id = e.id and l.relation = 'used_in'
       join public.catalogue_entities s on s.id = l.to_id and s.key like 'stage.rice_mill.%'`,
    );
    const keys = new Set(r.rows.map((x) => x.key));
    for (const k of required) expect(keys, k).toContain(`machine.${k}`);
  });

  it('has all 21 general equipment categories from the brief', async () => {
    const r = await db.query<{ n: number }>(`select count(*)::int n from public.catalogue_entities where kind = 'equipment_category' and key <> 'category.grain_processing'`);
    expect(r.rows[0]!.n).toBe(21);
  });

  it('contains no manufacturer, model, product family, controller or spare part (no invented makes or model numbers)', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.catalogue_entities where kind in ('manufacturer','product_family','model','controller','spare_part')`,
    );
    expect(r.rows[0]!.n).toBe(0);
  });

  it('offers a generic "I don\'t know the machine name" option', async () => {
    const r = await db.query<{ is_generic: boolean }>(`select is_generic from public.catalogue_entities where key = 'machine.unknown'`);
    expect(r.rows[0]?.is_generic).toBe(true);
  });

  it('flags regulated work on boilers, electrical panels, pressure vessels and cranes', async () => {
    const r = await db.query<{ key: string; regulated_work: string }>(
      `select key, regulated_work from public.catalogue_entities where regulated_work is not null order by key`,
    );
    const map = Object.fromEntries(r.rows.map((x) => [x.key, x.regulated_work]));
    expect(map['machine.boiler']).toBe('boiler');
    expect(map['machine.electrical_panel']).toBe('electrical_installation');
    expect(map['machine.air_receiver']).toBe('pressure_vessel');
    expect(map['machine.eot_crane']).toBe('lifting_equipment');
  });

  it('every record has a source', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int n from public.catalogue_entities e where not exists (select 1 from public.catalogue_sources s where s.entity_id = e.id)`,
    );
    expect(r.rows[0]!.n).toBe(0);
  });
});

describe('parity between TypeScript and SQL rules', () => {
  it.each(['Rubber-Roll  Husker', 'MIG/MAG welding machine', "I don't know", 'Colour_Sorter (CCD)', '  PLC, HMI & SCADA '])(
    'normalises "%s" the same way',
    async (text) => {
      const r = await db.query<{ n: string }>('select private.normalize_catalogue_text($1) as n', [text]);
      expect(normalizeCatalogueText(text)).toBe(r.rows[0]!.n);
    },
  );

  it('relation matrix matches the database for every kind pair', async () => {
    const r = await db.query<{ relation: string; f: string; t: string; ok: boolean }>(
      `select r::text as relation, f::text as f, t::text as t, private.catalogue_relation_allowed(r, f, t) as ok
       from unnest(enum_range(null::public.catalogue_relation)) r,
            unnest(enum_range(null::public.catalogue_kind)) f,
            unnest(enum_range(null::public.catalogue_kind)) t`,
    );
    expect(r.rows).toHaveLength(CATALOGUE_RELATIONS.length * CATALOGUE_KINDS.length ** 2);
    for (const row of r.rows) {
      expect(relationAllowed(row.relation as never, row.f as never, row.t as never), `${row.relation} ${row.f}→${row.t}`).toBe(row.ok);
    }
  });
});

describe('visibility before and after approval (RLS)', () => {
  it('anon and customers see nothing while records are pending review; staff see them', async () => {
    const anon = await as(db, null, (q) => q('select count(*)::int n from public.catalogue_entities'));
    expect((anon.rows[0] as { n: number }).n).toBe(0);
    const cust = await as(db, customer, (q) => q('select count(*)::int n from public.catalogue_entities'));
    expect((cust.rows[0] as { n: number }).n).toBe(0);
    const staff = await as(db, support, (q) => q('select count(*)::int n from public.catalogue_entities'));
    expect((staff.rows[0] as { n: number }).n).toBe(starterRows.length);
  });

  it('only platform admins can approve', async () => {
    const id = await idOf('machine.destoner');
    await expect(as(db, support, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [id]))).rejects.toThrow(/only platform admins/);
    await expect(as(db, customer, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [id]))).rejects.toThrow(/only platform admins/);
  });

  it('after bulk approval, everyone can read approved records, links and aliases', async () => {
    await approveAll();
    const anon = await as(db, null, (q) => q('select count(*)::int n from public.catalogue_entities'));
    expect((anon.rows[0] as { n: number }).n).toBe(starterRows.length);
    const links = await as(db, null, (q) => q('select count(*)::int n from public.catalogue_links'));
    expect((links.rows[0] as { n: number }).n).toBeGreaterThan(400);
    const audit = await db.query<{ n: number }>(`select count(*)::int n from public.audit_log where action = 'catalogue.status_changed'`);
    expect(audit.rows[0]!.n).toBe(starterRows.length);
  });

  it('nobody can write catalogue tables directly', async () => {
    await expect(as(db, admin, (q) => q(`insert into public.catalogue_entities (key, kind, name) values ('x.yz', 'component', 'Fake')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, admin, (q) => q(`update public.catalogue_entities set name = 'Hacked'`))).rejects.toThrow(/permission denied/);
    await expect(as(db, customer, (q) => q(`delete from public.catalogue_aliases`))).rejects.toThrow(/permission denied/);
  });

  it('rejects invalid status transitions and requires a reason to reject or retire', async () => {
    const id = await idOf('machine.destoner');
    await expect(as(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'draft')`, [id]))).rejects.toThrow(/ITM:invalid_transition/);
    await expect(as(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'retired')`, [id]))).rejects.toThrow(/ITM:note_required/);
  });
});

describe('import', () => {
  const rows = (extra: object[] = []) => JSON.stringify([
    { key: 'manufacturer.example_mills', kind: 'manufacturer', name: 'Example Mills Pvt Ltd',
      sources: [{ source_type: 'manufacturer', source_url: 'https://example.com/about', source_org: 'Example Mills Pvt Ltd', confidence: 'high' }] },
    { key: 'model.example_mills.eh_100', kind: 'model', name: 'EH-100', scope_key: 'manufacturer.example_mills',
      links: [{ relation: 'is_type', to: 'machine.rubber_roll_husker' }],
      sources: [{ source_type: 'manufacturer', source_url: 'https://example.com/eh-100', source_org: 'Example Mills Pvt Ltd' }] },
    ...extra,
  ]);

  it('non-admins cannot import', async () => {
    await expect(as(db, support, (q) => q(`select public.catalogue_import($1::jsonb, 'x.json', 'json', false)`, [rows()]))).rejects.toThrow(/only platform admins/);
  });

  it('a dry run reports results but saves nothing', async () => {
    const r = await as(db, admin, async (q) => {
      const res = (await q<{ r: { created: number; batch_id: string | null } }>(`select public.catalogue_import($1::jsonb, 'x.json', 'json', true) as r`, [rows()])).rows[0]!.r;
      const n = (await q<{ n: number }>(`select count(*)::int n from public.catalogue_entities where key like '%example_mills%'`)).rows[0]!.n;
      return { res, n };
    });
    expect(r.res.created).toBe(2);
    expect(r.res.batch_id).toBeNull();
    expect(r.n).toBe(0);
  });

  it('imports as pending_review, detects exact duplicates and reports bad rows without failing the batch', async () => {
    const res = await asCommit(db, admin, async (q) =>
      (await q<{ r: { created: number; duplicates: number; errors: number; report: { key: string; result: string; duplicate_of?: string; message?: string }[] } }>(
        `select public.catalogue_import($1::jsonb, 'makers.json', 'json', false) as r`,
        [rows([
          { key: 'machine.my_husker_copy', kind: 'machine_type', name: 'Rubber  Roll Husker' },
          { key: 'model.orphan', kind: 'model', name: 'X-1', scope_key: 'manufacturer.missing' },
          { key: 'fault.bad_link', kind: 'fault', name: 'Bad link test', links: [{ relation: 'is_type', to: 'machine.destoner' }] },
        ])],
      )).rows[0]!.r,
    );
    expect(res.created).toBe(3); // manufacturer, model, fault (fault created; its invalid link reported)
    expect(res.duplicates).toBe(1);
    const byKey = Object.fromEntries(res.report.map((x) => [x.key + ':' + x.result, x]));
    expect(byKey['machine.my_husker_copy:duplicate']?.duplicate_of).toBe('machine.rubber_roll_husker');
    expect(byKey['model.orphan:error']?.message).toMatch(/Manufacturer "manufacturer.missing" was not found/);
    expect(byKey['fault.bad_link:error']?.message).toMatch(/cannot be linked/);
    const st = await db.query<{ status: string }>(`select status from public.catalogue_entities where key = 'model.example_mills.eh_100'`);
    expect(st.rows[0]?.status).toBe('pending_review');
  });

  it('re-importing the same file is safe (existing keys are not duplicated)', async () => {
    const res = await asCommit(db, admin, async (q) =>
      (await q<{ r: { created: number; existing: number } }>(`select public.catalogue_import($1::jsonb, 'makers.json', 'json', false) as r`, [rows()])).rows[0]!.r,
    );
    expect(res).toMatchObject({ created: 0, existing: 2 });
  });
});

describe('approval rules for maker-specific records', () => {
  it('a model cannot be approved before its manufacturer', async () => {
    const model = await idOf('model.example_mills.eh_100');
    await expect(as(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [model]))).rejects.toThrow(/ITM:scope_not_approved/);
  });

  it('a manufacturer with only a user suggestion or taxonomy source cannot be approved', async () => {
    await asCommit(db, admin, (q) =>
      q(`select public.catalogue_import($1::jsonb, 'm.json', 'json', false)`, [
        JSON.stringify([{ key: 'manufacturer.unsourced', kind: 'manufacturer', name: 'Unsourced Engineering', sources: [{ source_type: 'user_suggestion' }] }]),
      ]),
    );
    const id = await idOf('manufacturer.unsourced');
    await expect(as(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [id]))).rejects.toThrow(/ITM:source_required/);
  });

  it('with a manufacturer source, the manufacturer and then the model can be approved', async () => {
    const maker = await idOf('manufacturer.example_mills');
    const model = await idOf('model.example_mills.eh_100');
    await asCommit(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [maker]));
    await asCommit(db, admin, (q) => q(`select public.catalogue_set_status(array[$1]::uuid[], 'approved')`, [model]));
    const r = await db.query<{ status: string }>('select status from public.catalogue_entities where id = $1', [model]);
    expect(r.rows[0]?.status).toBe('approved');
  });

  it('"verified" requires a source with a verification date', async () => {
    const maker = await idOf('manufacturer.example_mills');
    await expect(as(db, admin, (q) => q(`select public.catalogue_set_verification($1, 'verified', 'high')`, [maker]))).rejects.toThrow(/ITM:verification_date_required/);
    await as(db, admin, async (q) => {
      await q(`select public.catalogue_add_source($1, 'manufacturer', 'https://example.com/contact', 'Example Mills Pvt Ltd', '2026-11-20', '2026-11-22', 'high', 'Checked contact page')`, [maker]);
      await q(`select public.catalogue_set_verification($1, 'verified', 'high')`, [maker]);
    });
  });

  it('external sources need a URL and organisation', async () => {
    const maker = await idOf('manufacturer.example_mills');
    await expect(as(db, admin, (q) => q(`select public.catalogue_add_source($1, 'manufacturer', null, null, null, null, 'low', null)`, [maker]))).rejects.toThrow(/external_needs_url/);
  });
});

describe('aliases and search', () => {
  const search = (q: Q, text: string, kinds: string[] | null = null) =>
    q<{ r: { event_id: number; results: { key: string; matched_alias: string | null }[] } }>(
      'select public.search_catalogue($1, $2::public.catalogue_kind[]) as r',
      [text, kinds ? `{${kinds.join(',')}}` : null], // PGlite takes arrays as Postgres array text
    ).then((x) => x.rows[0]!.r);

  it('finds machines by alias, misspelling and partial words, approved only', async () => {
    const r1 = await as(db, null, (q) => search(q, 'sheller'));
    expect(r1.results[0]?.key).toBe('machine.rubber_roll_husker');
    expect(r1.results[0]?.matched_alias).toBe('sheller');

    const r2 = await as(db, customer, (q) => search(q, 'color sorter'));
    expect(r2.results[0]?.key).toBe('machine.colour_sorter');

    const r3 = await as(db, customer, (q) => search(q, 'destonr'));
    expect(r3.results.map((x) => x.key)).toContain('machine.destoner');

    const r4 = await as(db, customer, (q) => search(q, 'husk', ['machine_type']));
    expect(r4.results.map((x) => x.key)).toEqual(expect.arrayContaining(['machine.rubber_roll_husker', 'machine.husk_aspirator']));
    expect(r4.results.every((x) => x.key.startsWith('machine.'))).toBe(true);

    const pending = await as(db, customer, (q) => search(q, 'Unsourced Engineering'));
    expect(pending.results).toEqual([]);
  });

  it('logs searches, links a selection to the searcher only, and reports zero-result queries', async () => {
    const { event_id } = await asCommit(db, customer, (q) => search(q, 'rice whitener'));
    const whitener = await idOf('machine.rice_whitener');
    await asCommit(db, customer2, (q) => q('select public.log_catalogue_selection($1, $2)', [event_id, whitener])); // not theirs: ignored
    let sel = await db.query<{ selected_entity_id: string | null }>('select selected_entity_id from public.catalogue_search_events where id = $1', [event_id]);
    expect(sel.rows[0]?.selected_entity_id).toBeNull();
    await asCommit(db, customer, (q) => q('select public.log_catalogue_selection($1, $2)', [event_id, whitener]));
    sel = await db.query('select selected_entity_id from public.catalogue_search_events where id = $1', [event_id]);
    expect(sel.rows[0]?.selected_entity_id).toBe(whitener);

    const none = await asCommit(db, customer, (q) => search(q, 'zqxw warp drive'));
    expect(none.results).toEqual([]);
    const report = await as(db, support, (q) => q<{ r: { zero_result_queries: { query: string }[]; top_selected: { key: string }[] } }>('select public.catalogue_search_report(30) as r'));
    expect(report.rows[0]!.r.zero_result_queries.map((x) => x.query)).toContain('zqxw warp drive');
    expect(report.rows[0]!.r.top_selected.map((x) => x.key)).toContain('machine.rice_whitener');
  });

  it('customers cannot read search analytics', async () => {
    const r = await as(db, customer, (q) => q('select * from public.catalogue_search_events'));
    expect(r.rows).toHaveLength(0);
    await expect(as(db, customer, (q) => q('select public.catalogue_search_report(30)'))).rejects.toThrow(/staff only/);
  });

  it('admins add and remove aliases; duplicates are refused', async () => {
    const husker = await idOf('machine.rubber_roll_husker');
    const id = await asCommit(db, admin, async (q) =>
      (await q<{ id: string }>(`select public.catalogue_add_alias($1, 'పొట్టు తీసే యంత్రం', 'te') as id`, [husker])).rows[0]!.id,
    );
    // Telugu alias is searchable as typed (non-ASCII letters are kept by normalisation).
    const te = await as(db, null, (q) => search(q, 'పొట్టు తీసే'));
    expect(te.results[0]?.key).toBe('machine.rubber_roll_husker');
    await expect(as(db, admin, (q) => q(`select public.catalogue_add_alias($1, 'Sheller', 'en')`, [husker]))).rejects.toThrow(/ITM:alias_exists/);
    await asCommit(db, admin, (q) => q('select public.catalogue_remove_alias($1)', [id]));
    const gone = await db.query('select 1 from public.catalogue_aliases where id = $1', [id]);
    expect(gone.rows).toHaveLength(0);
  });
});

describe('duplicates and merging', () => {
  it('finds similar records and merges them, keeping names as aliases and moving links', async () => {
    // A near-duplicate created by an import.
    await asCommit(db, admin, (q) =>
      q(`select public.catalogue_import($1::jsonb, 'dup.json', 'json', false)`, [
        JSON.stringify([{ key: 'machine.paddy_destoner', kind: 'machine_type', name: 'Paddy destoner', aliases: ['stone picker'],
          links: [{ relation: 'used_in', to: 'stage.rice_mill.destoning' }, { relation: 'used_in', to: 'industry.food_processing' }] }]),
      ]),
    );
    const dup = await idOf('machine.paddy_destoner');
    const target = await idOf('machine.destoner');

    const candidates = await as(db, admin, (q) => q<{ key: string }>('select key from public.catalogue_find_duplicates($1)', [dup]));
    expect(candidates.rows.map((r) => r.key)).toContain('machine.destoner');

    const bearing = await idOf('component.bearing');
    await expect(as(db, admin, (q) => q('select public.catalogue_merge($1, $2, $3)', [dup, bearing, 'x']))).rejects.toThrow(/ITM:merge_kind/);
    await expect(as(db, admin, (q) => q('select public.catalogue_merge($1, $2, $3)', [dup, target, '']))).rejects.toThrow(/ITM:note_required/);

    await asCommit(db, admin, (q) => q('select public.catalogue_merge($1, $2, $3)', [dup, target, 'Same machine']));

    const merged = await db.query<{ status: string; merged_into_id: string }>('select status, merged_into_id from public.catalogue_entities where id = $1', [dup]);
    expect(merged.rows[0]).toEqual({ status: 'merged', merged_into_id: target });
    const aliases = await db.query<{ alias: string }>('select alias from public.catalogue_aliases where entity_id = $1', [target]);
    expect(aliases.rows.map((a) => a.alias)).toEqual(expect.arrayContaining(['Paddy destoner', 'stone picker']));
    const usedIn = await db.query<{ key: string }>(
      `select t.key from public.catalogue_links l join public.catalogue_entities t on t.id = l.to_id where l.from_id = $1 and l.relation = 'used_in'`,
      [target],
    );
    expect(usedIn.rows.map((r) => r.key)).toEqual(expect.arrayContaining(['stage.rice_mill.destoning', 'industry.food_processing']));
    const leftovers = await db.query<{ n: number }>('select count(*)::int n from public.catalogue_links where from_id = $1 or to_id = $1', [dup]);
    expect(leftovers.rows[0]!.n).toBe(0);
    const resolved = await db.query<{ id: string }>('select public.catalogue_resolve($1) as id', [dup]);
    expect(resolved.rows[0]!.id).toBe(target);
  });
});

describe('links', () => {
  it('rejects links that break the relation rules', async () => {
    await expect(
      db.query(`insert into public.catalogue_links (from_id, to_id, relation) values ($1, $2, 'stage_of')`, [
        await idOf('machine.destoner'),
        await idOf('industry.rice_mill'),
      ]),
    ).rejects.toThrow(/ITM:invalid_link/);
  });
});

describe('suggestions', () => {
  it('signed-in users suggest missing entries; existing approved names are refused', async () => {
    await asCommit(db, customer, (q) => q(`select public.suggest_catalogue_entry('machine_type', 'Paddy parboiling dryer combo', 'We have a combined unit', null, 'Some Make', 'PD-9', null)`));
    await expect(as(db, customer, (q) => q(`select public.suggest_catalogue_entry('machine_type', 'Colour Sorter')`))).rejects.toThrow(/ITM:already_in_catalogue/);
    await expect(as(db, null, (q) => q(`select public.suggest_catalogue_entry('machine_type', 'X machine')`))).rejects.toThrow(/permission denied/);
    await expect(as(db, customer, (q) => q(`select public.suggest_catalogue_entry('industry', 'Space mining')`))).rejects.toThrow(/ITM:suggestion_kind/);
  });

  it('users see only their own suggestions', async () => {
    const own = await as(db, customer, (q) => q('select name from public.catalogue_suggestions'));
    expect(own.rows).toHaveLength(1);
    const other = await as(db, customer2, (q) => q('select name from public.catalogue_suggestions'));
    expect(other.rows).toHaveLength(0);
  });

  it('limits a user to 20 suggestions a day', async () => {
    await expect(
      as(db, customer2, async (q) => {
        for (let i = 0; i < 21; i++) await q(`select public.suggest_catalogue_entry('component', $1)`, [`Widget number ${i}`]);
      }),
    ).rejects.toThrow(/ITM:suggestion_limit/);
  });

  it('an admin accepts a suggestion into a pending_review record with a user_suggestion source', async () => {
    const sid = (await db.query<{ id: string }>(`select id from public.catalogue_suggestions where name = 'Paddy parboiling dryer combo'`)).rows[0]!.id;
    const entity = await asCommit(db, admin, async (q) => (await q<{ id: string }>(`select public.catalogue_resolve_suggestion($1, 'create') as id`, [sid])).rows[0]!.id);
    const e = await db.query<{ status: string; source_type: string }>(
      `select e.status, s.source_type from public.catalogue_entities e join public.catalogue_sources s on s.entity_id = e.id where e.id = $1`,
      [entity],
    );
    expect(e.rows[0]).toEqual({ status: 'pending_review', source_type: 'user_suggestion' });
    await expect(as(db, admin, (q) => q(`select public.catalogue_resolve_suggestion($1, 'reject', null, 'x')`, [sid]))).rejects.toThrow(/ITM:already_resolved/);
  });
});
