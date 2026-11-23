-- =============================================================================
-- Estimates and customer approval (Prompt 8)
--
--   * The provider prepares and sends; only the request's customer accepts,
--     rejects or asks for a revision — never staff, never the provider.
--   * Every revision is kept. A sent revision cannot be edited; an accepted
--     revision is immutable. A new price is never "accepted" without an
--     explicit customer action on that exact revision (content hash).
--   * Additional work = a new estimate that needs its own approval.
--   * Inspection-only estimates (e.g. "Inspection fee ₹500; repair price after
--     inspection") are supported.
--   * Amounts are INR numeric(12,2). No payment is collected (V1).
-- =============================================================================

create type public.estimate_kind as enum ('inspection', 'repair', 'additional_work');
create type public.estimate_revision_status as enum (
  'draft', 'sent', 'accepted', 'rejected', 'revision_requested', 'superseded', 'withdrawn', 'expired'
);

create table public.estimates (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  kind                public.estimate_kind not null,
  title               text not null check (char_length(btrim(title)) between 3 and 120),
  created_by          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now()
);
create index estimates_request on public.estimates (request_id);

create table public.estimate_revisions (
  id                  uuid primary key default gen_random_uuid(),
  estimate_id         uuid not null references public.estimates (id),
  revision_no         int not null check (revision_no >= 1),
  status              public.estimate_revision_status not null default 'draft',
  inspection_fee      numeric(12, 2) not null default 0 check (inspection_fee >= 0),
  visit_charge        numeric(12, 2) not null default 0 check (visit_charge >= 0),
  labour              numeric(12, 2) not null default 0 check (labour >= 0),
  travel              numeric(12, 2) not null default 0 check (travel >= 0),
  parts               numeric(12, 2) not null default 0 check (parts >= 0),
  other_charges       numeric(12, 2) not null default 0 check (other_charges >= 0),
  other_charges_note  text check (other_charges_note is null or char_length(other_charges_note) <= 200),
  tax_amount          numeric(12, 2) not null default 0 check (tax_amount >= 0),
  tax_note            text check (tax_note is null or char_length(tax_note) <= 200),
  total               numeric(12, 2) generated always as
                        (inspection_fee + visit_charge + labour + travel + parts + other_charges + tax_amount) stored,
  scope               text not null default '' check (char_length(scope) <= 3000),
  exclusions          text check (exclusions is null or char_length(exclusions) <= 2000),
  expected_completion text check (expected_completion is null or char_length(expected_completion) <= 200),
  valid_until         date,
  notes               text check (notes is null or char_length(notes) <= 1000),
  prepared_by         uuid not null references public.profiles (id),
  sent_at             timestamptz,
  content_hash        text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  decided_at          timestamptz,
  decided_by          uuid references public.profiles (id),
  decision_note       text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (estimate_id, revision_no),
  constraint sent_has_hash check (status = 'draft' or content_hash is not null)
);
create index estimate_revisions_estimate on public.estimate_revisions (estimate_id, revision_no desc);
create unique index estimate_one_draft on public.estimate_revisions (estimate_id) where status = 'draft';
create trigger estimate_revisions_touch before update on public.estimate_revisions
  for each row execute function private.touch_updated_at();

-- Sent revisions are frozen; accepted ones completely. Drafts may be deleted, nothing else.
create function private.guard_estimate_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'ITM:estimate_record: Sent estimates are kept as a record and cannot be deleted';
    end if;
    return old;
  end if;
  if old.status = 'accepted' then
    raise exception 'ITM:estimate_locked: An accepted estimate cannot be changed. Send a new estimate for additional work.';
  end if;
  if old.status <> 'draft' and (
    (new.inspection_fee, new.visit_charge, new.labour, new.travel, new.parts, new.other_charges, new.other_charges_note,
     new.tax_amount, new.tax_note, new.scope, new.exclusions, new.expected_completion, new.valid_until, new.notes,
     new.content_hash, new.revision_no, new.estimate_id, new.prepared_by, new.sent_at)
    is distinct from
    (old.inspection_fee, old.visit_charge, old.labour, old.travel, old.parts, old.other_charges, old.other_charges_note,
     old.tax_amount, old.tax_note, old.scope, old.exclusions, old.expected_completion, old.valid_until, old.notes,
     old.content_hash, old.revision_no, old.estimate_id, old.prepared_by, old.sent_at)
  ) then
    raise exception 'ITM:estimate_sent_frozen: A sent estimate cannot be edited. Create a revision instead.';
  end if;
  return new;
end $$;
create trigger estimate_revisions_guard before update or delete on public.estimate_revisions
  for each row execute function private.guard_estimate_revision();

-- -----------------------------------------------------------------------------
-- Access
-- -----------------------------------------------------------------------------

/** User may act for this provider on this request: a manager, or the assigned employee. */
-- coalesce: assigned_member_user() is NULL when nobody is assigned, and
-- "false or NULL" is NULL — which "if not …" would treat as allowed.
create function private.can_act_for_provider_on_request(p_request uuid, p_provider uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.can_manage_provider(p_provider), false)
      or coalesce(private.assigned_member_user(p_request, p_provider) = auth.uid(), false);
$$;

/**
 * May this user SEND estimates for the provider? Individuals and company admins
 * yes; an assigned employee only if the company granted can_send_estimates.
 */
create function private.can_send_estimate(p_request uuid, p_provider uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_provider(p_provider)
      or exists (
        select 1 from public.request_invitations i
        join public.provider_profiles m on m.id = i.assigned_member_id
        join public.user_roles r on r.user_id = m.user_id and r.organization_id = m.organization_id
          and r.role = 'company_technician' and r.revoked_at is null and r.can_send_estimates
        where i.request_id = p_request and i.provider_profile_id = p_provider and m.user_id = auth.uid()
      );
$$;

alter table public.estimates          enable row level security;
alter table public.estimate_revisions enable row level security;
revoke all on public.estimates, public.estimate_revisions from anon, authenticated;
grant select on public.estimates, public.estimate_revisions to authenticated;

create policy estimates_read on public.estimates for select to authenticated
  using (
    private.is_request_customer(request_id)
    or private.can_act_for_provider_on_request(request_id, provider_profile_id)
    or private.is_staff()
  );
-- The customer never sees drafts.
create policy estimate_revisions_read on public.estimate_revisions for select to authenticated
  using (exists (
    select 1 from public.estimates e where e.id = estimate_id and (
      (private.is_request_customer(e.request_id) and status <> 'draft')
      or private.can_act_for_provider_on_request(e.request_id, e.provider_profile_id)
      or (private.is_staff() and status <> 'draft')
    )
  ));

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

/** Canonical content the customer approves. Changing any of it changes the hash. */
create function private.estimate_revision_content(p_revision uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'estimate_id', e.id, 'request_id', e.request_id, 'provider_id', e.provider_profile_id, 'kind', e.kind, 'title', e.title,
    'revision_no', v.revision_no,
    'inspection_fee', v.inspection_fee::text, 'visit_charge', v.visit_charge::text, 'labour', v.labour::text,
    'travel', v.travel::text, 'parts', v.parts::text, 'other_charges', v.other_charges::text,
    'other_charges_note', v.other_charges_note, 'tax_amount', v.tax_amount::text, 'tax_note', v.tax_note,
    'total', v.total::text, 'currency', 'INR',
    'scope', v.scope, 'exclusions', v.exclusions, 'expected_completion', v.expected_completion,
    'valid_until', v.valid_until, 'notes', v.notes
  )
  from public.estimate_revisions v join public.estimates e on e.id = v.estimate_id
  where v.id = p_revision;
$$;

create function private.conversation_for(p_request uuid, p_provider uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.conversations where request_id = p_request and provider_profile_id = p_provider;
$$;

/** After a decision or withdrawal: back to "approved" if something is already approved, else "discussion". */
create function private.settle_request_after_estimate(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status public.job_status; v_pending boolean; v_any_accepted boolean;
begin
  select status into v_status from public.service_requests where id = p_request;
  select exists (select 1 from public.estimate_revisions v join public.estimates e on e.id = v.estimate_id
                 where e.request_id = p_request and v.status = 'sent') into v_pending;
  select exists (select 1 from public.estimate_revisions v join public.estimates e on e.id = v.estimate_id
                 where e.request_id = p_request and v.status = 'accepted') into v_any_accepted;
  if v_status = 'awaiting_approval' and not v_pending then
    perform private.change_job_status(p_request, (case when v_any_accepted then 'approved' else 'discussion' end)::public.job_status, null);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Provider: draft, send, withdraw
-- -----------------------------------------------------------------------------

/**
 * Create or update the provider's draft. p_estimate null = new estimate.
 * For an estimate that already has a sent revision, this creates the next
 * revision as a draft (the sent one stays as it is until the new one is sent).
 */
create function public.save_estimate_draft(
  p_request uuid, p_provider uuid, p_estimate uuid, p_kind public.estimate_kind, p_title text, p_fields jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.service_requests;
  v_estimate uuid := p_estimate;
  v_rev uuid;
  v_next int;
  e public.estimates;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found or not private.can_act_for_provider_on_request(p_request, p_provider) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if not exists (select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = p_provider and i.status = 'accepted') then
    raise exception 'ITM:not_engaged: Accept the request before preparing an estimate';
  end if;
  if r.status in ('closed', 'cancelled', 'disputed', 'work_completed', 'customer_confirmation_pending') then
    raise exception 'ITM:request_not_open: Estimates cannot be prepared at this stage';
  end if;

  if v_estimate is null then
    if p_kind = 'additional_work' and not exists (
      select 1 from public.estimate_revisions v join public.estimates x on x.id = v.estimate_id
      where x.request_id = p_request and x.provider_profile_id = p_provider and v.status = 'accepted'
    ) then
      raise exception 'ITM:no_approved_estimate: Additional work needs an approved estimate first';
    end if;
    insert into public.estimates (request_id, provider_profile_id, kind, title, created_by)
    values (p_request, p_provider, p_kind,
            coalesce(nullif(btrim(p_title), ''), case p_kind when 'inspection' then 'Inspection' when 'repair' then 'Repair' else 'Additional work' end),
            auth.uid())
    returning id into v_estimate;
  else
    select * into e from public.estimates where id = v_estimate and request_id = p_request and provider_profile_id = p_provider;
    if not found then raise exception 'ITM:not_found: Estimate not found'; end if;
    if exists (select 1 from public.estimate_revisions v where v.estimate_id = v_estimate and v.status = 'accepted') then
      raise exception 'ITM:estimate_locked: This estimate is accepted and locked. Send a new estimate for additional work.';
    end if;
  end if;

  select id into v_rev from public.estimate_revisions where estimate_id = v_estimate and status = 'draft';
  if v_rev is null then
    select coalesce(max(revision_no), 0) + 1 into v_next from public.estimate_revisions where estimate_id = v_estimate;
    insert into public.estimate_revisions (estimate_id, revision_no, prepared_by) values (v_estimate, v_next, auth.uid())
    returning id into v_rev;
  end if;

  update public.estimate_revisions set
    inspection_fee      = coalesce((p_fields ->> 'inspection_fee')::numeric, 0),
    visit_charge        = coalesce((p_fields ->> 'visit_charge')::numeric, 0),
    labour              = coalesce((p_fields ->> 'labour')::numeric, 0),
    travel              = coalesce((p_fields ->> 'travel')::numeric, 0),
    parts               = coalesce((p_fields ->> 'parts')::numeric, 0),
    other_charges       = coalesce((p_fields ->> 'other_charges')::numeric, 0),
    other_charges_note  = nullif(btrim(p_fields ->> 'other_charges_note'), ''),
    tax_amount          = coalesce((p_fields ->> 'tax_amount')::numeric, 0),
    tax_note            = nullif(btrim(p_fields ->> 'tax_note'), ''),
    scope               = coalesce(btrim(p_fields ->> 'scope'), ''),
    exclusions          = nullif(btrim(p_fields ->> 'exclusions'), ''),
    expected_completion = nullif(btrim(p_fields ->> 'expected_completion'), ''),
    valid_until         = nullif(p_fields ->> 'valid_until', '')::date,
    notes               = nullif(btrim(p_fields ->> 'notes'), ''),
    prepared_by         = auth.uid()
  where id = v_rev;
  return v_rev;
end $$;

create function public.discard_estimate_draft(p_revision uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.estimate_revisions; e public.estimates;
begin
  perform private.require_active_user();
  select * into v from public.estimate_revisions where id = p_revision;
  select * into e from public.estimates where id = v.estimate_id;
  if v.status <> 'draft' or not private.can_act_for_provider_on_request(e.request_id, e.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  delete from public.estimate_revisions where id = p_revision;
  if not exists (select 1 from public.estimate_revisions where estimate_id = e.id) then
    delete from public.estimates where id = e.id;
  end if;
end $$;

create function public.send_estimate_revision(p_revision uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v public.estimate_revisions; e public.estimates; r public.service_requests; v_hash text; v_conv uuid;
begin
  perform private.require_active_user();
  select * into v from public.estimate_revisions where id = p_revision for update;
  select * into e from public.estimates where id = v.estimate_id;
  select * into r from public.service_requests where id = e.request_id;
  if v.id is null or not private.can_send_estimate(e.request_id, e.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed to send estimates for this provider';
  end if;
  if v.status <> 'draft' then raise exception 'ITM:not_draft: Only a draft can be sent'; end if;
  if not exists (select 1 from public.request_invitations i where i.request_id = e.request_id and i.provider_profile_id = e.provider_profile_id and i.status = 'accepted') then
    raise exception 'ITM:not_engaged: You are no longer engaged on this request';
  end if;
  if r.status in ('closed', 'cancelled', 'disputed', 'work_completed', 'customer_confirmation_pending') then
    raise exception 'ITM:request_not_open: Estimates cannot be sent at this stage';
  end if;
  -- completeness
  if char_length(btrim(v.scope)) < 10 then
    raise exception 'ITM:scope_required: Describe the scope of work (at least 10 characters)';
  end if;
  if v.valid_until is null or v.valid_until < current_date then
    raise exception 'ITM:validity_required: Set a "valid until" date from today onwards';
  end if;
  if v.total <= 0 then
    raise exception 'ITM:total_required: The estimate total must be more than ₹0';
  end if;
  if e.kind = 'inspection' and (v.labour > 0 or v.parts > 0) then
    raise exception 'ITM:inspection_only: An inspection estimate cannot include labour or parts. Send a repair estimate after the inspection.';
  end if;
  if e.kind = 'inspection' and v.inspection_fee <= 0 then
    raise exception 'ITM:inspection_fee_required: Enter the inspection fee';
  end if;

  v_hash := encode(sha256(convert_to(private.estimate_revision_content(p_revision)::text, 'UTF8')), 'hex');
  -- earlier undecided revisions of this estimate are replaced by this one
  update public.estimate_revisions set status = 'superseded'
  where estimate_id = e.id and id <> p_revision and status in ('sent', 'revision_requested');
  update public.estimate_revisions set status = 'sent', sent_at = now(), content_hash = v_hash where id = p_revision;

  if r.status in ('provider_contacted', 'discussion') then
    if r.status = 'provider_contacted' then perform private.change_job_status(e.request_id, 'discussion', null); end if;
    perform private.change_job_status(e.request_id, 'estimate_sent', null);
    perform private.change_job_status(e.request_id, 'awaiting_approval', null);
  elsif r.status in ('approved', 'scheduled', 'work_in_progress', 'waiting_for_parts') then
    perform private.change_job_status(e.request_id, 'awaiting_approval', format('%s estimate sent', initcap(replace(e.kind::text, '_', ' '))));
  end if;

  v_conv := private.conversation_for(e.request_id, e.provider_profile_id);
  insert into public.messages (conversation_id, sender_id, sender_side, kind, body, ref_id)
  values (v_conv, auth.uid(), 'provider', 'estimate_card',
          format('%s — revision %s: ₹%s (valid until %s)', e.title, v.revision_no, to_char(v.total, 'FM99,99,99,99,990.00'), to_char(v.valid_until, 'DD Mon YYYY')),
          p_revision);
  update public.conversations set last_message_at = now() where id = v_conv;
  perform private.notify(r.customer_id, 'estimate_received', 'Estimate received: ' || e.title,
    format('₹%s — please review and approve or reject in the app', to_char(v.total, 'FM99,99,99,99,990.00')),
    '/requests/' || e.request_id || '/estimates/' || p_revision);
  perform private.audit('estimate.sent', 'estimate_revision', p_revision::text,
    jsonb_build_object('request', e.request_id, 'total', v.total, 'hash', v_hash, 'revision', v.revision_no));
  return v_hash;
end $$;

create function public.withdraw_estimate_revision(p_revision uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.estimate_revisions; e public.estimates;
begin
  perform private.require_active_user();
  select * into v from public.estimate_revisions where id = p_revision for update;
  select * into e from public.estimates where id = v.estimate_id;
  if v.id is null or not private.can_send_estimate(e.request_id, e.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if v.status not in ('sent', 'revision_requested') then
    raise exception 'ITM:cannot_withdraw: Only an undecided estimate can be withdrawn';
  end if;
  update public.estimate_revisions set status = 'withdrawn', decision_note = nullif(btrim(p_reason), '') where id = p_revision;
  perform private.system_message(private.conversation_for(e.request_id, e.provider_profile_id),
    format('The provider withdrew %s (revision %s).', e.title, v.revision_no));
  perform private.settle_request_after_estimate(e.request_id);
  perform private.audit('estimate.withdrawn', 'estimate_revision', p_revision::text, jsonb_build_object('reason', p_reason));
end $$;

-- -----------------------------------------------------------------------------
-- Customer decision
-- -----------------------------------------------------------------------------

/**
 * Only the request's customer decides, on the exact revision they were shown
 * (p_hash must match). p_decision: 'accept' | 'reject' | 'request_revision'.
 */
create function public.decide_estimate(p_revision uuid, p_decision text, p_hash text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.estimate_revisions; e public.estimates; r public.service_requests; v_conv uuid; v_u uuid;
begin
  perform private.require_active_user();
  select * into v from public.estimate_revisions where id = p_revision for update;
  select * into e from public.estimates where id = v.estimate_id;
  select * into r from public.service_requests where id = e.request_id for update;
  if v.id is null or r.customer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'only the customer who made the request can decide on an estimate';
  end if;
  if coalesce(p_decision, '') not in ('accept', 'reject', 'request_revision') then
    raise exception 'ITM:invalid_decision: Choose accept, reject or request a revision';
  end if;
  if v.status <> 'sent' then
    raise exception 'ITM:estimate_not_open: This estimate revision is no longer waiting for your decision (it is %)', replace(v.status::text, '_', ' ');
  end if;
  if v.valid_until < current_date then
    update public.estimate_revisions set status = 'expired' where id = p_revision;
    perform private.settle_request_after_estimate(e.request_id);
    raise exception 'ITM:estimate_expired: This estimate expired on %. Ask the provider to send a new one.', to_char(v.valid_until, 'DD Mon YYYY');
  end if;
  if p_hash is distinct from v.content_hash then
    raise exception 'ITM:estimate_changed: The estimate you were looking at is out of date. Please reload and review it again.';
  end if;
  if p_decision in ('reject', 'request_revision') and coalesce(btrim(p_note), '') = '' and p_decision = 'request_revision' then
    raise exception 'ITM:note_required: Tell the provider what to change';
  end if;

  update public.estimate_revisions
  set status = case p_decision when 'accept' then 'accepted' when 'reject' then 'rejected' else 'revision_requested' end::public.estimate_revision_status,
      decided_at = now(), decided_by = auth.uid(), decision_note = nullif(btrim(p_note), '')
  where id = p_revision;

  v_conv := private.conversation_for(e.request_id, e.provider_profile_id);
  if p_decision = 'accept' then
    -- accepting a provider's estimate selects that provider; other providers are told politely
    update public.service_requests set selected_provider_id = e.provider_profile_id where id = r.id;
    if e.kind in ('inspection', 'repair') then
      update public.request_invitations set status = 'not_selected'
      where request_id = r.id and provider_profile_id <> e.provider_profile_id and status in ('invited', 'accepted');
      update public.estimate_revisions v2 set status = 'superseded'
      from public.estimates e2
      where v2.estimate_id = e2.id and e2.request_id = r.id and e2.provider_profile_id <> e.provider_profile_id
        and v2.status in ('sent', 'revision_requested');
    end if;
    if r.status = 'awaiting_approval' and not exists (
      select 1 from public.estimate_revisions v3 join public.estimates e3 on e3.id = v3.estimate_id
      where e3.request_id = r.id and v3.status = 'sent'
    ) then
      perform private.change_job_status(r.id, 'approved', format('%s accepted by the customer', e.title));
    end if;
    perform private.system_message(v_conv, format('The customer accepted %s (revision %s) for ₹%s.', e.title, v.revision_no, to_char(v.total, 'FM99,99,99,99,990.00')));
  else
    perform private.settle_request_after_estimate(r.id);
    perform private.system_message(v_conv, case p_decision
      when 'reject' then format('The customer rejected %s (revision %s).', e.title, v.revision_no)
      else format('The customer asked for changes to %s (revision %s): %s', e.title, v.revision_no, btrim(p_note)) end);
  end if;

  for v_u in select private.provider_manager_ids(e.provider_profile_id) union select private.assigned_member_user(r.id, e.provider_profile_id) loop
    perform private.notify(v_u, 'estimate_' || p_decision,
      case p_decision when 'accept' then 'Estimate accepted' when 'reject' then 'Estimate rejected' else 'Changes requested' end || ': ' || e.title,
      nullif(btrim(p_note), ''), '/work/' || r.id);
  end loop;
  perform private.audit('estimate.' || p_decision, 'estimate_revision', p_revision::text,
    jsonb_build_object('request', r.id, 'hash', v.content_hash, 'total', v.total, 'note', p_note));
end $$;

/** Expire sent revisions past their validity date (run daily, or lazily on decision). */
create function public.expire_estimates()
returns int language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_req uuid;
begin
  with x as (
    update public.estimate_revisions set status = 'expired'
    where status = 'sent' and valid_until < current_date
    returning estimate_id
  ) select array_agg(distinct estimate_id) into v_ids from x;
  for v_req in select distinct request_id from public.estimates where id = any (coalesce(v_ids, '{}')) loop
    perform private.settle_request_after_estimate(v_req);
  end loop;
  return coalesce(cardinality(v_ids), 0);
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.expire_estimates() from authenticated; -- scheduled job only

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
  private.can_act_for_provider_on_request(uuid, uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
