-- =============================================================================
-- Service requests and provider discovery (Prompt 6)
--
-- The customer describes the problem, finds suitable providers ("why this
-- match" reasons), contacts one or more (invitations), and selects one.
-- The platform never assigns or dispatches a provider.
--
-- Privacy:
--   * Providers only see requests they were invited to; the factory's exact
--     address and the customer's full name only after they accept.
--   * Phone numbers are never exposed here (contact sharing is Prompt 7).
--   * Matching runs inside the database so customers never read providers'
--     coordinates or documents — only approximate distance and reasons.
-- =============================================================================

create type public.job_status as enum (
  'submitted', 'finding_providers', 'provider_contacted', 'discussion', 'estimate_sent', 'awaiting_approval',
  'approved', 'scheduled', 'provider_travelling', 'provider_arrived', 'work_in_progress', 'waiting_for_parts',
  'work_completed', 'customer_confirmation_pending', 'closed', 'cancelled', 'disputed'
);
create type public.service_type as enum ('breakdown', 'maintenance', 'installation', 'inspection', 'other');
create type public.request_urgency as enum ('emergency', 'within_3_days', 'this_week', 'flexible');
create type public.invitation_status as enum ('invited', 'accepted', 'declined', 'withdrawn', 'not_selected', 'closed');

create sequence public.service_request_ref_seq;

-- -----------------------------------------------------------------------------
-- Requests
-- -----------------------------------------------------------------------------
create table public.service_requests (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  customer_id           uuid not null references public.profiles (id),
  factory_id            uuid not null references public.factories (id),
  customer_machine_id   uuid references public.customer_machines (id),
  industry_id           uuid references public.catalogue_entities (id),
  machine_type_id       uuid not null references public.catalogue_entities (id),
  manufacturer_id       uuid references public.catalogue_entities (id),
  model_id              uuid references public.catalogue_entities (id),
  manufacturer_text     text check (manufacturer_text is null or char_length(manufacturer_text) <= 200),
  model_text            text check (model_text is null or char_length(model_text) <= 200),
  service_type          public.service_type not null,
  symptoms              text[] not null default '{}'
                        check (symptoms <@ array['machine_stopped', 'unusual_noise', 'vibration', 'overheating', 'low_output',
                                                 'electrical_fault', 'automation_fault', 'regular_service', 'installation', 'other']),
  description           text not null check (char_length(btrim(description)) between 10 and 2000),
  urgency               public.request_urgency not null default 'flexible',
  preferred_date        date,
  status                public.job_status not null default 'submitted',
  selected_provider_id  uuid references public.provider_profiles (id),
  cancel_reason         text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  closed_at             timestamptz
);
create index service_requests_customer on public.service_requests (customer_id, created_at desc);
create index service_requests_status on public.service_requests (status);
create trigger service_requests_touch before update on public.service_requests
  for each row execute function private.touch_updated_at();

-- Every status change, append-only.
create table public.job_status_events (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.service_requests (id),
  from_status public.job_status,
  to_status   public.job_status not null,
  actor_id    uuid references public.profiles (id),
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index job_status_events_request on public.job_status_events (request_id, id);
create trigger job_status_events_no_update before update or delete on public.job_status_events
  for each row execute function private.block_audit_mutation();

create table public.request_attachments (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.service_requests (id),
  kind         text not null check (kind in ('photo', 'video', 'voice')),
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   int not null check (size_bytes between 1 and 52428800),
  uploaded_by  uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  constraint attachment_mime check (
    (kind = 'photo' and mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic'))
    or (kind = 'video' and mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'))
    or (kind = 'voice' and mime_type in ('audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/3gpp'))
  )
);
create index request_attachments_request on public.request_attachments (request_id);

create table public.match_results (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  rank                int not null,
  score               numeric(6, 2) not null,
  reasons             jsonb not null,
  distance_km         int,
  created_at          timestamptz not null default now()
);
create index match_results_request on public.match_results (request_id, rank);

create table public.request_invitations (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  status              public.invitation_status not null default 'invited',
  match_score         numeric(6, 2),
  match_reasons       jsonb,
  invited_by          uuid not null references public.profiles (id),
  invited_at          timestamptz not null default now(),
  responded_at        timestamptz,
  responded_by        uuid references public.profiles (id),
  decline_reason      text check (decline_reason is null or char_length(decline_reason) <= 500),
  unique (request_id, provider_profile_id)
);
create index request_invitations_provider on public.request_invitations (provider_profile_id, status);

-- Media bucket: photos, short videos, voice notes (private; signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-media', 'request-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
              'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/3gpp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------
create function private.is_request_customer(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.service_requests r where r.id = p_request and r.customer_id = auth.uid());
$$;

/** Signed-in user manages a provider that was invited to this request (and not withdrawn). */
create function private.is_request_provider(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.request_invitations i
    where i.request_id = p_request and i.status <> 'withdrawn' and private.can_manage_provider(i.provider_profile_id)
  );
$$;

create function private.is_engaged_provider(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.request_invitations i
    where i.request_id = p_request and i.status in ('accepted') and private.can_manage_provider(i.provider_profile_id)
  );
$$;

create function private.can_view_request(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_request_customer(p_request) or private.is_request_provider(p_request) or private.is_staff();
$$;

-- -----------------------------------------------------------------------------
-- Job status machine (refined in Prompt 10)
-- -----------------------------------------------------------------------------
create function private.job_transition_allowed(p_from public.job_status, p_to public.job_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'submitted'                     then p_to in ('finding_providers', 'provider_contacted', 'cancelled')
    when 'finding_providers'             then p_to in ('provider_contacted', 'cancelled')
    when 'provider_contacted'            then p_to in ('discussion', 'finding_providers', 'cancelled')
    when 'discussion'                    then p_to in ('estimate_sent', 'finding_providers', 'provider_contacted', 'cancelled')
    when 'estimate_sent'                 then p_to in ('awaiting_approval', 'discussion', 'cancelled')
    when 'awaiting_approval'             then p_to in ('approved', 'discussion', 'cancelled')
    when 'approved'                      then p_to in ('scheduled', 'awaiting_approval', 'cancelled')
    when 'scheduled'                     then p_to in ('provider_travelling', 'provider_arrived', 'work_in_progress', 'awaiting_approval', 'cancelled')
    when 'provider_travelling'           then p_to in ('provider_arrived', 'cancelled')
    when 'provider_arrived'              then p_to in ('work_in_progress', 'cancelled')
    when 'work_in_progress'              then p_to in ('waiting_for_parts', 'work_completed', 'awaiting_approval', 'disputed')
    when 'waiting_for_parts'             then p_to in ('work_in_progress', 'awaiting_approval', 'disputed', 'cancelled')
    when 'work_completed'                then p_to in ('customer_confirmation_pending')
    when 'customer_confirmation_pending' then p_to in ('closed', 'disputed')
    when 'disputed'                      then p_to in ('closed')
    else false
  end;
$$;

/** The only way a job's status changes. Validates the transition and records the event. */
create function private.change_job_status(p_request uuid, p_to public.job_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_from public.job_status;
begin
  select status into v_from from public.service_requests where id = p_request for update;
  if v_from = p_to then return; end if;
  if not private.job_transition_allowed(v_from, p_to) then
    raise exception 'ITM:invalid_job_transition: A job cannot move from % to %', replace(v_from::text, '_', ' '), replace(p_to::text, '_', ' ');
  end if;
  update public.service_requests
  set status = p_to, closed_at = case when p_to in ('closed', 'cancelled') then now() else closed_at end
  where id = p_request;
  insert into public.job_status_events (request_id, from_status, to_status, actor_id, note)
  values (p_request, v_from, p_to, auth.uid(), nullif(btrim(p_note), ''));
end $$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.service_requests    enable row level security;
alter table public.job_status_events   enable row level security;
alter table public.request_attachments enable row level security;
alter table public.match_results       enable row level security;
alter table public.request_invitations enable row level security;

revoke all on public.service_requests, public.job_status_events, public.request_attachments,
  public.match_results, public.request_invitations from anon, authenticated;
grant select on public.service_requests, public.job_status_events, public.request_attachments,
  public.match_results, public.request_invitations to authenticated;

create policy service_requests_read on public.service_requests for select to authenticated
  using (customer_id = auth.uid() or private.is_request_provider(id) or private.is_staff());
create policy job_status_events_read on public.job_status_events for select to authenticated
  using (private.can_view_request(request_id));
create policy request_attachments_read on public.request_attachments for select to authenticated
  using (private.can_view_request(request_id));
create policy match_results_read on public.match_results for select to authenticated
  using (private.is_request_customer(request_id) or private.is_staff());
create policy request_invitations_read on public.request_invitations for select to authenticated
  using (private.is_request_customer(request_id) or private.can_manage_provider(provider_profile_id) or private.is_staff());

-- Storage: <request_id>/<file>. Customer uploads; customer, invited providers and staff read.
create policy request_media_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-media'
    and private.is_request_customer(private.try_uuid((storage.foldername(name))[1]))
    and private.is_active_user()
  );
create policy request_media_read on storage.objects for select to authenticated
  using (bucket_id = 'request-media' and private.can_view_request(private.try_uuid((storage.foldername(name))[1])));
create policy request_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'request-media'
    and private.is_request_customer(private.try_uuid((storage.foldername(name))[1]))
    and not exists (select 1 from public.request_attachments a where a.storage_path = name)
  );

-- -----------------------------------------------------------------------------
-- Create a request
-- -----------------------------------------------------------------------------
create function public.create_service_request(
  p_factory uuid,
  p_service_type public.service_type,
  p_description text,
  p_symptoms text[] default '{}',
  p_customer_machine uuid default null,
  p_machine_type uuid default null,
  p_industry uuid default null,
  p_manufacturer_text text default null,
  p_model_text text default null,
  p_urgency public.request_urgency default 'flexible',
  p_preferred_date date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  m public.customer_machines;
  v_type uuid := p_machine_type;
  v_maker uuid; v_model uuid;
  v_maker_text text := nullif(btrim(p_manufacturer_text), '');
  v_model_text text := nullif(btrim(p_model_text), '');
begin
  perform private.require_active_user();
  if not private.has_role('customer') then
    raise exception using errcode = '42501', message = 'only customers can create service requests';
  end if;
  if not exists (select 1 from public.factories f where f.id = p_factory and f.owner_id = auth.uid() and f.is_active) then
    raise exception 'ITM:factory_not_yours: Choose one of your factories';
  end if;
  if (select count(*) from public.service_requests r where r.customer_id = auth.uid() and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'ITM:request_limit: You have created many requests today. Please contact support if you need more.';
  end if;
  if p_customer_machine is not null then
    select * into m from public.customer_machines where id = p_customer_machine and owner_id = auth.uid() and factory_id = p_factory;
    if not found then raise exception 'ITM:machine_not_yours: Choose a machine at this factory'; end if;
    v_type := m.machine_type_id; v_maker := m.manufacturer_id; v_model := m.model_id;
    v_maker_text := coalesce(v_maker_text, m.manufacturer_text); v_model_text := coalesce(v_model_text, m.model_text);
  end if;
  if v_type is null then
    select id into v_type from public.catalogue_entities where key = 'machine.unknown' and status = 'approved';
  end if;
  perform private.check_catalogue_ref(v_type, 'machine_type', 'machine type');
  perform private.check_catalogue_ref(p_industry, 'industry', 'industry');
  if p_preferred_date is not null and p_preferred_date < current_date then
    raise exception 'ITM:date_in_past: Choose today or a later date';
  end if;

  insert into public.service_requests (
    reference, customer_id, factory_id, customer_machine_id, industry_id, machine_type_id, manufacturer_id, model_id,
    manufacturer_text, model_text, service_type, symptoms, description, urgency, preferred_date)
  values (
    'SR-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-' || lpad(nextval('public.service_request_ref_seq')::text, 5, '0'),
    auth.uid(), p_factory, p_customer_machine, p_industry, v_type, v_maker, v_model, v_maker_text, v_model_text,
    p_service_type, coalesce(p_symptoms, '{}'), btrim(p_description), coalesce(p_urgency, 'flexible'), p_preferred_date)
  returning id into v_id;
  insert into public.job_status_events (request_id, from_status, to_status, actor_id)
  values (v_id, null, 'submitted', auth.uid());
  perform private.audit('request.created', 'service_request', v_id::text, '{}'::jsonb);
  return v_id;
end $$;

create function public.register_request_attachment(p_request uuid, p_kind text, p_storage_path text, p_mime_type text, p_size_bytes int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_active_user();
  if not private.is_request_customer(p_request) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_request::text then
    raise exception 'ITM:path_invalid: The file is not in this request''s folder';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'request-media' and o.name = p_storage_path) then
    raise exception 'ITM:file_missing: Upload the file first';
  end if;
  if (select count(*) from public.request_attachments a where a.request_id = p_request) >= 20 then
    raise exception 'ITM:attachment_limit: A request can have up to 20 photos, videos or voice notes';
  end if;
  insert into public.request_attachments (request_id, kind, storage_path, mime_type, size_bytes)
  values (p_request, p_kind, p_storage_path, p_mime_type, p_size_bytes)
  returning id into v_id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Matching
-- -----------------------------------------------------------------------------
create function private.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable set search_path = '' as $$
  select (2 * 6371 * asin(sqrt(
    power(sin(radians((lat2 - lat1)::float8) / 2), 2)
    + cos(radians(lat1::float8)) * cos(radians(lat2::float8)) * power(sin(radians((lng2 - lng1)::float8) / 2), 2))))::numeric;
$$;

/**
 * Rank approved providers for a request and explain why each matches.
 * Only the request's customer (or staff) may run it. Stores a snapshot in
 * match_results. Reasons describe what providers stated and what the platform
 * checked — never a guarantee or a certification claim.
 */
create function public.match_providers(p_request uuid, p_limit int default 20)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  r public.service_requests;
  f public.factories;
  v_unknown boolean;
  v_cats uuid[];
  v_type_name text;
  v_result jsonb;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found or not (r.customer_id = auth.uid() or private.is_staff()) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  select * into f from public.factories where id = r.factory_id;
  select key = 'machine.unknown', name into v_unknown, v_type_name from public.catalogue_entities where id = r.machine_type_id;
  select coalesce(array_agg(to_id), '{}') into v_cats from public.catalogue_links where from_id = r.machine_type_id and relation = 'in_category';
  p_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  with cand as (
    select pp.* from public.provider_profiles pp
    where pp.status = 'approved' and pp.archived_at is null and pp.kind in ('individual', 'company')
      and pp.availability <> 'unavailable'
      and not exists (select 1 from public.profiles u where u.id = pp.user_id and u.account_status <> 'active')
  ),
  skills as (
    -- a company is matched on its own skills and its approved employees' skills
    select c.id as provider_id, s.id as skill_id, s.catalogue_entity_id, s.years_experience
    from cand c join public.provider_skills s on s.provider_profile_id = c.id
    union all
    select c.id, s.id, s.catalogue_entity_id, s.years_experience
    from cand c
    join public.provider_profiles m on c.kind = 'company' and m.organization_id = c.organization_id
      and m.kind = 'company_member' and m.status = 'approved' and m.archived_at is null
    join public.provider_skills s on s.provider_profile_id = m.id
  ),
  facts as (
    select c.*,
      (select max(s.years_experience) from skills s where s.provider_id = c.id and s.catalogue_entity_id = r.machine_type_id and not v_unknown) as machine_years,
      (select e.name from skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
        where s.provider_id = c.id and s.catalogue_entity_id = any (v_cats) limit 1) as category_name,
      (select e.name from skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
        join public.catalogue_links l on l.from_id = e.id and l.relation = 'skill_for'
        where s.provider_id = c.id and e.kind = 'service_skill' and (l.to_id = r.machine_type_id or l.to_id = any (v_cats)) limit 1) as service_skill_name,
      (select e.name from skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
        join public.catalogue_links l on l.from_id = e.id and l.relation = 'used_in'
        where v_unknown and r.industry_id is not null and s.provider_id = c.id and l.to_id = r.industry_id limit 1) as industry_machine_name,
      (select coalesce(mf.name, mm.manufacturer_text, md.name, mm.model_text)
        from skills s join public.provider_make_model_experience mm on mm.provider_skill_id = s.skill_id
        left join public.catalogue_entities mf on mf.id = mm.manufacturer_id
        left join public.catalogue_entities md on md.id = mm.model_id
        where s.provider_id = c.id and s.catalogue_entity_id = r.machine_type_id and (
          (r.manufacturer_id is not null and mm.manufacturer_id = r.manufacturer_id)
          or (r.model_id is not null and mm.model_id = r.model_id)
          or (r.manufacturer_text is not null and private.normalize_catalogue_text(mm.manufacturer_text) = private.normalize_catalogue_text(r.manufacturer_text))
          or (r.model_text is not null and private.normalize_catalogue_text(mm.model_text) = private.normalize_catalogue_text(r.model_text)))
        limit 1) as make_match,
      case when f.latitude is not null and c.base_latitude is not null
           then private.haversine_km(f.latitude, f.longitude, c.base_latitude, c.base_longitude) end as distance_km,
      (f.district is not null and (f.district = c.base_district or f.district = any (c.service_districts))) as district_match,
      private.provider_badges(c.id) as badges
    from cand c
  ),
  scored as (
    select x.*,
      (x.distance_km is not null and x.distance_km <= x.service_radius_km) as within_radius,
      (x.distance_km is null and f.district is null) as location_unknown,
      ( case when x.machine_years is not null then 50 + least(x.machine_years, 20) else 0 end
      + case when x.category_name is not null then 25 else 0 end
      + case when x.service_skill_name is not null then 15 else 0 end
      + case when x.industry_machine_name is not null then 20 else 0 end
      + case when x.make_match is not null then 15 else 0 end
      + case when x.distance_km is not null and x.distance_km <= x.service_radius_km
             then 20 - 10 * (x.distance_km / greatest(x.service_radius_km, 1)) else 0 end
      + case when x.district_match then 12 else 0 end
      + case x.availability when 'available' then 10 when 'limited' then 4 else 0 end
      + case when exists (select 1 from jsonb_array_elements(x.badges) b where b->>'kind' in ('identity', 'business')) then 6 else 0 end
      + least(2 * (select count(*) from jsonb_array_elements(x.badges) b where b->>'kind' in ('certificate', 'licence', 'insurance')), 6)
      )::numeric(6, 2) as score
    from facts x
  ),
  eligible as (
    select s.* from scored s
    where (s.machine_years is not null or s.category_name is not null or s.service_skill_name is not null
           or s.industry_machine_name is not null or v_unknown)
      and (s.within_radius or s.district_match or s.location_unknown)
  ),
  ranked as (
    select e.*, row_number() over (order by e.score desc, e.display_name) as rnk
    from eligible e
    order by e.score desc, e.display_name
    limit p_limit
  ),
  explained as (
    select k.*, to_jsonb(array_remove(array[
      case when k.machine_years is not null then format('Lists %s — %s years (stated by provider)', v_type_name, k.machine_years) end,
      case when k.make_match is not null then format('Has worked on %s (stated by provider)', k.make_match) end,
      case when k.category_name is not null and k.machine_years is null then format('Works on %s (stated by provider)', k.category_name) end,
      case when k.service_skill_name is not null then format('Offers %s (stated by provider)', k.service_skill_name) end,
      case when k.industry_machine_name is not null then format('Works on %s in this industry (stated by provider)', k.industry_machine_name) end,
      case when k.within_radius then format('About %s km away (travels up to %s km)', round(k.distance_km), k.service_radius_km) end,
      case when not coalesce(k.within_radius, false) and k.district_match then format('Covers %s district', f.district) end,
      case when k.location_unknown then 'Location not compared — add your factory''s district or location' end,
      case k.availability when 'available' then 'Available for new work' when 'limited' then 'Limited availability' end,
      case when exists (select 1 from jsonb_array_elements(k.badges) b where b->>'kind' = 'identity') then 'Identity checked by the platform' end,
      case when exists (select 1 from jsonb_array_elements(k.badges) b where b->>'kind' = 'business') then 'Business details reviewed by the platform' end,
      case when exists (select 1 from jsonb_array_elements(k.badges) b where b->>'kind' in ('certificate', 'licence', 'insurance'))
           then 'Has documents reviewed by the platform (see profile)' end
    ], null)) as reasons
    from ranked k
  ),
  saved as (
    insert into public.match_results (request_id, provider_profile_id, rank, score, reasons, distance_km)
    select p_request, e.id, e.rnk, e.score, e.reasons, round(e.distance_km)::int from explained e
    returning provider_profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'provider_id', e.id, 'kind', e.kind, 'display_name', e.display_name, 'base_locality', e.base_locality,
    'years_experience', e.years_experience, 'availability', e.availability, 'score', e.score, 'rank', e.rnk,
    'distance_km', round(e.distance_km), 'reasons', e.reasons,
    'invitation_status', (select i.status from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = e.id)
  ) order by e.rnk), '[]'::jsonb)
  into v_result
  from explained e;

  if r.status = 'submitted' then
    perform private.change_job_status(p_request, 'finding_providers', null);
  end if;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Invitations and selection
-- -----------------------------------------------------------------------------
create function public.invite_provider(p_request uuid, p_provider uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_id uuid; m public.match_results;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if r.status not in ('submitted', 'finding_providers', 'provider_contacted', 'discussion') then
    raise exception 'ITM:request_not_open: You can contact providers only before an estimate is approved';
  end if;
  if not exists (select 1 from public.provider_profiles p where p.id = p_provider and p.status = 'approved'
                 and p.archived_at is null and p.kind in ('individual', 'company')) then
    raise exception 'ITM:provider_unavailable: This provider is not available';
  end if;
  if (select count(*) from public.request_invitations i where i.request_id = p_request and i.status in ('invited', 'accepted')) >= 5 then
    raise exception 'ITM:invitation_limit: You can contact up to 5 providers at a time. Withdraw one first.';
  end if;
  select * into m from public.match_results where request_id = p_request and provider_profile_id = p_provider order by created_at desc limit 1;
  insert into public.request_invitations (request_id, provider_profile_id, invited_by, match_score, match_reasons)
  values (p_request, p_provider, auth.uid(), m.score, m.reasons)
  on conflict (request_id, provider_profile_id) do update
    set status = 'invited', invited_at = now(), responded_at = null, responded_by = null, decline_reason = null
    where public.request_invitations.status = 'withdrawn'
  returning id into v_id;
  if v_id is null then raise exception 'ITM:already_invited: You have already contacted this provider'; end if;
  if r.status in ('submitted', 'finding_providers') then
    perform private.change_job_status(p_request, 'provider_contacted', null);
  end if;
  perform private.audit('request.provider_invited', 'service_request', p_request::text, jsonb_build_object('provider', p_provider));
  return v_id;
end $$;

create function public.withdraw_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.request_invitations;
begin
  perform private.require_active_user();
  select * into i from public.request_invitations where id = p_invitation for update;
  if not found or not private.is_request_customer(i.request_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if i.status not in ('invited', 'accepted') then
    raise exception 'ITM:invitation_closed: This invitation is already closed';
  end if;
  update public.request_invitations set status = 'withdrawn' where id = p_invitation;
  update public.service_requests set selected_provider_id = null where id = i.request_id and selected_provider_id = i.provider_profile_id;
  perform private.after_invitation_change(i.request_id);
  perform private.audit('request.invitation_withdrawn', 'service_request', i.request_id::text, jsonb_build_object('provider', i.provider_profile_id));
end $$;

/** Keep the request status in step with its invitations (early stages only). */
create function private.after_invitation_change(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_accepted int; v_open int;
begin
  select * into r from public.service_requests where id = p_request;
  select count(*) filter (where status = 'accepted'), count(*) filter (where status in ('invited', 'accepted'))
  into v_accepted, v_open from public.request_invitations where request_id = p_request;
  if r.status = 'provider_contacted' and v_accepted > 0 then
    perform private.change_job_status(p_request, 'discussion', null);
  elsif r.status in ('provider_contacted', 'discussion') and v_open = 0 then
    perform private.change_job_status(p_request, 'finding_providers', 'No provider is engaged at the moment');
  elsif r.status = 'discussion' and v_accepted = 0 then
    perform private.change_job_status(p_request, 'provider_contacted', null);
  end if;
end $$;

create function public.respond_to_invitation(p_invitation uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.request_invitations; r public.service_requests;
begin
  perform private.require_active_user();
  select * into i from public.request_invitations where id = p_invitation for update;
  if not found or not private.can_manage_provider(i.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if i.status <> 'invited' then
    raise exception 'ITM:invitation_closed: This request is no longer waiting for your answer';
  end if;
  select * into r from public.service_requests where id = i.request_id;
  if r.status in ('cancelled', 'closed') then
    raise exception 'ITM:request_closed: The customer has closed this request';
  end if;
  update public.request_invitations
  set status = case when p_accept then 'accepted' else 'declined' end::public.invitation_status,
      responded_at = now(), responded_by = auth.uid(), decline_reason = case when p_accept then null else nullif(btrim(p_reason), '') end
  where id = p_invitation;
  perform private.after_invitation_change(i.request_id);
  perform private.audit(case when p_accept then 'request.invitation_accepted' else 'request.invitation_declined' end,
    'service_request', i.request_id::text, jsonb_build_object('provider', i.provider_profile_id));
end $$;

/** The customer chooses which engaged provider to continue with. */
create function public.select_provider(p_request uuid, p_provider uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if r.status not in ('discussion', 'estimate_sent', 'awaiting_approval') then
    raise exception 'ITM:cannot_select_now: You can choose a provider after one accepts and before work is approved';
  end if;
  if not exists (select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = p_provider and i.status = 'accepted') then
    raise exception 'ITM:provider_not_engaged: Choose a provider who has accepted your request';
  end if;
  update public.service_requests set selected_provider_id = p_provider where id = p_request;
  perform private.audit('request.provider_selected', 'service_request', p_request::text, jsonb_build_object('provider', p_provider));
end $$;

create function public.cancel_service_request(p_request uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'ITM:note_required: Tell the providers why you are cancelling';
  end if;
  perform private.change_job_status(p_request, 'cancelled', p_reason);
  update public.service_requests set cancel_reason = btrim(p_reason) where id = p_request;
  update public.request_invitations set status = 'closed' where request_id = p_request and status in ('invited', 'accepted');
  perform private.audit('request.cancelled', 'service_request', p_request::text, jsonb_build_object('reason', p_reason));
end $$;

-- -----------------------------------------------------------------------------
-- Read models
-- -----------------------------------------------------------------------------

/** A request as an invited provider sees it. Address and customer name only after accepting. */
create function public.get_request_for_provider(p_request uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when not private.is_request_provider(r.id) and not private.is_staff() then null else jsonb_build_object(
    'id', r.id, 'reference', r.reference, 'status', r.status, 'service_type', r.service_type,
    'symptoms', r.symptoms, 'description', r.description, 'urgency', r.urgency, 'preferred_date', r.preferred_date,
    'created_at', r.created_at,
    'machine_type', mt.name, 'machine_type_key', mt.key, 'industry', ind.name,
    'manufacturer', coalesce(mf.name, r.manufacturer_text), 'model', coalesce(md.name, r.model_text),
    'machine_label', cm.label, 'year_installed', cm.year_installed,
    'locality', f.locality, 'district', f.district, 'city', f.city,
    'invitations', (select jsonb_agg(jsonb_build_object('id', i.id, 'provider_id', i.provider_profile_id, 'status', i.status,
                                                        'match_reasons', i.match_reasons, 'invited_at', i.invited_at))
                    from public.request_invitations i
                    where i.request_id = r.id and (private.can_manage_provider(i.provider_profile_id) or private.is_staff())),
    'selected_you', exists (select 1 from public.request_invitations i where i.request_id = r.id
                            and i.provider_profile_id = r.selected_provider_id and private.can_manage_provider(i.provider_profile_id)),
    'engaged', private.is_engaged_provider(r.id) or private.is_staff(),
    'customer_name', case when private.is_engaged_provider(r.id) or private.is_staff() then cu.full_name
                          else split_part(coalesce(cu.full_name, 'Customer'), ' ', 1) end,
    'factory_name', case when private.is_engaged_provider(r.id) or private.is_staff() then f.name end,
    'address_line', case when private.is_engaged_provider(r.id) or private.is_staff() then f.address_line end,
    'pincode', case when private.is_engaged_provider(r.id) or private.is_staff() then f.pincode end,
    'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'path', a.storage_path, 'mime_type', a.mime_type)
                                              order by a.created_at)
                             from public.request_attachments a where a.request_id = r.id), '[]'::jsonb)
  ) end
  from public.service_requests r
  join public.factories f on f.id = r.factory_id
  join public.profiles cu on cu.id = r.customer_id
  join public.catalogue_entities mt on mt.id = r.machine_type_id
  left join public.catalogue_entities ind on ind.id = r.industry_id
  left join public.catalogue_entities mf on mf.id = r.manufacturer_id
  left join public.catalogue_entities md on md.id = r.model_id
  left join public.customer_machines cm on cm.id = r.customer_machine_id
  where r.id = p_request;
$$;

/** Invitations for every provider profile the signed-in user manages. */
create function public.list_my_invitations(p_include_closed boolean default false)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'invitation_id', i.id, 'status', i.status, 'invited_at', i.invited_at, 'provider_id', i.provider_profile_id,
    'provider_name', pp.display_name, 'request_id', r.id, 'reference', r.reference, 'request_status', r.status,
    'service_type', r.service_type, 'urgency', r.urgency, 'machine_type', mt.name, 'symptoms', r.symptoms,
    'locality', f.locality, 'district', f.district,
    'selected_you', r.selected_provider_id = i.provider_profile_id
  ) order by i.invited_at desc), '[]'::jsonb)
  from public.request_invitations i
  join public.provider_profiles pp on pp.id = i.provider_profile_id
  join public.service_requests r on r.id = i.request_id
  join public.factories f on f.id = r.factory_id
  join public.catalogue_entities mt on mt.id = r.machine_type_id
  where private.can_manage_provider(i.provider_profile_id)
    and (p_include_closed or i.status in ('invited', 'accepted'));
$$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  private.has_role(public.app_role, uuid),
  private.is_active_user(),
  private.is_staff(),
  private.is_platform_admin(),
  private.is_org_member(uuid),
  private.can_manage_provider(uuid),
  private.can_read_provider_document(uuid),
  private.can_read_storage_path(text),
  private.try_uuid(text),
  private.log_provider_resubmit(uuid),
  private.is_request_customer(uuid),
  private.is_request_provider(uuid),
  private.can_view_request(uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
