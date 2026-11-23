-- =============================================================================
-- Job progress, completion reports, customer confirmation and complaints
-- (Prompt 10)
--
--   * Provider steps (scheduled, travelling, arrived, in progress, waiting
--     for parts, completed) are taken only by the job's selected provider.
--     Work cannot start before the provider acknowledges the site-safety
--     checklist agreed with the customer.
--   * The completion report is the PROVIDER's record (fault they identified,
--     work done, parts, photos, remaining issues, recommendations). It is
--     fingerprinted and cannot be changed.
--   * The customer confirms (closes) or reports a concern (disputed +
--     complaint). Only platform staff close a disputed job, after recording
--     how the complaint was handled. The platform facilitates; it does not
--     decide technical fault or guarantee outcomes.
--   * Complaints, their history and evidence are never deleted — including
--     when an account is suspended or closed.
--   * Safety incidents are escalated at once to all platform admins.
-- =============================================================================

create type public.complaint_category as enum (
  'no_show', 'delay', 'price_dispute', 'work_quality', 'parts_issue', 'conduct', 'safety_incident',
  'data_privacy', 'platform_issue', 'other'
);
create type public.complaint_status as enum ('open', 'acknowledged', 'in_progress', 'resolved', 'closed');
create type public.complaint_resolution as enum (
  'resolved_between_parties', 'provider_action_taken', 'account_action_taken', 'referred_to_authorities', 'no_action_needed', 'withdrawn_by_complainant'
);

-- -----------------------------------------------------------------------------
-- Scheduling, site safety, job photos
-- -----------------------------------------------------------------------------
alter table public.service_requests
  add column scheduled_for timestamptz,
  add column schedule_note text check (schedule_note is null or char_length(schedule_note) <= 500);

create table public.site_safety_acks (
  request_id      uuid not null references public.service_requests (id),
  side            text not null check (side in ('customer', 'provider')),
  items           jsonb not null check (jsonb_typeof(items) = 'object'),
  acknowledged_by uuid not null references public.profiles (id),
  acknowledged_at timestamptz not null default now(),
  primary key (request_id, side)
);

create table public.job_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.service_requests (id),
  phase        text not null check (phase in ('before', 'after')),
  storage_path text not null unique,
  uploaded_by  uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);
create index job_photos_request on public.job_photos (request_id);

create table public.completion_reports (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null unique references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  fault_identified    text not null check (char_length(btrim(fault_identified)) between 5 and 2000),
  work_performed      text not null check (char_length(btrim(work_performed)) between 5 and 3000),
  parts_used          jsonb not null default '[]'::jsonb,
  parts_note          text check (parts_note is null or char_length(parts_note) <= 1000),
  remaining_issues    text check (remaining_issues is null or char_length(remaining_issues) <= 2000),
  recommendations     text check (recommendations is null or char_length(recommendations) <= 2000),
  completed_on        date not null,
  submitted_by        uuid not null references public.profiles (id),
  submitted_at        timestamptz not null default now(),
  content_hash        text not null check (content_hash ~ '^[0-9a-f]{64}$')
);
create trigger completion_reports_no_update before update or delete on public.completion_reports
  for each row execute function private.block_audit_mutation();

create table public.job_feedback (
  request_id  uuid primary key references public.service_requests (id),
  rating      smallint check (rating is null or rating between 1 and 5),
  comment     text check (comment is null or char_length(comment) <= 1000),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
       ('complaint-files', 'complaint-files', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm',
              'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'application/pdf'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Complaints
-- -----------------------------------------------------------------------------
create sequence public.complaint_ref_seq;

create table public.complaints (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  request_id          uuid references public.service_requests (id),
  raised_by           uuid not null references public.profiles (id),
  raised_side         text not null check (raised_side in ('customer', 'provider', 'other')),
  against_provider_id uuid references public.provider_profiles (id),
  category            public.complaint_category not null,
  severity            text not null default 'normal' check (severity in ('normal', 'high', 'critical')),
  description         text not null check (char_length(btrim(description)) between 10 and 4000),
  status              public.complaint_status not null default 'open',
  assigned_to         uuid references public.profiles (id),
  escalated           boolean not null default false,
  ack_due_at          timestamptz not null,
  resolve_due_at      timestamptz not null,
  acknowledged_at     timestamptz,
  resolved_at         timestamptz,
  resolution          public.complaint_resolution,
  resolution_notes    text check (resolution_notes is null or char_length(resolution_notes) <= 3000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index complaints_status on public.complaints (status, resolve_due_at);
create index complaints_request on public.complaints (request_id);
create trigger complaints_touch before update on public.complaints
  for each row execute function private.touch_updated_at();
create trigger complaints_no_delete before delete on public.complaints
  for each row execute function private.block_audit_mutation();

create table public.complaint_events (
  id           bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints (id),
  actor_id     uuid references public.profiles (id),
  kind         text not null check (kind in ('created', 'acknowledged', 'assigned', 'message', 'internal_note', 'status_changed',
                                              'escalated', 'resolved', 'reopened', 'conversation_viewed', 'attachment')),
  visibility   text not null check (visibility in ('parties', 'staff')),
  body         text check (body is null or char_length(body) <= 4000),
  created_at   timestamptz not null default now()
);
create index complaint_events_complaint on public.complaint_events (complaint_id, id);
create trigger complaint_events_no_update before update or delete on public.complaint_events
  for each row execute function private.block_audit_mutation();

create table public.complaint_attachments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id),
  storage_path text not null unique,
  mime_type    text not null,
  size_bytes   int not null check (size_bytes between 1 and 52428800),
  uploaded_by  uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now()
);
create trigger complaint_attachments_no_delete before update or delete on public.complaint_attachments
  for each row execute function private.block_audit_mutation();

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------

/** Signed-in user acts for the job's selected provider. */
create function private.is_selected_provider_actor(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select r.selected_provider_id is not null and private.can_act_for_provider_on_request(r.id, r.selected_provider_id)
    from public.service_requests r where r.id = p_request), false);
$$;

/** Complaint parties: whoever raised it, the job's customer, and the provider named in it. */
create function private.is_complaint_party(p_complaint uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.complaints c
    left join public.service_requests r on r.id = c.request_id
    where c.id = p_complaint and (
      c.raised_by = auth.uid()
      or r.customer_id = auth.uid()
      or (c.against_provider_id is not null and coalesce(private.can_act_for_provider_on_request(c.request_id, c.against_provider_id), false))
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.site_safety_acks      enable row level security;
alter table public.job_photos            enable row level security;
alter table public.completion_reports    enable row level security;
alter table public.job_feedback          enable row level security;
alter table public.complaints            enable row level security;
alter table public.complaint_events      enable row level security;
alter table public.complaint_attachments enable row level security;

revoke all on public.site_safety_acks, public.job_photos, public.completion_reports, public.job_feedback,
  public.complaints, public.complaint_events, public.complaint_attachments from anon, authenticated;
grant select on public.site_safety_acks, public.job_photos, public.completion_reports, public.job_feedback,
  public.complaints, public.complaint_events, public.complaint_attachments to authenticated;

create policy site_safety_read on public.site_safety_acks for select to authenticated using (private.can_view_request(request_id));
create policy job_photos_read on public.job_photos for select to authenticated using (private.can_view_request(request_id));
create policy completion_reports_read on public.completion_reports for select to authenticated using (private.can_view_request(request_id));
create policy job_feedback_read on public.job_feedback for select to authenticated
  using (private.is_request_customer(request_id) or private.is_staff());
create policy complaints_read on public.complaints for select to authenticated
  using (private.is_complaint_party(id) or private.is_staff());
create policy complaint_events_read on public.complaint_events for select to authenticated
  using ((visibility = 'parties' and private.is_complaint_party(complaint_id)) or private.is_staff());
create policy complaint_attachments_read on public.complaint_attachments for select to authenticated
  using (private.is_complaint_party(complaint_id) or private.is_staff());

create policy job_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'job-photos' and private.is_selected_provider_actor(private.try_uuid((storage.foldername(name))[1])) and private.is_active_user());
create policy job_photos_object_read on storage.objects for select to authenticated
  using (bucket_id = 'job-photos' and private.can_view_request(private.try_uuid((storage.foldername(name))[1])));
create policy complaint_files_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-files' and private.is_complaint_party(private.try_uuid((storage.foldername(name))[1])));
create policy complaint_files_read on storage.objects for select to authenticated
  using (bucket_id = 'complaint-files' and (private.is_complaint_party(private.try_uuid((storage.foldername(name))[1])) or private.is_staff()));

-- Refined state machine: an approved job may start without a formal schedule
-- (urgent same-day breakdowns); scheduling remains available.
create or replace function private.job_transition_allowed(p_from public.job_status, p_to public.job_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'submitted'                     then p_to in ('finding_providers', 'provider_contacted', 'cancelled')
    when 'finding_providers'             then p_to in ('provider_contacted', 'cancelled')
    when 'provider_contacted'            then p_to in ('discussion', 'finding_providers', 'cancelled')
    when 'discussion'                    then p_to in ('estimate_sent', 'finding_providers', 'provider_contacted', 'cancelled')
    when 'estimate_sent'                 then p_to in ('awaiting_approval', 'discussion', 'cancelled')
    when 'awaiting_approval'             then p_to in ('approved', 'discussion', 'cancelled')
    when 'approved'                      then p_to in ('scheduled', 'provider_travelling', 'provider_arrived', 'work_in_progress', 'awaiting_approval', 'cancelled')
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

-- -----------------------------------------------------------------------------
-- Job progress
-- -----------------------------------------------------------------------------
create function private.notify_request_customer(p_request uuid, p_kind text, p_title text, p_body text)
returns void language sql security definer set search_path = '' as $$
  select private.notify(r.customer_id, p_kind, p_title, p_body, '/requests/' || r.id) from public.service_requests r where r.id = p_request;
$$;

create function public.schedule_job(p_request uuid, p_when timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or not private.is_selected_provider_actor(p_request) then
    raise exception using errcode = '42501', message = 'only the selected provider can schedule the visit';
  end if;
  if r.status not in ('approved', 'scheduled') then
    raise exception 'ITM:not_approved: Schedule the visit after the customer approves an estimate';
  end if;
  if p_when < now() - interval '1 hour' then raise exception 'ITM:date_in_past: Choose a time in the future'; end if;
  update public.service_requests set scheduled_for = p_when, schedule_note = nullif(btrim(p_note), '') where id = p_request;
  if r.status = 'approved' then perform private.change_job_status(p_request, 'scheduled', null); end if;
  perform private.system_message(private.conversation_for(p_request, r.selected_provider_id),
    format('Visit scheduled for %s.', to_char(p_when at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')));
  perform private.notify_request_customer(p_request, 'job_scheduled', 'Visit scheduled',
    to_char(p_when at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM'));
end $$;

/** Either side records that site access and safety arrangements were discussed (risk-control §6). */
create function public.acknowledge_site_safety(p_request uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text; r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  v_side := case when r.customer_id = auth.uid() then 'customer' when private.is_selected_provider_actor(p_request) then 'provider' end;
  if v_side is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if jsonb_typeof(p_items) <> 'object'
     or not (p_items ?& array['access', 'isolation', 'permits', 'ppe', 'site_contact'])
     or exists (select 1 from jsonb_each(p_items) e where e.value <> 'true'::jsonb and e.key in ('access', 'isolation', 'permits', 'ppe', 'site_contact')) then
    raise exception 'ITM:checklist_incomplete: Confirm every item on the checklist (each was discussed and agreed)';
  end if;
  insert into public.site_safety_acks (request_id, side, items, acknowledged_by) values (p_request, v_side, p_items, auth.uid())
  on conflict (request_id, side) do update set items = excluded.items, acknowledged_by = excluded.acknowledged_by, acknowledged_at = now();
  perform private.audit('job.safety_acknowledged', 'service_request', p_request::text, jsonb_build_object('side', v_side));
end $$;

/** Provider progress steps. Work cannot start before the provider's safety acknowledgement. */
create function public.update_job_progress(p_request uuid, p_status public.job_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found or not private.is_selected_provider_actor(p_request) then
    raise exception using errcode = '42501', message = 'only the selected provider can update job progress';
  end if;
  if p_status not in ('provider_travelling', 'provider_arrived', 'work_in_progress', 'waiting_for_parts') then
    raise exception 'ITM:not_a_provider_step: Use the completion report to finish the job';
  end if;
  if p_status = 'work_in_progress' and not exists (
    select 1 from public.site_safety_acks a where a.request_id = p_request and a.side = 'provider'
  ) then
    raise exception 'ITM:safety_ack_required: Confirm the site-safety checklist with the customer before starting work';
  end if;
  perform private.change_job_status(p_request, p_status, p_note);
  perform private.system_message(private.conversation_for(p_request, r.selected_provider_id),
    case p_status when 'provider_travelling' then 'The provider is on the way.' when 'provider_arrived' then 'The provider has arrived.'
                  when 'work_in_progress' then 'Work has started.' else 'Work is waiting for parts.' end);
  perform private.notify_request_customer(p_request, 'job_progress',
    case p_status when 'provider_travelling' then 'Provider on the way' when 'provider_arrived' then 'Provider arrived'
                  when 'work_in_progress' then 'Work started' else 'Waiting for parts' end, nullif(btrim(p_note), ''));
end $$;

create function public.add_job_photo(p_request uuid, p_phase text, p_storage_path text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_active_user();
  if not private.is_selected_provider_actor(p_request) then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if split_part(p_storage_path, '/', 1) <> p_request::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'job-photos' and o.name = p_storage_path) then
    raise exception 'ITM:file_missing: Upload the photo first';
  end if;
  insert into public.job_photos (request_id, phase, storage_path) values (p_request, p_phase, p_storage_path) returning id into v_id;
  return v_id;
end $$;

/**
 * The provider's completion report. Lists installed parts automatically.
 * Moves the job to "work completed" then "waiting for customer confirmation".
 */
create function public.submit_completion_report(p_request uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_id uuid; v_parts jsonb; v_content jsonb; v_hash text;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or not private.is_selected_provider_actor(p_request) then
    raise exception using errcode = '42501', message = 'only the selected provider can submit the completion report';
  end if;
  if r.status not in ('work_in_progress', 'waiting_for_parts') then
    raise exception 'ITM:not_in_progress: The completion report is submitted when the work is done';
  end if;
  if exists (select 1 from public.part_requests p where p.request_id = p_request and p.stage = 'awaiting_approval') then
    raise exception 'ITM:parts_pending: A part is still waiting for the customer''s approval';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('part_name', p.part_name, 'part_number', p.part_number, 'quantity', p.quantity::text,
                                               'unit', p.unit, 'total_price', p.total_price::text, 'arranged_by', p.arranged_by)
                            order by p.created_at), '[]'::jsonb)
  into v_parts from public.part_requests p where p.request_id = p_request and p.stage = 'installed';
  v_content := jsonb_build_object(
    'request_id', p_request, 'provider_id', r.selected_provider_id,
    'fault_identified', btrim(p_fields ->> 'fault_identified'), 'work_performed', btrim(p_fields ->> 'work_performed'),
    'parts_used', v_parts, 'parts_note', nullif(btrim(p_fields ->> 'parts_note'), ''),
    'remaining_issues', nullif(btrim(p_fields ->> 'remaining_issues'), ''), 'recommendations', nullif(btrim(p_fields ->> 'recommendations'), ''),
    'completed_on', coalesce(nullif(p_fields ->> 'completed_on', ''), current_date::text));
  v_hash := encode(sha256(convert_to(v_content::text, 'UTF8')), 'hex');
  insert into public.completion_reports (request_id, provider_profile_id, fault_identified, work_performed, parts_used, parts_note,
                                         remaining_issues, recommendations, completed_on, submitted_by, content_hash)
  values (p_request, r.selected_provider_id, v_content ->> 'fault_identified', v_content ->> 'work_performed', v_parts,
          v_content ->> 'parts_note', v_content ->> 'remaining_issues', v_content ->> 'recommendations',
          (v_content ->> 'completed_on')::date, auth.uid(), v_hash)
  returning id into v_id;
  if r.status = 'waiting_for_parts' then perform private.change_job_status(p_request, 'work_in_progress', null); end if;
  perform private.change_job_status(p_request, 'work_completed', null);
  perform private.change_job_status(p_request, 'customer_confirmation_pending', null);
  perform private.system_message(private.conversation_for(p_request, r.selected_provider_id),
    'The provider submitted the completion report. Please review it and confirm, or report a concern.');
  perform private.notify_request_customer(p_request, 'completion_report', 'Work completed — please review', 'Confirm the job or report a concern.');
  perform private.audit('job.completion_report', 'service_request', p_request::text, jsonb_build_object('hash', v_hash));
  return v_id;
end $$;

/** Customer confirms completion; optional private feedback for the platform. */
create function public.confirm_completion(p_request uuid, p_rating smallint default null, p_comment text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_u uuid;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request for update;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'only the customer can confirm completion';
  end if;
  if r.status <> 'customer_confirmation_pending' then
    raise exception 'ITM:not_pending: There is nothing to confirm yet';
  end if;
  perform private.change_job_status(p_request, 'closed', 'Confirmed by the customer');
  if p_rating is not null or nullif(btrim(p_comment), '') is not null then
    insert into public.job_feedback (request_id, rating, comment, created_by) values (p_request, p_rating, nullif(btrim(p_comment), ''), auth.uid());
  end if;
  update public.request_invitations set status = 'closed' where request_id = p_request and status in ('invited', 'accepted');
  for v_u in select private.provider_manager_ids(r.selected_provider_id) union select private.assigned_member_user(p_request, r.selected_provider_id) loop
    perform private.notify(v_u, 'job_closed', 'Customer confirmed the job', null, '/work/' || p_request);
  end loop;
  perform private.audit('job.confirmed', 'service_request', p_request::text, jsonb_build_object('rating', p_rating));
end $$;

-- -----------------------------------------------------------------------------
-- Complaints
-- -----------------------------------------------------------------------------
create function private.complaint_event(p_complaint uuid, p_kind text, p_visibility text, p_body text)
returns void language sql security definer set search_path = '' as $$
  insert into public.complaint_events (complaint_id, actor_id, kind, visibility, body)
  values (p_complaint, auth.uid(), p_kind, p_visibility, nullif(btrim(p_body), ''));
$$;

create function private.notify_staff(p_kind text, p_title text, p_body text, p_link text, p_admins_only boolean default false)
returns void language sql security definer set search_path = '' as $$
  select private.notify(r.user_id, p_kind, p_title, p_body, p_link)
  from (select distinct user_id from public.user_roles
        where revoked_at is null and (role = 'platform_admin' or (not p_admins_only and role = 'support_agent'))) r;
$$;

/**
 * Open a complaint, about a job or in general. Safety incidents are critical
 * and escalated at once. Grievance timelines: acknowledge within 24 hours,
 * resolution target 15 days (the stricter of the regimes that may apply —
 * compliance-checklist §1.4, §2.3).
 */
create function public.open_complaint(
  p_request uuid, p_category public.complaint_category, p_description text, p_against_provider uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_side text := 'other'; v_id uuid; v_severity text; v_ref text;
begin
  perform private.require_active_user();
  if (select count(*) from public.complaints c where c.raised_by = auth.uid() and c.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'ITM:complaint_limit: You have opened many complaints today. Please contact the Grievance Officer directly.';
  end if;
  if p_request is not null then
    select * into r from public.service_requests where id = p_request;
    if not found or not (r.customer_id = auth.uid() or coalesce(private.is_request_provider(p_request), false)) then
      raise exception using errcode = '42501', message = 'you can only complain about jobs you are part of';
    end if;
    v_side := case when r.customer_id = auth.uid() then 'customer' else 'provider' end;
    if p_against_provider is null and v_side = 'customer' then p_against_provider := r.selected_provider_id; end if;
    if p_against_provider is not null and not exists (
      select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = p_against_provider
    ) then
      raise exception 'ITM:provider_not_on_job: That provider was not contacted for this job';
    end if;
  else
    p_against_provider := null;
  end if;
  v_severity := case when p_category = 'safety_incident' then 'critical' when p_category in ('conduct', 'data_privacy') then 'high' else 'normal' end;
  v_ref := 'CMP-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-' || lpad(nextval('public.complaint_ref_seq')::text, 5, '0');
  insert into public.complaints (reference, request_id, raised_by, raised_side, against_provider_id, category, severity, description,
                                 escalated, ack_due_at, resolve_due_at)
  values (v_ref, p_request, auth.uid(), v_side, p_against_provider, p_category, v_severity, btrim(p_description),
          p_category = 'safety_incident', now() + interval '24 hours', now() + interval '15 days')
  returning id into v_id;
  perform private.complaint_event(v_id, 'created', 'parties', p_description);
  if p_category = 'safety_incident' then
    perform private.complaint_event(v_id, 'escalated', 'staff', 'Safety incident: escalated automatically. Evidence on this job is preserved.');
    perform private.notify_staff('incident', 'SAFETY INCIDENT reported: ' || v_ref, left(p_description, 200), '/complaints/' || v_id, false);
  else
    perform private.notify_staff('complaint_new', 'New complaint ' || v_ref, replace(p_category::text, '_', ' '), '/complaints/' || v_id, false);
  end if;
  perform private.audit('complaint.opened', 'complaint', v_id::text, jsonb_build_object('category', p_category, 'request', p_request));
  return v_id;
end $$;

/** Customer reports a concern about completed work: complaint + job disputed. */
create function public.report_concern(p_request uuid, p_category public.complaint_category, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_id uuid;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found or r.customer_id <> auth.uid() then
    raise exception using errcode = '42501', message = 'only the customer can report a concern about this job';
  end if;
  if r.status not in ('customer_confirmation_pending', 'work_in_progress', 'waiting_for_parts') then
    raise exception 'ITM:cannot_dispute: Concerns about the work can be reported once work has started and before you confirm it. You can still open a complaint.';
  end if;
  v_id := public.open_complaint(p_request, p_category, p_description, r.selected_provider_id);
  perform private.change_job_status(p_request, 'disputed', 'Customer reported a concern');
  perform private.system_message(private.conversation_for(p_request, r.selected_provider_id),
    'The customer reported a concern. The platform''s support team will contact both of you.');
  return v_id;
end $$;

create function public.add_complaint_message(p_complaint uuid, p_body text, p_internal boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.complaints;
begin
  perform private.require_active_user();
  select * into c from public.complaints where id = p_complaint;
  if not found then raise exception 'ITM:not_found: Complaint not found'; end if;
  if p_internal and not private.is_staff() then raise exception using errcode = '42501', message = 'staff only'; end if;
  if not (private.is_complaint_party(p_complaint) or private.is_staff()) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'ITM:empty: Write a message'; end if;
  if c.status = 'closed' then raise exception 'ITM:complaint_closed: This complaint is closed'; end if;
  perform private.complaint_event(p_complaint, case when p_internal then 'internal_note' else 'message' end,
                                  case when p_internal then 'staff' else 'parties' end, p_body);
  if not p_internal and not private.is_staff() and c.assigned_to is not null then
    perform private.notify(c.assigned_to, 'complaint_message', 'New message on ' || c.reference, left(p_body, 120), '/complaints/' || p_complaint);
  elsif not p_internal and private.is_staff() then
    perform private.notify(c.raised_by, 'complaint_message', 'Update on your complaint ' || c.reference, left(p_body, 120), '/complaints/' || p_complaint);
  end if;
end $$;

create function public.register_complaint_attachment(p_complaint uuid, p_storage_path text, p_mime_type text, p_size_bytes int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_active_user();
  if not (private.is_complaint_party(p_complaint) or private.is_staff()) then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if split_part(p_storage_path, '/', 1) <> p_complaint::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'complaint-files' and o.name = p_storage_path) then
    raise exception 'ITM:file_missing: Upload the file first';
  end if;
  insert into public.complaint_attachments (complaint_id, storage_path, mime_type, size_bytes)
  values (p_complaint, p_storage_path, p_mime_type, p_size_bytes) returning id into v_id;
  perform private.complaint_event(p_complaint, 'attachment', 'parties', 'Added a file');
  return v_id;
end $$;

-- ---- staff handling -----------------------------------------------------------
create function private.require_staff() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if not private.is_staff() then raise exception using errcode = '42501', message = 'staff only'; end if;
end $$;

create function public.acknowledge_complaint(p_complaint uuid, p_message text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.complaints;
begin
  perform private.require_staff();
  select * into c from public.complaints where id = p_complaint for update;
  if c.status <> 'open' then raise exception 'ITM:already_acknowledged: Already acknowledged'; end if;
  update public.complaints set status = 'acknowledged', acknowledged_at = now(), assigned_to = coalesce(assigned_to, auth.uid()) where id = p_complaint;
  perform private.complaint_event(p_complaint, 'acknowledged', 'parties',
    coalesce(nullif(btrim(p_message), ''), 'We have received your complaint and will follow up with both parties.'));
  perform private.notify(c.raised_by, 'complaint_acknowledged', 'Complaint ' || c.reference || ' acknowledged', null, '/complaints/' || p_complaint);
  perform private.audit('complaint.acknowledged', 'complaint', p_complaint::text, '{}'::jsonb);
end $$;

create function public.assign_complaint(p_complaint uuid, p_staff uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if not exists (select 1 from public.user_roles r where r.user_id = p_staff and r.revoked_at is null and r.role in ('support_agent', 'platform_admin')) then
    raise exception 'ITM:not_staff: Assign to a member of platform staff';
  end if;
  update public.complaints set assigned_to = p_staff, status = case when status = 'open' then 'acknowledged'::public.complaint_status else status end,
         acknowledged_at = coalesce(acknowledged_at, now())
  where id = p_complaint;
  perform private.complaint_event(p_complaint, 'assigned', 'staff', (select coalesce(full_name, 'staff member') from public.profiles where id = p_staff));
  perform private.notify(p_staff, 'complaint_assigned', 'Complaint assigned to you', null, '/complaints/' || p_complaint);
end $$;

create function public.escalate_complaint(p_complaint uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.complaints;
begin
  perform private.require_staff();
  select * into c from public.complaints where id = p_complaint;
  update public.complaints set escalated = true, severity = case when severity = 'normal' then 'high' else severity end where id = p_complaint;
  perform private.complaint_event(p_complaint, 'escalated', 'staff', p_reason);
  perform private.notify_staff('complaint_escalated', 'Escalated: ' || c.reference, left(p_reason, 200), '/complaints/' || p_complaint, true);
  perform private.audit('complaint.escalated', 'complaint', p_complaint::text, jsonb_build_object('reason', p_reason));
end $$;

/**
 * Move a complaint forward. Resolving needs a resolution category and notes
 * that describe how it was handled — not a technical finding about the work.
 */
create function public.set_complaint_status(p_complaint uuid, p_status public.complaint_status,
                                            p_resolution public.complaint_resolution default null, p_notes text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.complaints;
begin
  perform private.require_staff();
  select * into c from public.complaints where id = p_complaint for update;
  if not found then raise exception 'ITM:not_found: Complaint not found'; end if;
  if not (
    (c.status in ('open', 'acknowledged') and p_status = 'in_progress') or
    (c.status in ('acknowledged', 'in_progress') and p_status = 'resolved') or
    (c.status = 'resolved' and p_status in ('closed', 'in_progress'))
  ) then
    raise exception 'ITM:invalid_transition: A % complaint cannot be set to %', c.status, p_status;
  end if;
  if p_status = 'resolved' and (p_resolution is null or coalesce(btrim(p_notes), '') = '') then
    raise exception 'ITM:resolution_required: Record how the complaint was handled';
  end if;
  update public.complaints
  set status = p_status,
      resolution = case when p_status = 'resolved' then p_resolution else resolution end,
      resolution_notes = case when p_status = 'resolved' then btrim(p_notes) else resolution_notes end,
      resolved_at = case when p_status = 'resolved' then now() when p_status = 'in_progress' then null else resolved_at end
  where id = p_complaint;
  perform private.complaint_event(p_complaint, case p_status when 'resolved' then 'resolved' when 'in_progress' then
                                    case when c.status = 'resolved' then 'reopened' else 'status_changed' end else 'status_changed' end,
                                  'parties', coalesce(nullif(btrim(p_notes), ''), replace(p_status::text, '_', ' ')));
  perform private.notify(c.raised_by, 'complaint_update', 'Complaint ' || c.reference || ': ' || replace(p_status::text, '_', ' '), left(p_notes, 200), '/complaints/' || p_complaint);
  perform private.audit('complaint.' || p_status::text, 'complaint', p_complaint::text, jsonb_build_object('resolution', p_resolution));
end $$;

/** Only staff close a disputed job, and only once a linked complaint is resolved. */
create function public.close_disputed_job(p_request uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_staff();
  if not exists (select 1 from public.service_requests r where r.id = p_request and r.status = 'disputed') then
    raise exception 'ITM:not_disputed: This job is not disputed';
  end if;
  if not exists (select 1 from public.complaints c where c.request_id = p_request and c.status in ('resolved', 'closed')) then
    raise exception 'ITM:complaint_open: Resolve the linked complaint first';
  end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'ITM:note_required: Give a closing note'; end if;
  perform private.change_job_status(p_request, 'closed', p_note);
  update public.request_invitations set status = 'closed' where request_id = p_request and status in ('invited', 'accepted');
  perform private.audit('job.dispute_closed', 'service_request', p_request::text, jsonb_build_object('note', p_note));
end $$;

/**
 * Staff read a job conversation ONLY through a complaint about that job.
 * Every view is recorded on the complaint and in the audit log.
 */
create function public.staff_read_conversation(p_complaint uuid, p_conversation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.complaints; v_msgs jsonb;
begin
  perform private.require_staff();
  select * into c from public.complaints where id = p_complaint;
  if c.request_id is null or not exists (select 1 from public.conversations x where x.id = p_conversation and x.request_id = c.request_id) then
    raise exception 'ITM:not_linked: That conversation is not part of this complaint''s job';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('created_at', m.created_at, 'sender_side', m.sender_side, 'kind', m.kind,
                                               'body', m.body, 'has_file', m.storage_path is not null) order by m.created_at), '[]'::jsonb)
  into v_msgs from public.messages m where m.conversation_id = p_conversation;
  perform private.complaint_event(p_complaint, 'conversation_viewed', 'staff', 'Viewed the job conversation');
  perform private.audit('complaint.conversation_viewed', 'conversation', p_conversation::text, jsonb_build_object('complaint', p_complaint));
  return v_msgs;
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.expire_estimates() from authenticated;

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
  private.can_view_request(uuid),
  private.is_conversation_participant(uuid),
  private.conversation_open(uuid),
  private.can_act_for_provider_on_request(uuid, uuid),
  private.part_side(uuid),
  private.can_view_part(uuid),
  private.is_selected_provider_actor(uuid),
  private.is_complaint_party(uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
