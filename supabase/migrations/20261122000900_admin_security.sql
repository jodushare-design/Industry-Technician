-- =============================================================================
-- Prompt 11: platform settings, rate limits and staff reports.
--
-- * platform_settings: staff can read; only a platform admin can change a
--   value, through set_platform_setting() (validated and audited). New keys
--   are added by migrations only.
-- * Rate limits (catalogue suggestions keep their own limit of 20 a day, see
--   suggest_catalogue_entry): BEFORE INSERT triggers on the tables people write to. The
--   triggers count recent actions per signed-in user (private.rate_limit_hits,
--   not reachable through the API) against the limits in platform_settings.
--   Writes with no signed-in user (operator, scheduled jobs) are not limited.
-- * admin_report(): aggregated counts for the admin Reports page. Staff only.
--   No money totals: the platform does not handle payments in V1.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)*$'),
  value       jsonb not null,
  label       text not null check (char_length(label) between 3 and 120),
  description text not null check (char_length(description) between 3 and 500),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id)
);

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
create policy platform_settings_staff_read on public.platform_settings for select to authenticated
  using (private.is_staff());

insert into public.platform_settings (key, value, label, description) values
  ('rate_limit.service_request', '{"max": 10, "window_seconds": 86400}', 'New service requests',
   'How many service requests one account can create in the window.'),
  ('rate_limit.invitation', '{"max": 30, "window_seconds": 3600}', 'Provider invitations',
   'How many providers one account can contact in the window.'),
  ('rate_limit.message', '{"max": 30, "window_seconds": 60}', 'Chat messages',
   'How many chat messages one account can send in the window.'),
  ('rate_limit.upload', '{"max": 60, "window_seconds": 3600}', 'File uploads',
   'How many photos, videos, voice notes and documents one account can attach in the window.'),
  ('rate_limit.complaint', '{"max": 5, "window_seconds": 86400}', 'Complaints',
   'How many complaints one account can open in the window. Safety incidents use the same limit; support can always be reached by phone.');

create function public.set_platform_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_max int;
  v_window int;
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception 'ITM:admin_only: Only a platform administrator can change settings.';
  end if;
  select s.value into v_old from public.platform_settings s where s.key = p_key for update;
  if v_old is null then
    raise exception 'ITM:unknown_setting: This setting does not exist.';
  end if;
  if p_value is null then
    raise exception 'ITM:invalid_setting: A value is required.';
  end if;

  if p_key like 'rate\_limit.%' then
    -- Separate check first: jsonb_object_keys() fails on non-objects, and OR does not short-circuit reliably.
    if jsonb_typeof(p_value) <> 'object' then
      raise exception 'ITM:invalid_setting: A rate limit needs a maximum and a time window.';
    end if;
    if jsonb_typeof(p_value -> 'max') is distinct from 'number'
       or jsonb_typeof(p_value -> 'window_seconds') is distinct from 'number'
       or (select count(*) from jsonb_object_keys(p_value)) <> 2 then
      raise exception 'ITM:invalid_setting: A rate limit needs a maximum and a time window.';
    end if;
    if (p_value ->> 'max') !~ '^[0-9]{1,7}$' or (p_value ->> 'window_seconds') !~ '^[0-9]{1,7}$' then
      raise exception 'ITM:invalid_setting: Use whole numbers for the maximum and the time window.';
    end if;
    v_max := (p_value ->> 'max')::int;
    v_window := (p_value ->> 'window_seconds')::int;
    if v_max not between 1 and 10000 then
      raise exception 'ITM:invalid_setting: The maximum must be between 1 and 10,000.';
    end if;
    if v_window not between 10 and 604800 then
      raise exception 'ITM:invalid_setting: The time window must be between 10 seconds and 7 days.';
    end if;
  end if;

  update public.platform_settings
     set value = p_value, updated_at = now(), updated_by = auth.uid()
   where key = p_key;
  perform private.audit('settings.updated', 'platform_setting', p_key,
    jsonb_build_object('old', v_old, 'new', p_value));
end $$;

-- -----------------------------------------------------------------------------
-- Rate limits
-- -----------------------------------------------------------------------------
create table private.rate_limit_hits (
  id      bigint generated always as identity primary key,
  user_id uuid not null,
  action  text not null,
  at      timestamptz not null default clock_timestamp()
);
create index rate_limit_hits_lookup on private.rate_limit_hits (user_id, action, at);
revoke all on private.rate_limit_hits from public, anon, authenticated;

create function private.enforce_rate_limit(p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_limit jsonb;
  v_max int;
  v_window interval;
  v_count int;
begin
  if v_uid is null then
    return; -- operator, scheduled jobs and other non-user writes
  end if;
  select s.value into v_limit from public.platform_settings s where s.key = 'rate_limit.' || p_action;
  if v_limit is null then
    return;
  end if;
  v_max := (v_limit ->> 'max')::int;
  v_window := make_interval(secs => (v_limit ->> 'window_seconds')::int);

  delete from private.rate_limit_hits h
   where h.user_id = v_uid and h.action = p_action and h.at < clock_timestamp() - v_window;
  select count(*) into v_count from private.rate_limit_hits h
   where h.user_id = v_uid and h.action = p_action;
  if v_count >= v_max then
    raise exception 'ITM:rate_limited: You have done this too many times in a short period. Please wait a little and try again.';
  end if;
  insert into private.rate_limit_hits (user_id, action) values (v_uid, p_action);
end $$;

create function private.rate_limit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Messages: count only what the signed-in person sends, not system notes
  -- written on their behalf (for example "the customer contacted …").
  -- Nested IF: only messages has sender_id, and AND does not reliably short-circuit.
  if tg_table_name = 'messages' then
    if new.sender_id is distinct from auth.uid() then
      return new;
    end if;
  end if;
  perform private.enforce_rate_limit(tg_argv[0]);
  return new;
end $$;

create trigger rate_limit_service_requests before insert on public.service_requests
  for each row execute function private.rate_limit_trigger('service_request');
create trigger rate_limit_invitations before insert on public.request_invitations
  for each row execute function private.rate_limit_trigger('invitation');
create trigger rate_limit_messages before insert on public.messages
  for each row execute function private.rate_limit_trigger('message');
create trigger rate_limit_complaints before insert on public.complaints
  for each row execute function private.rate_limit_trigger('complaint');
create trigger rate_limit_request_attachments before insert on public.request_attachments
  for each row execute function private.rate_limit_trigger('upload');
create trigger rate_limit_complaint_attachments before insert on public.complaint_attachments
  for each row execute function private.rate_limit_trigger('upload');
create trigger rate_limit_job_photos before insert on public.job_photos
  for each row execute function private.rate_limit_trigger('upload');
create trigger rate_limit_provider_documents before insert on public.provider_documents
  for each row execute function private.rate_limit_trigger('upload');

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
create function public.admin_report(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_out jsonb;
begin
  perform private.require_staff();
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'ITM:invalid_range: Choose a start date on or before the end date.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'ITM:invalid_range: Choose a range of at most one year.';
  end if;
  -- Dates are Indian calendar days.
  v_start := p_from::timestamp at time zone 'Asia/Kolkata';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Kolkata';

  with req as (
    select r.* from public.service_requests r where r.created_at >= v_start and r.created_at < v_end
  ),
  first_accept as (
    select i.request_id, min(i.responded_at) as at
      from public.request_invitations i
      join req on req.id = i.request_id
     where i.status in ('accepted', 'not_selected', 'closed') and i.responded_at is not null
     group by i.request_id
  ),
  est_accepted as (
    select distinct e.request_id
      from public.estimates e
      join public.estimate_revisions v on v.estimate_id = e.id
      join req on req.id = e.request_id
     where v.status = 'accepted'
  ),
  comp as (
    select c.* from public.complaints c where c.created_at >= v_start and c.created_at < v_end
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'requests', jsonb_build_object(
      'created', (select count(*) from req),
      'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', s, 'count', n) order by n desc, s)
                               from (select status::text s, count(*) n from req group by status) x), '[]'::jsonb),
      'by_service_type', coalesce((select jsonb_agg(jsonb_build_object('key', s, 'count', n) order by n desc, s)
                                     from (select service_type::text s, count(*) n from req group by service_type) x), '[]'::jsonb),
      'by_urgency', coalesce((select jsonb_agg(jsonb_build_object('key', s, 'count', n) order by n desc, s)
                                from (select urgency::text s, count(*) n from req group by urgency) x), '[]'::jsonb),
      'top_machine_types', coalesce((select jsonb_agg(jsonb_build_object('key', name, 'count', n) order by n desc, name)
                                       from (select ce.name, count(*) n from req join public.catalogue_entities ce on ce.id = req.machine_type_id
                                              group by ce.name order by count(*) desc, ce.name limit 10) x), '[]'::jsonb)
    ),
    'funnel', jsonb_build_object(
      'created', (select count(*) from req),
      'provider_accepted', (select count(*) from first_accept),
      'estimate_accepted', (select count(*) from est_accepted),
      'completed', (select count(*) from req where status = 'closed' and selected_provider_id is not null),
      'cancelled', (select count(*) from req where status = 'cancelled')
    ),
    'response', jsonb_build_object(
      'median_hours_to_first_acceptance',
        (select round((percentile_cont(0.5) within group (order by extract(epoch from (fa.at - req.created_at)) / 3600))::numeric, 1)
           from first_accept fa join req on req.id = fa.request_id),
      'no_acceptance_after_48h',
        (select count(*) from req
          where req.created_at < now() - interval '48 hours'
            and req.status not in ('cancelled', 'closed')
            and not exists (select 1 from first_accept fa where fa.request_id = req.id))
    ),
    'complaints', jsonb_build_object(
      'opened', (select count(*) from comp),
      'by_category', coalesce((select jsonb_agg(jsonb_build_object('key', s, 'count', n) order by n desc, s)
                                 from (select category::text s, count(*) n from comp group by category) x), '[]'::jsonb),
      'by_status', coalesce((select jsonb_agg(jsonb_build_object('key', s, 'count', n) order by n desc, s)
                               from (select status::text s, count(*) n from comp group by status) x), '[]'::jsonb),
      'acknowledged_on_time', (select count(*) from comp where acknowledged_at is not null and acknowledged_at <= ack_due_at),
      'acknowledged_late', (select count(*) from comp where (acknowledged_at is not null and acknowledged_at > ack_due_at)
                                                           or (acknowledged_at is null and now() > ack_due_at)),
      'overdue_now', (select count(*) from public.complaints c
                       where c.status not in ('resolved', 'closed') and now() > c.resolve_due_at)
    ),
    'providers', jsonb_build_object(
      'by_kind_status', coalesce((select jsonb_agg(jsonb_build_object('kind', k, 'status', s, 'count', n) order by k, s)
                                    from (select kind::text k, status::text s, count(*) n from public.provider_profiles
                                           where archived_at is null group by kind, status) x), '[]'::jsonb),
      'waiting_verification', (select count(*) from public.provider_profiles where status = 'submitted' and archived_at is null),
      'median_hours_to_review',
        (select round((percentile_cont(0.5) within group (order by extract(epoch from (p.reviewed_at - p.submitted_at)) / 3600))::numeric, 1)
           from public.provider_profiles p
          where p.reviewed_at >= v_start and p.reviewed_at < v_end and p.submitted_at is not null and p.reviewed_at >= p.submitted_at)
    ),
    'accounts', jsonb_build_object(
      'new', (select count(*) from public.profiles p where p.created_at >= v_start and p.created_at < v_end)
    )
  ) into v_out;
  return v_out;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on function public.set_platform_setting(text, jsonb) from public, anon;
revoke execute on function public.admin_report(date, date) from public, anon;
revoke execute on function private.enforce_rate_limit(text), private.rate_limit_trigger() from public, anon, authenticated;
grant execute on function public.set_platform_setting(text, jsonb), public.admin_report(date, date) to authenticated;
