-- =============================================================================
-- Industrial machine catalogue (Prompt 4)
--
-- One graph of catalogue entities (industry, process stage, discipline,
-- equipment category, machine type, manufacturer, product family, model,
-- controller, component, spare part, fault, service skill) joined by typed
-- links, with aliases, provenance (sources), admin approval, duplicate
-- detection, merging, user suggestions and search analytics.
--
-- Data-quality rules enforced here (docs/catalogue.md):
--   * Nothing is visible to users until a platform admin approves it.
--   * Imports never approve; every imported row starts as pending_review.
--   * Manufacturer-specific records (manufacturer, product family, model,
--     controller, spare part) cannot be approved without an external source
--     with a URL — no invented model numbers.
--   * Compatibility links (part_for, controlled_by) carry their own
--     verification status; unverified links are shown as unverified.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.catalogue_kind as enum (
  'industry', 'process_stage', 'discipline', 'equipment_category', 'machine_type',
  'manufacturer', 'product_family', 'model', 'controller', 'component',
  'spare_part', 'fault', 'service_skill'
);

create type public.catalogue_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'merged', 'retired');
create type public.verification_status as enum ('unverified', 'source_recorded', 'verified', 'disputed');
create type public.confidence_level as enum ('low', 'medium', 'high');
create type public.source_type as enum (
  'platform_taxonomy', 'manufacturer', 'government', 'industry_body', 'distributor', 'user_suggestion', 'other'
);
create type public.catalogue_relation as enum (
  'stage_of',       -- process_stage      → industry
  'used_in',        -- machine_type       → industry | process_stage
  'in_category',    -- machine_type       → equipment_category
  'in_discipline',  -- equipment_category | service_skill → discipline
  'in_family',      -- model              → product_family
  'is_type',        -- model | product_family → machine_type
  'has_component',  -- machine_type | model → component
  'controlled_by',  -- machine_type | model → controller        (compatibility claim)
  'part_for',       -- spare_part         → component | model | machine_type (compatibility claim)
  'fault_of',       -- fault              → machine_type | component | equipment_category
  'skill_for'       -- service_skill      → machine_type | equipment_category | component
);

-- -----------------------------------------------------------------------------
-- Text normalisation (must match normalizeCatalogueText in @itm/core)
-- Lower-case, ASCII punctuation and whitespace collapsed to single spaces.
-- Non-ASCII letters (Telugu, Hindi, Urdu) are kept as they are.
-- -----------------------------------------------------------------------------
create function private.normalize_catalogue_text(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(coalesce(p, '')), '[!-/:-@\[-`{-~[:space:]]+', ' ', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Import batches (referenced by entities)
-- -----------------------------------------------------------------------------
create table public.catalogue_import_batches (
  id            uuid primary key default gen_random_uuid(),
  file_name     text not null check (char_length(file_name) between 1 and 200),
  format        text not null check (format in ('csv', 'json', 'seed', 'manual')),
  row_count     int not null default 0,
  created_count int not null default 0,
  existing_count int not null default 0,
  duplicate_count int not null default 0,
  error_count   int not null default 0,
  report        jsonb not null default '[]'::jsonb,
  imported_by   uuid references public.profiles (id),
  imported_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Entities
-- -----------------------------------------------------------------------------
create table public.catalogue_entities (
  id                  uuid primary key default gen_random_uuid(),
  key                 text not null unique check (key ~ '^[a-z0-9][a-z0-9_.-]{2,120}$'),
  kind                public.catalogue_kind not null,
  name                text not null check (char_length(btrim(name)) between 2 and 200),
  normalized_name     text generated always as (private.normalize_catalogue_text(name)) stored,
  description         text check (description is null or char_length(description) <= 2000),
  -- Manufacturer that owns this record (product_family, model, controller, spare_part).
  scope_id            uuid references public.catalogue_entities (id),
  attributes          jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  regulated_work      text check (regulated_work in ('electrical_installation', 'boiler', 'pressure_vessel', 'lifting_equipment')),
  regulated_note      text check (regulated_note is null or char_length(regulated_note) <= 500),
  is_generic          boolean not null default false,
  sort_order          int not null default 0,
  status              public.catalogue_status not null default 'draft',
  verification_status public.verification_status not null default 'unverified',
  confidence          public.confidence_level,
  merged_into_id      uuid references public.catalogue_entities (id),
  import_batch_id     uuid references public.catalogue_import_batches (id),
  review_note         text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint merged_has_target check ((status = 'merged') = (merged_into_id is not null)),
  constraint not_merged_into_self check (merged_into_id is null or merged_into_id <> id),
  constraint scope_required check (kind not in ('product_family', 'model') or scope_id is not null),
  constraint scope_only_for_maker_records check (
    scope_id is null or kind in ('product_family', 'model', 'controller', 'spare_part')
  )
);

-- One active record per (kind, manufacturer scope, normalised name).
create unique index catalogue_entities_unique_active
  on public.catalogue_entities (kind, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name)
  where status not in ('rejected', 'merged', 'retired');
create index catalogue_entities_name_trgm on public.catalogue_entities using gin (normalized_name extensions.gin_trgm_ops);
create index catalogue_entities_kind_status on public.catalogue_entities (kind, status);
create index catalogue_entities_scope on public.catalogue_entities (scope_id);

create trigger catalogue_entities_touch before update on public.catalogue_entities
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Aliases
-- -----------------------------------------------------------------------------
create table public.catalogue_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.catalogue_entities (id),
  alias       text not null check (char_length(btrim(alias)) between 2 and 200),
  normalized  text generated always as (private.normalize_catalogue_text(alias)) stored,
  language    text not null default 'en' check (language in ('en', 'te', 'hi', 'ur')),
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  unique (entity_id, normalized)
);
create index catalogue_aliases_trgm on public.catalogue_aliases using gin (normalized extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Links
-- -----------------------------------------------------------------------------
create table public.catalogue_links (
  id                  uuid primary key default gen_random_uuid(),
  from_id             uuid not null references public.catalogue_entities (id),
  to_id               uuid not null references public.catalogue_entities (id),
  relation            public.catalogue_relation not null,
  verification_status public.verification_status not null default 'unverified',
  confidence          public.confidence_level,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  unique (from_id, to_id, relation),
  check (from_id <> to_id)
);
create index catalogue_links_to on public.catalogue_links (to_id, relation);

create function private.catalogue_relation_allowed(p_relation public.catalogue_relation,
                                                   p_from public.catalogue_kind,
                                                   p_to public.catalogue_kind)
returns boolean language sql immutable set search_path = '' as $$
  select case p_relation
    when 'stage_of'      then p_from = 'process_stage'  and p_to = 'industry'
    when 'used_in'       then p_from = 'machine_type'   and p_to in ('industry', 'process_stage')
    when 'in_category'   then p_from = 'machine_type'   and p_to = 'equipment_category'
    when 'in_discipline' then p_from in ('equipment_category', 'service_skill') and p_to = 'discipline'
    when 'in_family'     then p_from = 'model'          and p_to = 'product_family'
    when 'is_type'       then p_from in ('model', 'product_family') and p_to = 'machine_type'
    when 'has_component' then p_from in ('machine_type', 'model') and p_to = 'component'
    when 'controlled_by' then p_from in ('machine_type', 'model') and p_to = 'controller'
    when 'part_for'      then p_from = 'spare_part'     and p_to in ('component', 'model', 'machine_type')
    when 'fault_of'      then p_from = 'fault'          and p_to in ('machine_type', 'component', 'equipment_category')
    when 'skill_for'     then p_from = 'service_skill'  and p_to in ('machine_type', 'equipment_category', 'component')
    else false
  end;
$$;

create function private.check_catalogue_link() returns trigger
language plpgsql set search_path = '' as $$
declare f public.catalogue_kind; t public.catalogue_kind;
begin
  select kind into f from public.catalogue_entities where id = new.from_id;
  select kind into t from public.catalogue_entities where id = new.to_id;
  if not private.catalogue_relation_allowed(new.relation, f, t) then
    raise exception 'ITM:invalid_link: A % cannot be linked to a % with "%"', f, t, new.relation;
  end if;
  return new;
end $$;

create trigger catalogue_links_check before insert or update on public.catalogue_links
  for each row execute function private.check_catalogue_link();

-- -----------------------------------------------------------------------------
-- Sources (provenance) — on an entity or on a link
-- -----------------------------------------------------------------------------
create table public.catalogue_sources (
  id                uuid primary key default gen_random_uuid(),
  entity_id         uuid references public.catalogue_entities (id),
  link_id           uuid references public.catalogue_links (id) on delete cascade,
  source_type       public.source_type not null,
  source_url        text check (source_url is null or source_url ~ '^https?://[^\s]+$'),
  source_org        text check (source_org is null or char_length(source_org) between 2 and 200),
  research_date     date not null default current_date,
  verification_date date,
  confidence        public.confidence_level not null default 'low',
  notes             text check (notes is null or char_length(notes) <= 1000),
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint one_target check ((entity_id is null) <> (link_id is null)),
  constraint external_needs_url check (
    source_type in ('platform_taxonomy', 'user_suggestion') or (source_url is not null and source_org is not null)
  ),
  constraint verified_after_research check (verification_date is null or verification_date >= research_date)
);
create index catalogue_sources_entity on public.catalogue_sources (entity_id);

-- -----------------------------------------------------------------------------
-- Approval guard: maker-specific records need an external source; models need
-- an approved manufacturer.
-- -----------------------------------------------------------------------------
create function private.guard_catalogue_approval() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if new.kind in ('manufacturer', 'product_family', 'model', 'controller', 'spare_part') and not exists (
      select 1 from public.catalogue_sources s
      where s.entity_id = new.id
        and s.source_type in ('manufacturer', 'government', 'industry_body', 'distributor')
        and s.source_url is not null
    ) then
      raise exception 'ITM:source_required: "%" needs a manufacturer, government, industry or distributor source with a URL before approval', new.name;
    end if;
    if new.scope_id is not null and not exists (
      select 1 from public.catalogue_entities m where m.id = new.scope_id and m.status = 'approved'
    ) then
      raise exception 'ITM:scope_not_approved: Approve the manufacturer before "%"', new.name;
    end if;
  end if;
  return new;
end $$;

create trigger catalogue_entities_approval before insert or update of status on public.catalogue_entities
  for each row execute function private.guard_catalogue_approval();

-- -----------------------------------------------------------------------------
-- User suggestions
-- -----------------------------------------------------------------------------
create table public.catalogue_suggestions (
  id                 uuid primary key default gen_random_uuid(),
  suggested_by       uuid not null references public.profiles (id),
  kind               public.catalogue_kind not null,
  name               text not null check (char_length(btrim(name)) between 2 and 200),
  details            text check (details is null or char_length(details) <= 1000),
  related_entity_id  uuid references public.catalogue_entities (id),
  manufacturer_name  text check (manufacturer_name is null or char_length(manufacturer_name) <= 200),
  model_name         text check (model_name is null or char_length(model_name) <= 200),
  source_url         text check (source_url is null or source_url ~ '^https?://[^\s]+$'),
  status             text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'duplicate')),
  resolved_entity_id uuid references public.catalogue_entities (id),
  review_note        text check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index catalogue_suggestions_status on public.catalogue_suggestions (status, created_at);

-- -----------------------------------------------------------------------------
-- Search analytics (no personal data beyond the user id; query text normalised)
-- -----------------------------------------------------------------------------
create table public.catalogue_search_events (
  id                 bigint generated always as identity primary key,
  occurred_at        timestamptz not null default now(),
  user_id            uuid references public.profiles (id),
  query              text not null check (char_length(query) <= 100),
  kinds              public.catalogue_kind[],
  result_count       int not null,
  selected_entity_id uuid references public.catalogue_entities (id),
  channel            text not null default 'web' check (channel in ('web', 'android', 'admin'))
);
create index catalogue_search_events_time on public.catalogue_search_events (occurred_at desc);

-- -----------------------------------------------------------------------------
-- RLS and grants: reads only; every write goes through the functions below.
-- -----------------------------------------------------------------------------
alter table public.catalogue_import_batches enable row level security;
alter table public.catalogue_entities       enable row level security;
alter table public.catalogue_aliases        enable row level security;
alter table public.catalogue_links          enable row level security;
alter table public.catalogue_sources        enable row level security;
alter table public.catalogue_suggestions    enable row level security;
alter table public.catalogue_search_events  enable row level security;

revoke all on public.catalogue_import_batches, public.catalogue_entities, public.catalogue_aliases,
  public.catalogue_links, public.catalogue_sources, public.catalogue_suggestions,
  public.catalogue_search_events from anon, authenticated;

grant select on public.catalogue_entities, public.catalogue_aliases, public.catalogue_links,
  public.catalogue_sources to anon, authenticated;
grant select on public.catalogue_suggestions, public.catalogue_search_events,
  public.catalogue_import_batches to authenticated;

create policy catalogue_entities_public on public.catalogue_entities
  for select to anon, authenticated using (status = 'approved');
create policy catalogue_entities_staff on public.catalogue_entities
  for select to authenticated using (private.is_staff());

create policy catalogue_aliases_public on public.catalogue_aliases
  for select to anon, authenticated
  using (exists (select 1 from public.catalogue_entities e where e.id = entity_id and e.status = 'approved'));
create policy catalogue_aliases_staff on public.catalogue_aliases
  for select to authenticated using (private.is_staff());

create policy catalogue_links_public on public.catalogue_links
  for select to anon, authenticated
  using (
    exists (select 1 from public.catalogue_entities e where e.id = from_id and e.status = 'approved')
    and exists (select 1 from public.catalogue_entities e where e.id = to_id and e.status = 'approved')
  );
create policy catalogue_links_staff on public.catalogue_links
  for select to authenticated using (private.is_staff());

create policy catalogue_sources_public on public.catalogue_sources
  for select to anon, authenticated
  using (entity_id is not null and exists (
    select 1 from public.catalogue_entities e where e.id = entity_id and e.status = 'approved'));
create policy catalogue_sources_staff on public.catalogue_sources
  for select to authenticated using (private.is_staff());

create policy catalogue_suggestions_own on public.catalogue_suggestions
  for select to authenticated using (suggested_by = auth.uid());
create policy catalogue_suggestions_staff on public.catalogue_suggestions
  for select to authenticated using (private.is_staff());

create policy catalogue_search_events_staff on public.catalogue_search_events
  for select to authenticated using (private.is_staff());

create policy catalogue_import_batches_admin on public.catalogue_import_batches
  for select to authenticated using (private.is_platform_admin());

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.require_catalogue_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins can manage the catalogue';
  end if;
end $$;

/** Follow merge chains to the surviving record. */
create function public.catalogue_resolve(p_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  with recursive chain(id, merged_into_id, depth) as (
    select id, merged_into_id, 0 from public.catalogue_entities where id = p_id
    union all
    select e.id, e.merged_into_id, c.depth + 1
    from chain c join public.catalogue_entities e on e.id = c.merged_into_id
    where c.depth < 20
  )
  select id from chain where merged_into_id is null limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Import (CSV and JSON are converted to the same JSON rows by @itm/core).
--
-- Row shape:
--   { key, kind, name, description?, scope_key?, attributes?, regulated_work?,
--     regulated_note?, is_generic?, sort_order?, verification_status?, confidence?,
--     aliases?: [ "text" | { alias, language } ],
--     links?: [ { relation, to, verification_status?, confidence? } ],
--     sources?: [ { source_type, source_url?, source_org?, research_date?,
--                   verification_date?, confidence?, notes? } ] }
--
-- Every new entity is created as pending_review. Existing keys are not
-- overwritten (only new aliases, links and sources are added), so re-importing
-- the same file is safe. Exact duplicates (same kind, scope and normalised
-- name under a different key) are skipped; near-duplicates are flagged.
-- -----------------------------------------------------------------------------
create function private.catalogue_import_core(
  p_rows jsonb, p_file_name text, p_format text, p_dry_run boolean, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid;
  v_report jsonb := '[]'::jsonb;
  v_row jsonb;
  v_idx int := 0;
  v_id uuid;
  v_scope uuid;
  v_dup record;
  v_similar jsonb;
  v_created int := 0; v_existing int := 0; v_duplicates int := 0; v_errors int := 0;
  v_item jsonb;
  v_target uuid;
  v_link uuid;
  v_keys_ok text[] := '{}';
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ITM:import_format: The import must be a list of rows';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'ITM:import_too_large: Import at most 5000 rows at a time';
  end if;

  begin -- dry-run savepoint
    insert into public.catalogue_import_batches (file_name, format, row_count, imported_by)
    values (left(coalesce(nullif(btrim(p_file_name), ''), 'import'), 200), p_format, jsonb_array_length(p_rows), p_actor)
    returning id into v_batch;

    -- Pass 1: entities
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      begin
        if coalesce(v_row ->> 'key', '') = '' or coalesce(v_row ->> 'kind', '') = '' or coalesce(v_row ->> 'name', '') = '' then
          raise exception 'ITM:row_invalid: key, kind and name are required';
        end if;

        select id into v_id from public.catalogue_entities where key = v_row ->> 'key';
        if found then
          v_existing := v_existing + 1;
          v_keys_ok := v_keys_ok || (v_row ->> 'key');
          v_report := v_report || jsonb_build_object('row', v_idx, 'key', v_row ->> 'key', 'result', 'exists');
          continue;
        end if;

        v_scope := null;
        if coalesce(v_row ->> 'scope_key', '') <> '' then
          select id into v_scope from public.catalogue_entities where key = v_row ->> 'scope_key';
          if v_scope is null then
            raise exception 'ITM:scope_missing: Manufacturer "%" was not found (import it first or in the same file, earlier)', v_row ->> 'scope_key';
          end if;
        end if;

        select e.key, e.name into v_dup
        from public.catalogue_entities e
        where e.kind = (v_row ->> 'kind')::public.catalogue_kind
          and coalesce(e.scope_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_scope, '00000000-0000-0000-0000-000000000000'::uuid)
          and e.normalized_name = private.normalize_catalogue_text(v_row ->> 'name')
          and e.status not in ('rejected', 'merged', 'retired')
        limit 1;
        if found then
          v_duplicates := v_duplicates + 1;
          v_report := v_report || jsonb_build_object('row', v_idx, 'key', v_row ->> 'key', 'result', 'duplicate',
                                                     'duplicate_of', v_dup.key, 'message', format('Same as existing "%s"', v_dup.name));
          continue;
        end if;

        insert into public.catalogue_entities (
          key, kind, name, description, scope_id, attributes, regulated_work, regulated_note, is_generic,
          sort_order, status, verification_status, confidence, import_batch_id, created_by)
        values (
          v_row ->> 'key',
          (v_row ->> 'kind')::public.catalogue_kind,
          btrim(v_row ->> 'name'),
          nullif(btrim(v_row ->> 'description'), ''),
          v_scope,
          coalesce(v_row -> 'attributes', '{}'::jsonb),
          nullif(v_row ->> 'regulated_work', ''),
          nullif(btrim(v_row ->> 'regulated_note'), ''),
          coalesce((v_row ->> 'is_generic')::boolean, false),
          coalesce((v_row ->> 'sort_order')::int, 0),
          'pending_review',
          coalesce(nullif(v_row ->> 'verification_status', '')::public.verification_status, 'unverified'),
          nullif(v_row ->> 'confidence', '')::public.confidence_level,
          v_batch,
          p_actor)
        returning id into v_id;

        select coalesce(jsonb_agg(jsonb_build_object('key', s.key, 'name', s.name, 'similarity', round(s.sim::numeric, 2))), '[]'::jsonb)
        into v_similar
        from (
          select e.key, e.name, extensions.similarity(e.normalized_name, private.normalize_catalogue_text(v_row ->> 'name')) as sim
          from public.catalogue_entities e
          where e.id <> v_id and e.kind = (v_row ->> 'kind')::public.catalogue_kind
            and e.status not in ('rejected', 'merged', 'retired')
            and extensions.similarity(e.normalized_name, private.normalize_catalogue_text(v_row ->> 'name')) >= 0.6
          order by sim desc limit 3
        ) s;

        v_created := v_created + 1;
        v_keys_ok := v_keys_ok || (v_row ->> 'key');
        v_report := v_report || jsonb_build_object('row', v_idx, 'key', v_row ->> 'key', 'result', 'created')
                    || case when jsonb_array_length(v_similar) > 0 then jsonb_build_object('possible_duplicates', v_similar) else '{}'::jsonb end;
      exception
        when others then
          v_errors := v_errors + 1;
          v_report := v_report || jsonb_build_object('row', v_idx, 'key', v_row ->> 'key', 'result', 'error',
            'message', regexp_replace(sqlerrm, '^ITM:[a-z_]+:\s*', ''));
      end;
    end loop;

    -- Pass 2: aliases, sources, links for rows that exist now
    v_idx := 0;
    for v_row in select value from jsonb_array_elements(p_rows) loop
      v_idx := v_idx + 1;
      continue when not ((v_row ->> 'key') = any (v_keys_ok));
      select id into v_id from public.catalogue_entities where key = v_row ->> 'key';
      begin
        for v_item in select value from jsonb_array_elements(coalesce(v_row -> 'aliases', '[]'::jsonb)) loop
          insert into public.catalogue_aliases (entity_id, alias, language, created_by)
          values (
            v_id,
            btrim(case when jsonb_typeof(v_item) = 'string' then v_item #>> '{}' else v_item ->> 'alias' end),
            coalesce(case when jsonb_typeof(v_item) = 'object' then nullif(v_item ->> 'language', '') end, 'en'),
            p_actor)
          on conflict (entity_id, normalized) do nothing;
        end loop;

        for v_item in select value from jsonb_array_elements(coalesce(v_row -> 'sources', '[]'::jsonb)) loop
          if not exists (
            select 1 from public.catalogue_sources s
            where s.entity_id = v_id and s.source_type = (v_item ->> 'source_type')::public.source_type
              and s.source_url is not distinct from nullif(v_item ->> 'source_url', '')
          ) then
            insert into public.catalogue_sources (entity_id, source_type, source_url, source_org, research_date,
                                                  verification_date, confidence, notes, created_by)
            values (
              v_id,
              (v_item ->> 'source_type')::public.source_type,
              nullif(v_item ->> 'source_url', ''),
              nullif(v_item ->> 'source_org', ''),
              coalesce(nullif(v_item ->> 'research_date', '')::date, current_date),
              nullif(v_item ->> 'verification_date', '')::date,
              coalesce(nullif(v_item ->> 'confidence', '')::public.confidence_level, 'low'),
              nullif(v_item ->> 'notes', ''),
              p_actor);
          end if;
        end loop;

        for v_item in select value from jsonb_array_elements(coalesce(v_row -> 'links', '[]'::jsonb)) loop
          select id into v_target from public.catalogue_entities where key = v_item ->> 'to';
          if v_target is null then
            raise exception 'ITM:link_target_missing: Linked record "%" was not found', v_item ->> 'to';
          end if;
          insert into public.catalogue_links (from_id, to_id, relation, verification_status, confidence, created_by)
          values (
            v_id, v_target, (v_item ->> 'relation')::public.catalogue_relation,
            coalesce(nullif(v_item ->> 'verification_status', '')::public.verification_status, 'unverified'),
            nullif(v_item ->> 'confidence', '')::public.confidence_level,
            p_actor)
          on conflict (from_id, to_id, relation) do nothing;
        end loop;
      exception
        when others then
          v_errors := v_errors + 1;
          v_report := v_report || jsonb_build_object('row', v_idx, 'key', v_row ->> 'key', 'result', 'error',
            'message', regexp_replace(sqlerrm, '^ITM:[a-z_]+:\s*', ''));
      end;
    end loop;

    update public.catalogue_import_batches
    set created_count = v_created, existing_count = v_existing, duplicate_count = v_duplicates,
        error_count = v_errors, report = v_report
    where id = v_batch;

    if p_actor is not null then
      perform private.audit('catalogue.imported', 'catalogue_import_batch', v_batch::text,
        jsonb_build_object('file', p_file_name, 'created', v_created, 'existing', v_existing,
                           'duplicates', v_duplicates, 'errors', v_errors));
    end if;

    if p_dry_run then
      raise exception 'ITM_DRY_RUN';
    end if;
  exception
    when raise_exception then
      if sqlerrm <> 'ITM_DRY_RUN' then raise; end if;
      v_batch := null; -- rolled back
  end;

  return jsonb_build_object(
    'batch_id', v_batch, 'dry_run', p_dry_run, 'rows', jsonb_array_length(p_rows),
    'created', v_created, 'existing', v_existing, 'duplicates', v_duplicates, 'errors', v_errors,
    'report', v_report);
end $$;

create function public.catalogue_import(p_rows jsonb, p_file_name text, p_format text, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_catalogue_admin();
  if p_format not in ('csv', 'json', 'manual') then
    raise exception 'ITM:import_format: Format must be csv, json or manual';
  end if;
  return private.catalogue_import_core(p_rows, p_file_name, p_format, p_dry_run, auth.uid());
end $$;

-- -----------------------------------------------------------------------------
-- Status workflow (approval)
-- -----------------------------------------------------------------------------
create function public.catalogue_set_status(p_ids uuid[], p_status public.catalogue_status, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare e public.catalogue_entities; n int := 0;
begin
  perform private.require_catalogue_admin();
  if p_status = 'merged' then
    raise exception 'ITM:use_merge: Use merge to combine records';
  end if;
  if p_status in ('rejected', 'retired') and coalesce(btrim(p_note), '') = '' then
    raise exception 'ITM:note_required: Give a reason when rejecting or retiring';
  end if;
  for e in select * from public.catalogue_entities where id = any (p_ids) for update loop
    if not (
      (e.status = 'draft'          and p_status in ('pending_review', 'rejected')) or
      (e.status = 'pending_review' and p_status in ('approved', 'rejected', 'draft')) or
      (e.status = 'approved'       and p_status = 'retired') or
      (e.status = 'rejected'       and p_status = 'pending_review') or
      (e.status = 'retired'        and p_status = 'approved')
    ) then
      raise exception 'ITM:invalid_transition: "%" cannot move from % to %', e.name, e.status, p_status;
    end if;
    update public.catalogue_entities
    set status = p_status, review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = e.id;
    perform private.audit('catalogue.status_changed', 'catalogue_entity', e.id::text,
      jsonb_build_object('key', e.key, 'from', e.status, 'to', p_status, 'note', p_note));
    n := n + 1;
  end loop;
  return n;
end $$;

create function public.catalogue_set_verification(p_id uuid, p_status public.verification_status, p_confidence public.confidence_level)
returns void language plpgsql security definer set search_path = '' as $$
declare e public.catalogue_entities;
begin
  perform private.require_catalogue_admin();
  select * into e from public.catalogue_entities where id = p_id;
  if not found then raise exception 'ITM:not_found: Catalogue record not found'; end if;
  if p_status = 'verified' and not exists (
    select 1 from public.catalogue_sources s where s.entity_id = p_id and s.verification_date is not null
  ) then
    raise exception 'ITM:verification_date_required: Record a source with a verification date before marking it verified';
  end if;
  update public.catalogue_entities set verification_status = p_status, confidence = p_confidence where id = p_id;
  perform private.audit('catalogue.verification_changed', 'catalogue_entity', p_id::text,
    jsonb_build_object('key', e.key, 'from', e.verification_status, 'to', p_status, 'confidence', p_confidence));
end $$;

-- -----------------------------------------------------------------------------
-- Aliases and sources
-- -----------------------------------------------------------------------------
create function public.catalogue_add_alias(p_entity uuid, p_alias text, p_language text default 'en')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_catalogue_admin();
  insert into public.catalogue_aliases (entity_id, alias, language, created_by)
  values (p_entity, btrim(p_alias), coalesce(p_language, 'en'), auth.uid())
  on conflict (entity_id, normalized) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'ITM:alias_exists: That alias already exists for this record'; end if;
  perform private.audit('catalogue.alias_added', 'catalogue_entity', p_entity::text, jsonb_build_object('alias', p_alias));
  return v_id;
end $$;

create function public.catalogue_remove_alias(p_alias_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.catalogue_aliases;
begin
  perform private.require_catalogue_admin();
  delete from public.catalogue_aliases where id = p_alias_id returning * into a;
  if a.id is null then raise exception 'ITM:not_found: Alias not found'; end if;
  perform private.audit('catalogue.alias_removed', 'catalogue_entity', a.entity_id::text, jsonb_build_object('alias', a.alias));
end $$;

create function public.catalogue_add_source(
  p_entity uuid, p_source_type public.source_type, p_source_url text, p_source_org text,
  p_research_date date, p_verification_date date, p_confidence public.confidence_level, p_notes text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_catalogue_admin();
  insert into public.catalogue_sources (entity_id, source_type, source_url, source_org, research_date,
                                        verification_date, confidence, notes, created_by)
  values (p_entity, p_source_type, nullif(btrim(p_source_url), ''), nullif(btrim(p_source_org), ''),
          coalesce(p_research_date, current_date), p_verification_date, coalesce(p_confidence, 'low'),
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  update public.catalogue_entities
  set verification_status = 'source_recorded'
  where id = p_entity and verification_status = 'unverified' and p_source_type not in ('platform_taxonomy', 'user_suggestion');
  perform private.audit('catalogue.source_added', 'catalogue_entity', p_entity::text,
    jsonb_build_object('type', p_source_type, 'url', p_source_url));
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Duplicates and merging
-- -----------------------------------------------------------------------------
create function public.catalogue_find_duplicates(p_entity uuid, p_threshold real default 0.45)
returns table (id uuid, key text, name text, status public.catalogue_status, similarity real, matched_on text)
language plpgsql stable security definer set search_path = '' as $$
declare e public.catalogue_entities;
begin
  if not private.is_staff() then
    raise exception using errcode = '42501', message = 'staff only';
  end if;
  select * into e from public.catalogue_entities c where c.id = p_entity;
  return query
  select x.id, x.key, x.name, x.status, max(x.sim)::real, (array_agg(x.matched order by x.sim desc))[1]
  from (
    select c.id, c.key, c.name, c.status,
           extensions.similarity(c.normalized_name, e.normalized_name) as sim, 'name'::text as matched
    from public.catalogue_entities c
    where c.kind = e.kind and c.id <> e.id and c.status not in ('merged', 'rejected')
    union all
    select c.id, c.key, c.name, c.status,
           extensions.similarity(a.normalized, e.normalized_name), 'alias: ' || a.alias
    from public.catalogue_aliases a join public.catalogue_entities c on c.id = a.entity_id
    where c.kind = e.kind and c.id <> e.id and c.status not in ('merged', 'rejected')
  ) x
  where x.sim >= p_threshold
  group by x.id, x.key, x.name, x.status
  order by 5 desc
  limit 10;
end $$;

create function public.catalogue_merge(p_from uuid, p_into uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare f public.catalogue_entities; t public.catalogue_entities;
begin
  perform private.require_catalogue_admin();
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'ITM:note_required: Give a reason for the merge';
  end if;
  select * into f from public.catalogue_entities where id = p_from for update;
  select * into t from public.catalogue_entities where id = p_into for update;
  if f.id is null or t.id is null then raise exception 'ITM:not_found: Catalogue record not found'; end if;
  if f.id = t.id then raise exception 'ITM:merge_self: A record cannot be merged into itself'; end if;
  if f.kind <> t.kind then raise exception 'ITM:merge_kind: Only records of the same kind can be merged'; end if;
  if f.status = 'merged' or t.status in ('merged', 'rejected') then
    raise exception 'ITM:merge_status: Merge into an active record only';
  end if;

  -- Names and aliases of the old record become aliases of the surviving one.
  insert into public.catalogue_aliases (entity_id, alias, language, created_by)
  select t.id, f.name, 'en', auth.uid()
  where private.normalize_catalogue_text(f.name) <> t.normalized_name
  on conflict (entity_id, normalized) do nothing;
  insert into public.catalogue_aliases (entity_id, alias, language, created_by)
  select t.id, a.alias, a.language, a.created_by from public.catalogue_aliases a
  where a.entity_id = f.id and a.normalized <> t.normalized_name
  on conflict (entity_id, normalized) do nothing;
  delete from public.catalogue_aliases where entity_id = f.id;

  -- Links: repoint, dropping ones that would duplicate or point at itself.
  delete from public.catalogue_links l
  where (l.from_id = f.id and (l.to_id = t.id or exists (
           select 1 from public.catalogue_links x where x.from_id = t.id and x.to_id = l.to_id and x.relation = l.relation)))
     or (l.to_id = f.id and (l.from_id = t.id or exists (
           select 1 from public.catalogue_links x where x.to_id = t.id and x.from_id = l.from_id and x.relation = l.relation)));
  update public.catalogue_links set from_id = t.id where from_id = f.id;
  update public.catalogue_links set to_id = t.id where to_id = f.id;

  update public.catalogue_sources set entity_id = t.id where entity_id = f.id;
  update public.catalogue_entities set scope_id = t.id where scope_id = f.id;
  update public.catalogue_suggestions set resolved_entity_id = t.id where resolved_entity_id = f.id;

  update public.catalogue_entities
  set status = 'merged', merged_into_id = t.id, review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now()
  where id = f.id;

  perform private.audit('catalogue.merged', 'catalogue_entity', f.id::text,
    jsonb_build_object('from_key', f.key, 'into_key', t.key, 'note', p_note));
end $$;

-- -----------------------------------------------------------------------------
-- Search (approved records only) with analytics
-- -----------------------------------------------------------------------------
create function public.search_catalogue(
  p_query text, p_kinds public.catalogue_kind[] default null, p_limit int default 20, p_channel text default 'web'
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  q text := left(private.normalize_catalogue_text(p_query), 100);
  v_results jsonb;
  v_event bigint;
begin
  if char_length(q) < 2 then
    return jsonb_build_object('event_id', null, 'results', '[]'::jsonb);
  end if;
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  with candidates as (
    select e.id, e.normalized_name as matched, null::text as alias
    from public.catalogue_entities e
    where e.status = 'approved' and (p_kinds is null or e.kind = any (p_kinds))
      and (e.normalized_name like '%' || q || '%' or extensions.similarity(e.normalized_name, q) >= 0.35
           or extensions.word_similarity(q, e.normalized_name) >= 0.6)
    union all
    select e.id, a.normalized, a.alias
    from public.catalogue_aliases a join public.catalogue_entities e on e.id = a.entity_id
    where e.status = 'approved' and (p_kinds is null or e.kind = any (p_kinds))
      and (a.normalized like '%' || q || '%' or extensions.similarity(a.normalized, q) >= 0.35
           or extensions.word_similarity(q, a.normalized) >= 0.6)
  ),
  scored as (
    select c.id, c.alias,
           case when c.matched = q then 1.0
                when c.matched like q || '%' then 0.9
                when c.matched like '%' || q || '%' then 0.8
                else greatest(extensions.similarity(c.matched, q), extensions.word_similarity(q, c.matched) * 0.9)
           end as score
    from candidates c
  ),
  best as (
    select distinct on (s.id) s.id, s.alias, s.score from scored s order by s.id, s.score desc, s.alias nulls first
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'key', e.key, 'kind', e.kind, 'name', e.name, 'matched_alias', b.alias,
           'score', round(b.score::numeric, 2), 'is_generic', e.is_generic, 'regulated_work', e.regulated_work,
           'description', e.description)
         order by b.score desc, e.is_generic, e.name), '[]'::jsonb)
  into v_results
  from (select * from best order by score desc limit p_limit) b
  join public.catalogue_entities e on e.id = b.id;

  insert into public.catalogue_search_events (user_id, query, kinds, result_count, channel)
  values (auth.uid(), q, p_kinds, jsonb_array_length(v_results),
          case when p_channel in ('web', 'android', 'admin') then p_channel else 'web' end)
  returning id into v_event;

  return jsonb_build_object('event_id', v_event, 'results', v_results);
end $$;

create function public.log_catalogue_selection(p_event_id bigint, p_entity_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.catalogue_search_events
  set selected_entity_id = p_entity_id
  where id = p_event_id and selected_entity_id is null
    and user_id is not distinct from auth.uid()
    and occurred_at > now() - interval '1 hour'
    and exists (select 1 from public.catalogue_entities e where e.id = p_entity_id and e.status = 'approved');
end $$;

create function public.catalogue_search_report(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365));
begin
  if not private.is_staff() then
    raise exception using errcode = '42501', message = 'staff only';
  end if;
  return jsonb_build_object(
    'since', since,
    'total_searches', (select count(*) from public.catalogue_search_events where occurred_at >= since),
    'with_selection', (select count(*) from public.catalogue_search_events where occurred_at >= since and selected_entity_id is not null),
    'top_queries', coalesce((
      select jsonb_agg(t) from (
        select query, count(*) as searches, round(avg(result_count), 1) as avg_results,
               count(selected_entity_id) as selections
        from public.catalogue_search_events where occurred_at >= since
        group by query order by count(*) desc, query limit 25) t), '[]'::jsonb),
    'zero_result_queries', coalesce((
      select jsonb_agg(t) from (
        select query, count(*) as searches, max(occurred_at) as last_seen
        from public.catalogue_search_events where occurred_at >= since and result_count = 0
        group by query order by count(*) desc, query limit 25) t), '[]'::jsonb),
    'top_selected', coalesce((
      select jsonb_agg(t) from (
        select e.key, e.name, count(*) as selections
        from public.catalogue_search_events s join public.catalogue_entities e on e.id = s.selected_entity_id
        where s.occurred_at >= since
        group by e.key, e.name order by count(*) desc limit 25) t), '[]'::jsonb)
  );
end $$;

-- -----------------------------------------------------------------------------
-- Suggestions
-- -----------------------------------------------------------------------------
create function public.suggest_catalogue_entry(
  p_kind public.catalogue_kind, p_name text, p_details text default null, p_related_entity uuid default null,
  p_manufacturer_name text default null, p_model_name text default null, p_source_url text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_active_user();
  if p_kind not in ('machine_type', 'manufacturer', 'model', 'component', 'spare_part', 'fault', 'service_skill', 'controller') then
    raise exception 'ITM:suggestion_kind: Suggestions can be machines, makes, models, components, parts, problems or skills';
  end if;
  if (select count(*) from public.catalogue_suggestions
      where suggested_by = auth.uid() and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'ITM:suggestion_limit: You have sent many suggestions today. Please try again tomorrow.';
  end if;
  if exists (
    select 1 from public.catalogue_entities e
    where e.kind = p_kind and e.status = 'approved' and e.normalized_name = private.normalize_catalogue_text(p_name)
  ) then
    raise exception 'ITM:already_in_catalogue: "%" is already in the catalogue', btrim(p_name);
  end if;
  insert into public.catalogue_suggestions (suggested_by, kind, name, details, related_entity_id,
                                            manufacturer_name, model_name, source_url)
  values (auth.uid(), p_kind, btrim(p_name), nullif(btrim(p_details), ''), p_related_entity,
          nullif(btrim(p_manufacturer_name), ''), nullif(btrim(p_model_name), ''), nullif(btrim(p_source_url), ''))
  returning id into v_id;
  return v_id;
end $$;

-- action: 'create' (new pending_review record), 'link' (already exists → p_entity),
--         'reject'
create function public.catalogue_resolve_suggestion(p_id uuid, p_action text, p_entity uuid default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.catalogue_suggestions; v_entity uuid;
begin
  perform private.require_catalogue_admin();
  select * into s from public.catalogue_suggestions where id = p_id for update;
  if not found then raise exception 'ITM:not_found: Suggestion not found'; end if;
  if s.status <> 'pending' then raise exception 'ITM:already_resolved: This suggestion was already handled'; end if;

  if p_action = 'create' then
    insert into public.catalogue_entities (key, kind, name, description, status, created_by)
    values ('suggested.' || replace(s.id::text, '-', ''), s.kind, s.name, s.details, 'pending_review', auth.uid())
    returning id into v_entity;
    insert into public.catalogue_sources (entity_id, source_type, source_url, source_org, confidence, notes, created_by)
    values (v_entity, 'user_suggestion', s.source_url, null, 'low',
            concat_ws(' · ', 'Suggested by a user', 'make: ' || s.manufacturer_name, 'model: ' || s.model_name), auth.uid());
    update public.catalogue_suggestions set status = 'accepted', resolved_entity_id = v_entity,
      review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'link' then
    if p_entity is null then raise exception 'ITM:entity_required: Choose the existing record'; end if;
    v_entity := public.catalogue_resolve(p_entity);
    update public.catalogue_suggestions set status = 'duplicate', resolved_entity_id = v_entity,
      review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  elsif p_action = 'reject' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'ITM:note_required: Give a reason when rejecting'; end if;
    update public.catalogue_suggestions set status = 'rejected',
      review_note = btrim(p_note), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  else
    raise exception 'ITM:invalid_action: Unknown action';
  end if;

  perform private.audit('catalogue.suggestion_resolved', 'catalogue_suggestion', p_id::text,
    jsonb_build_object('action', p_action, 'entity', v_entity));
  return v_entity;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;

-- Re-grant foundation helpers used in RLS policies (the revoke above is schema-wide).
grant execute on function
  private.has_role(public.app_role, uuid),
  private.is_active_user(),
  private.is_staff(),
  private.is_platform_admin(),
  private.is_org_member(uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;

-- Foundation RPCs
grant execute on function
  public.register_role(public.app_role),
  public.create_organization(text),
  public.grant_staff_role(uuid, public.app_role),
  public.revoke_role(uuid),
  public.accept_legal_document(uuid, text, text),
  public.get_my_context()
to authenticated;

-- Catalogue: public search; signed-in suggestions and selection logging; the rest admin (checked inside).
grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function
  public.log_catalogue_selection(bigint, uuid),
  public.suggest_catalogue_entry(public.catalogue_kind, text, text, uuid, text, text, text),
  public.catalogue_resolve(uuid),
  public.catalogue_import(jsonb, text, text, boolean),
  public.catalogue_set_status(uuid[], public.catalogue_status, text),
  public.catalogue_set_verification(uuid, public.verification_status, public.confidence_level),
  public.catalogue_add_alias(uuid, text, text),
  public.catalogue_remove_alias(uuid),
  public.catalogue_add_source(uuid, public.source_type, text, text, date, date, public.confidence_level, text),
  public.catalogue_find_duplicates(uuid, real),
  public.catalogue_merge(uuid, uuid, text),
  public.catalogue_search_report(int),
  public.catalogue_resolve_suggestion(uuid, text, uuid, text)
to authenticated;
