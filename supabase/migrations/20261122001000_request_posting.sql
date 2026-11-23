-- =============================================================================
-- Posting a request when no suitable provider is found (or the customer wants
-- more choice), and provider offers.
--
-- * The customer chooses to post an open request. It then appears in the
--   "Open requests" list of approved providers who work on that kind of machine
--   in a wider area than matching uses: up to twice their travel distance (at
--   least 100 km), their districts, or anywhere if the factory location is not
--   known. Providers approved later see it too.
-- * Providers see only what an invited provider sees before accepting: machine,
--   problem, urgency, locality and district. No customer name, exact address,
--   phone, photos or chat.
-- * A provider can "offer to help". The customer is notified and decides:
--   accepting an offer invites that provider in the normal way (the provider
--   then accepts the invitation and only then sees the address). The customer
--   always chooses who is contacted; the platform does not assign anyone.
-- * Posting stops when the customer stops it, selects a provider, approves an
--   estimate, or cancels.
-- =============================================================================

alter table public.service_requests add column posted_at timestamptz;
create index service_requests_posted on public.service_requests (posted_at) where posted_at is not null;

create table public.request_offers (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  offered_by          uuid not null references public.profiles (id),
  message             text check (message is null or char_length(message) <= 500),
  status              text not null default 'pending' check (status in ('pending', 'invited', 'declined', 'withdrawn')),
  created_at          timestamptz not null default now(),
  decided_at          timestamptz,
  unique (request_id, provider_profile_id)
);
create index request_offers_request on public.request_offers (request_id);

alter table public.request_offers enable row level security;
revoke all on public.request_offers from anon, authenticated;
grant select on public.request_offers to authenticated;
create policy request_offers_read on public.request_offers for select to authenticated using (
  private.is_request_customer(request_id) or private.can_manage_provider(provider_profile_id) or private.is_staff()
);

insert into public.platform_settings (key, value, label, description) values
  ('rate_limit.offer', '{"max": 20, "window_seconds": 3600}', 'Offers to help',
   'How many posted requests one account can offer to help with in the window.');
create trigger rate_limit_offers before insert on public.request_offers
  for each row execute function private.rate_limit_trigger('offer');

-- -----------------------------------------------------------------------------
-- Visibility
-- -----------------------------------------------------------------------------
create function private.request_open_for_posting(r public.service_requests)
returns boolean language sql stable set search_path = '' as $$
  select r.posted_at is not null
     and r.selected_provider_id is null
     and r.status in ('submitted', 'finding_providers', 'provider_contacted', 'discussion');
$$;

/** Can this (approved, top-level) provider see this posted request? Never NULL. */
create function private.posted_request_visible_to(p_request uuid, p_provider uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.service_requests r
    join public.factories f on f.id = r.factory_id
    join public.catalogue_entities mt on mt.id = r.machine_type_id
    join public.provider_profiles pp on pp.id = p_provider
    where r.id = p_request
      and private.request_open_for_posting(r)
      and pp.status = 'approved' and pp.archived_at is null and pp.kind in ('individual', 'company')
      and pp.availability <> 'unavailable'
      and pp.user_id is distinct from r.customer_id
      and not exists (select 1 from public.profiles u where u.id = pp.user_id and u.account_status <> 'active')
      -- works on this kind of machine (own skills, or a company's approved employees' skills)
      and (
        mt.key = 'machine.unknown'
        or exists (
          select 1
          from public.provider_skills s
          join public.provider_profiles owner on owner.id = s.provider_profile_id
          where (owner.id = pp.id
                 or (pp.kind = 'company' and owner.organization_id = pp.organization_id
                     and owner.kind = 'company_member' and owner.status = 'approved' and owner.archived_at is null))
            and (
              s.catalogue_entity_id = r.machine_type_id
              or s.catalogue_entity_id in (select l.to_id from public.catalogue_links l
                                            where l.from_id = r.machine_type_id and l.relation = 'in_category')
              or exists (select 1 from public.catalogue_links l
                          where l.from_id = s.catalogue_entity_id and l.relation = 'skill_for'
                            and (l.to_id = r.machine_type_id
                                 or l.to_id in (select c.to_id from public.catalogue_links c
                                                 where c.from_id = r.machine_type_id and c.relation = 'in_category')))
            )
        )
      )
      -- in a wider area than matching
      and (
        f.latitude is null or pp.base_latitude is null
        or (f.district is not null and (f.district = pp.base_district or f.district = any (pp.service_districts)))
        or private.haversine_km(f.latitude, f.longitude, pp.base_latitude, pp.base_longitude)
             <= greatest(2 * pp.service_radius_km, 100)
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Customer: post / stop posting
-- -----------------------------------------------------------------------------
create function public.post_service_request(p_request uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_count int := 0; v_p uuid; v_type text;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if r.selected_provider_id is not null or r.status not in ('submitted', 'finding_providers', 'provider_contacted', 'discussion') then
    raise exception 'ITM:request_not_open: You can post a request only before you choose a provider';
  end if;
  if r.posted_at is null then
    update public.service_requests set posted_at = now() where id = p_request;
    if r.status = 'submitted' then
      perform private.change_job_status(p_request, 'finding_providers', 'Posted for providers to offer help');
    end if;
    perform private.audit('request.posted', 'service_request', p_request::text, '{}'::jsonb);
  end if;

  select name into v_type from public.catalogue_entities where id = r.machine_type_id;
  for v_p in
    select pp.id from public.provider_profiles pp
    where pp.status = 'approved' and pp.kind in ('individual', 'company')
      and private.posted_request_visible_to(p_request, pp.id)
      and not exists (select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = pp.id)
  loop
    v_count := v_count + 1;
    if r.posted_at is null then -- notify once, on first posting
      perform private.notify(m, 'request_posted', 'New open request: ' || coalesce(v_type, 'machine'),
                             'A customer is looking for help. Offer to help if you can take it on.', '/work/open')
        from private.provider_manager_ids(v_p) m;
    end if;
  end loop;
  return v_count;
end $$;

create function public.unpost_service_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if r.posted_at is not null then
    update public.service_requests set posted_at = null where id = p_request;
    perform private.audit('request.unposted', 'service_request', p_request::text, '{}'::jsonb);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Provider: open requests and offers
-- -----------------------------------------------------------------------------
/** Posted requests visible to the provider profiles the caller manages. */
create function public.list_open_requests()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.require_active_user();
  select coalesce(jsonb_agg(x order by x.posted_at desc), '[]'::jsonb) into v from (
    select r.id as request_id, r.reference, r.service_type, r.symptoms, r.description, r.urgency, r.preferred_date, r.posted_at,
           mt.name as machine_type, f.locality, f.district,
           case when f.latitude is not null and pp.base_latitude is not null
                then round(private.haversine_km(f.latitude, f.longitude, pp.base_latitude, pp.base_longitude)) end as distance_km,
           pp.id as provider_id, coalesce(pp.display_name, o.name) as provider_name,
           (select ro.status from public.request_offers ro where ro.request_id = r.id and ro.provider_profile_id = pp.id) as my_offer,
           (select ro.id from public.request_offers ro where ro.request_id = r.id and ro.provider_profile_id = pp.id) as my_offer_id
    from public.provider_profiles pp
    left join public.organizations o on o.id = pp.organization_id
    join public.service_requests r on r.posted_at is not null
    join public.factories f on f.id = r.factory_id
    join public.catalogue_entities mt on mt.id = r.machine_type_id
    where private.can_manage_provider(pp.id)
      and pp.kind in ('individual', 'company')
      and (pp.kind = 'individual' or private.has_role('company_admin', pp.organization_id))
      and private.posted_request_visible_to(r.id, pp.id)
      and not exists (select 1 from public.request_invitations i where i.request_id = r.id and i.provider_profile_id = pp.id)
  ) x;
  return v;
end $$;

create function public.offer_to_help(p_request uuid, p_provider uuid, p_message text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_id uuid; v_name text;
begin
  perform private.require_active_user();
  if not private.can_manage_provider(p_provider)
     or not exists (select 1 from public.provider_profiles pp where pp.id = p_provider and pp.kind in ('individual', 'company')
                    and (pp.kind = 'individual' or private.has_role('company_admin', pp.organization_id))) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if not private.posted_request_visible_to(p_request, p_provider) then
    raise exception 'ITM:request_not_posted: This request is no longer open for offers';
  end if;
  if exists (select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = p_provider) then
    raise exception 'ITM:already_invited: The customer has already contacted you about this request';
  end if;
  if p_message is not null and char_length(btrim(p_message)) > 500 then
    raise exception 'ITM:message_too_long: Keep the message under 500 characters';
  end if;
  insert into public.request_offers (request_id, provider_profile_id, offered_by, message)
  values (p_request, p_provider, auth.uid(), nullif(btrim(p_message), ''))
  on conflict (request_id, provider_profile_id) do update
    set status = 'pending', message = excluded.message, offered_by = excluded.offered_by, created_at = now(), decided_at = null
    where public.request_offers.status = 'withdrawn'
  returning id into v_id;
  if v_id is null then raise exception 'ITM:already_offered: You have already offered to help with this request'; end if;

  select * into r from public.service_requests where id = p_request;
  select coalesce(pp.display_name, o.name) into v_name from public.provider_profiles pp
    left join public.organizations o on o.id = pp.organization_id where pp.id = p_provider;
  perform private.notify(r.customer_id, 'offer_received', coalesce(v_name, 'A provider') || ' offered to help',
                         'Open your request to see the offer and decide whether to contact them.', '/requests/' || p_request || '#offers');
  perform private.audit('request.offer_made', 'service_request', p_request::text, jsonb_build_object('provider', p_provider));
  return v_id;
end $$;

create function public.withdraw_offer(p_offer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.request_offers;
begin
  perform private.require_active_user();
  select * into o from public.request_offers where id = p_offer for update;
  if not found or not private.can_manage_provider(o.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if o.status <> 'pending' then
    raise exception 'ITM:offer_decided: The customer has already answered this offer';
  end if;
  update public.request_offers set status = 'withdrawn', decided_at = now() where id = p_offer;
  perform private.audit('request.offer_withdrawn', 'service_request', o.request_id::text, jsonb_build_object('provider', o.provider_profile_id));
end $$;

/** The customer answers an offer. Accepting invites the provider in the normal way. */
create function public.respond_to_offer(p_offer uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.request_offers; v_name text;
begin
  perform private.require_active_user();
  select * into o from public.request_offers where id = p_offer for update;
  if not found or not private.is_request_customer(o.request_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if p_accept is null then
    raise exception 'ITM:decision_required: Choose whether to contact this provider';
  end if;
  if o.status <> 'pending' then
    raise exception 'ITM:offer_decided: You have already answered this offer';
  end if;
  if p_accept then
    perform public.invite_provider(o.request_id, o.provider_profile_id); -- checks the request is open and the limit of 5
    update public.request_offers set status = 'invited', decided_at = now() where id = p_offer;
    perform private.notify(m, 'offer_accepted', 'The customer wants to talk to you',
                           'Accept the request to see the site details and start the chat.', '/work/' || o.request_id)
      from private.provider_manager_ids(o.provider_profile_id) m;
  else
    update public.request_offers set status = 'declined', decided_at = now() where id = p_offer;
  end if;
  perform private.audit(case when p_accept then 'request.offer_accepted' else 'request.offer_declined' end,
                        'service_request', o.request_id::text, jsonb_build_object('provider', o.provider_profile_id));
end $$;

-- Posting ends when a provider is selected or the request leaves the open stages
create function private.end_posting() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.posted_at is not null
     and (new.selected_provider_id is not null
          or new.status not in ('submitted', 'finding_providers', 'provider_contacted', 'discussion')) then
    new.posted_at := null;
  end if;
  return new;
end $$;
create trigger service_requests_end_posting before update on public.service_requests
  for each row execute function private.end_posting();

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  public.post_service_request(uuid), public.unpost_service_request(uuid), public.list_open_requests(),
  public.offer_to_help(uuid, uuid, text), public.withdraw_offer(uuid), public.respond_to_offer(uuid, boolean)
from public, anon;
revoke execute on function
  private.request_open_for_posting(public.service_requests), private.posted_request_visible_to(uuid, uuid), private.end_posting()
from public, anon, authenticated;
grant execute on function
  public.post_service_request(uuid), public.unpost_service_request(uuid), public.list_open_requests(),
  public.offer_to_help(uuid, uuid, text), public.withdraw_offer(uuid), public.respond_to_offer(uuid, boolean)
to authenticated;
