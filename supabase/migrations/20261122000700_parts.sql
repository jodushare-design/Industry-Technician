-- =============================================================================
-- Spare-parts coordination (Prompt 9)
--
-- Workflow (brief): identified → compatibility checked or marked unknown →
-- supplier availability checked → price recorded → customer reviews →
-- approves / rejects → arranged (by customer or provider) → received
-- (collected or delivered) → installed → included in the completion report.
--
--   * Compatibility is never assumed: it starts "unknown" and is set by a
--     named side with a note. "Confirmed by provider" only by the provider.
--   * A part's cost needs its own customer approval (fingerprinted) and is
--     never added to an accepted estimate.
--   * No marketplace: no cart, no payment, no supplier commission. Supplier
--     details are information shared between the two parties of the job.
-- =============================================================================

create type public.part_compatibility as enum ('unknown', 'confirmed_by_provider', 'confirmed_by_supplier', 'not_compatible');
create type public.part_availability as enum ('unknown', 'in_stock', 'to_order', 'unavailable');
create type public.part_stage as enum (
  'identified', 'awaiting_approval', 'approved', 'rejected', 'arranged', 'received', 'installed', 'cancelled'
);

create table public.part_requests (
  id                    uuid primary key default gen_random_uuid(),
  request_id            uuid not null references public.service_requests (id),
  provider_profile_id   uuid not null references public.provider_profiles (id),
  created_by            uuid not null references public.profiles (id),
  created_side          text not null check (created_side in ('customer', 'provider')),
  part_name             text not null check (char_length(btrim(part_name)) between 2 and 200),
  part_number           text check (part_number is null or char_length(part_number) <= 100),
  manufacturer_text     text check (manufacturer_text is null or char_length(manufacturer_text) <= 200),
  catalogue_part_id     uuid references public.catalogue_entities (id),
  customer_machine_id   uuid references public.customer_machines (id),
  model_text            text check (model_text is null or char_length(model_text) <= 200),
  quantity              numeric(10, 2) not null default 1 check (quantity > 0 and quantity <= 100000),
  unit                  text not null default 'pcs' check (unit in ('pcs', 'set', 'pair', 'm', 'kg', 'l')),
  specifications        text check (specifications is null or char_length(specifications) <= 2000),
  compatibility         public.part_compatibility not null default 'unknown',
  compatibility_note    text check (compatibility_note is null or char_length(compatibility_note) <= 500),
  compatibility_set_by  uuid references public.profiles (id),
  compatibility_set_at  timestamptz,
  supplier_name         text check (supplier_name is null or char_length(supplier_name) <= 200),
  supplier_contact      text check (supplier_contact is null or char_length(supplier_contact) <= 200),
  availability          public.part_availability not null default 'unknown',
  unit_price            numeric(12, 2) check (unit_price is null or unit_price >= 0),
  total_price           numeric(14, 2) generated always as (round(unit_price * quantity, 2)) stored,
  expected_delivery     date,
  arranged_by           text check (arranged_by is null or arranged_by in ('customer', 'provider')),
  photo_path            text,
  stage                 public.part_stage not null default 'identified',
  approval_hash         text check (approval_hash is null or approval_hash ~ '^[0-9a-f]{64}$'),
  decided_at            timestamptz,
  decided_by            uuid references public.profiles (id),
  decision_note         text check (decision_note is null or char_length(decision_note) <= 1000),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index part_requests_request on public.part_requests (request_id, created_at);
create trigger part_requests_touch before update on public.part_requests
  for each row execute function private.touch_updated_at();

create table public.part_status_events (
  id         bigint generated always as identity primary key,
  part_id    uuid not null references public.part_requests (id),
  from_stage public.part_stage,
  to_stage   public.part_stage not null,
  actor_id   uuid references public.profiles (id),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index part_status_events_part on public.part_status_events (part_id, id);
create trigger part_status_events_no_update before update or delete on public.part_status_events
  for each row execute function private.block_audit_mutation();

-- Once sent for approval, what the customer approves cannot change.
create function private.guard_part_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'ITM:part_record: Parts are kept as a record. Cancel instead.';
  end if;
  if old.stage <> 'identified' and (
    (new.part_name, new.part_number, new.manufacturer_text, new.catalogue_part_id, new.customer_machine_id, new.model_text,
     new.quantity, new.unit, new.specifications, new.supplier_name, new.unit_price, new.request_id, new.provider_profile_id)
    is distinct from
    (old.part_name, old.part_number, old.manufacturer_text, old.catalogue_part_id, old.customer_machine_id, old.model_text,
     old.quantity, old.unit, old.specifications, old.supplier_name, old.unit_price, old.request_id, old.provider_profile_id)
  ) then
    raise exception 'ITM:part_frozen: This part was sent for approval and cannot be changed. Cancel it and add a new one.';
  end if;
  return new;
end $$;
create trigger part_requests_guard before update or delete on public.part_requests
  for each row execute function private.guard_part_request();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('part-photos', 'part-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Access
-- -----------------------------------------------------------------------------
create function private.part_side(p_part uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.part_requests p join public.service_requests r on r.id = p.request_id
                 where p.id = p_part and r.customer_id = auth.uid()) then 'customer'
    when exists (select 1 from public.part_requests p
                 where p.id = p_part and private.can_act_for_provider_on_request(p.request_id, p.provider_profile_id)) then 'provider'
  end;
$$;

create function private.can_view_part(p_part uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.part_side(p_part) is not null or private.is_staff();
$$;

alter table public.part_requests      enable row level security;
alter table public.part_status_events enable row level security;
revoke all on public.part_requests, public.part_status_events from anon, authenticated;
grant select on public.part_requests, public.part_status_events to authenticated;

create policy part_requests_read on public.part_requests for select to authenticated using (private.can_view_part(id));
create policy part_status_events_read on public.part_status_events for select to authenticated using (private.can_view_part(part_id));

create policy part_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'part-photos' and private.part_side(private.try_uuid((storage.foldername(name))[1])) is not null
              and private.is_active_user());
create policy part_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'part-photos' and private.can_view_part(private.try_uuid((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create function private.part_event(p_part uuid, p_from public.part_stage, p_to public.part_stage, p_note text)
returns void language sql security definer set search_path = '' as $$
  insert into public.part_status_events (part_id, from_stage, to_stage, actor_id, note)
  values (p_part, p_from, p_to, auth.uid(), nullif(btrim(p_note), ''));
$$;

create function private.part_content(p_part uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'request_id', p.request_id, 'provider_id', p.provider_profile_id, 'part_name', p.part_name,
    'part_number', p.part_number, 'manufacturer', p.manufacturer_text, 'model', p.model_text,
    'quantity', p.quantity::text, 'unit', p.unit, 'specifications', p.specifications,
    'compatibility', p.compatibility, 'supplier', p.supplier_name, 'availability', p.availability,
    'unit_price', p.unit_price::text, 'total_price', p.total_price::text, 'currency', 'INR',
    'expected_delivery', p.expected_delivery)
  from public.part_requests p where p.id = p_part;
$$;

create function private.part_notify_other_side(p_part uuid, p_kind text, p_title text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.part_requests; r public.service_requests; v_u uuid;
begin
  select * into p from public.part_requests where id = p_part;
  select * into r from public.service_requests where id = p.request_id;
  if private.part_side(p_part) = 'provider' then
    perform private.notify(r.customer_id, p_kind, p_title, p_body, '/requests/' || r.id || '/parts#part-' || p.id);
  else
    for v_u in select private.provider_manager_ids(p.provider_profile_id) union select private.assigned_member_user(r.id, p.provider_profile_id) loop
      perform private.notify(v_u, p_kind, p_title, p_body, '/work/' || r.id || '/parts#part-' || p.id);
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

/** Either side of an engaged job adds a part (stage "identified"). */
create function public.create_part_request(p_request uuid, p_provider uuid, p_fields jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.service_requests; v_side text; v_id uuid;
begin
  perform private.require_active_user();
  select * into r from public.service_requests where id = p_request;
  if not found then raise exception using errcode = '42501', message = 'not allowed'; end if;
  v_side := case when r.customer_id = auth.uid() then 'customer'
                 when private.can_act_for_provider_on_request(p_request, p_provider) then 'provider' end;
  if v_side is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if not exists (select 1 from public.request_invitations i where i.request_id = p_request and i.provider_profile_id = p_provider and i.status = 'accepted') then
    raise exception 'ITM:not_engaged: Parts can be coordinated with a provider who has accepted the request';
  end if;
  if r.status not in ('discussion', 'estimate_sent', 'awaiting_approval', 'approved', 'scheduled', 'provider_travelling',
                      'provider_arrived', 'work_in_progress', 'waiting_for_parts') then
    raise exception 'ITM:request_not_open: Parts cannot be added at this stage';
  end if;
  if nullif(p_fields ->> 'customer_machine_id', '') is not null and not exists (
    select 1 from public.customer_machines m where m.id = (p_fields ->> 'customer_machine_id')::uuid and m.owner_id = r.customer_id
  ) then
    raise exception 'ITM:machine_invalid: Choose one of the customer''s machines';
  end if;
  insert into public.part_requests (
    request_id, provider_profile_id, created_by, created_side, part_name, part_number, manufacturer_text, customer_machine_id,
    model_text, quantity, unit, specifications, supplier_name, supplier_contact, availability, unit_price, expected_delivery)
  values (
    p_request, p_provider, auth.uid(), v_side, btrim(p_fields ->> 'part_name'), nullif(btrim(p_fields ->> 'part_number'), ''),
    nullif(btrim(p_fields ->> 'manufacturer_text'), ''), nullif(p_fields ->> 'customer_machine_id', '')::uuid,
    nullif(btrim(p_fields ->> 'model_text'), ''), coalesce(nullif(p_fields ->> 'quantity', '')::numeric, 1),
    coalesce(nullif(p_fields ->> 'unit', ''), 'pcs'), nullif(btrim(p_fields ->> 'specifications'), ''),
    nullif(btrim(p_fields ->> 'supplier_name'), ''), nullif(btrim(p_fields ->> 'supplier_contact'), ''),
    coalesce(nullif(p_fields ->> 'availability', '')::public.part_availability, 'unknown'),
    nullif(p_fields ->> 'unit_price', '')::numeric, nullif(p_fields ->> 'expected_delivery', '')::date)
  returning id into v_id;
  perform private.part_event(v_id, null, 'identified', null);
  perform private.system_message(private.conversation_for(p_request, p_provider),
    format('%s added a spare part: %s.', case v_side when 'customer' then 'The customer' else 'The provider' end, btrim(p_fields ->> 'part_name')));
  perform private.part_notify_other_side(v_id, 'part_added', 'Spare part added: ' || btrim(p_fields ->> 'part_name'), null);
  perform private.audit('part.created', 'part_request', v_id::text, jsonb_build_object('request', p_request, 'side', v_side));
  return v_id;
end $$;

/** Update supplier, availability, price, delivery (and identity fields) while still "identified". */
create function public.update_part_request(p_part uuid, p_fields jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.part_requests;
begin
  perform private.require_active_user();
  select * into p from public.part_requests where id = p_part for update;
  if not found or private.part_side(p_part) is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if p.stage not in ('identified', 'approved', 'arranged') then
    raise exception 'ITM:part_frozen: This part can no longer be edited';
  end if;
  update public.part_requests set
    part_name         = coalesce(nullif(btrim(p_fields ->> 'part_name'), ''), part_name),
    part_number       = case when p_fields ? 'part_number' then nullif(btrim(p_fields ->> 'part_number'), '') else part_number end,
    manufacturer_text = case when p_fields ? 'manufacturer_text' then nullif(btrim(p_fields ->> 'manufacturer_text'), '') else manufacturer_text end,
    model_text        = case when p_fields ? 'model_text' then nullif(btrim(p_fields ->> 'model_text'), '') else model_text end,
    quantity          = coalesce(nullif(p_fields ->> 'quantity', '')::numeric, quantity),
    unit              = coalesce(nullif(p_fields ->> 'unit', ''), unit),
    specifications    = case when p_fields ? 'specifications' then nullif(btrim(p_fields ->> 'specifications'), '') else specifications end,
    supplier_name     = case when p_fields ? 'supplier_name' then nullif(btrim(p_fields ->> 'supplier_name'), '') else supplier_name end,
    supplier_contact  = case when p_fields ? 'supplier_contact' then nullif(btrim(p_fields ->> 'supplier_contact'), '') else supplier_contact end,
    availability      = coalesce(nullif(p_fields ->> 'availability', '')::public.part_availability, availability),
    unit_price        = case when p_fields ? 'unit_price' then nullif(p_fields ->> 'unit_price', '')::numeric else unit_price end,
    expected_delivery = case when p_fields ? 'expected_delivery' then nullif(p_fields ->> 'expected_delivery', '')::date else expected_delivery end
  where id = p_part;
end $$;

/** Record who says the part is (or is not) compatible. Providers alone may say "confirmed by provider". */
create function public.set_part_compatibility(p_part uuid, p_status public.part_compatibility, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text; p public.part_requests;
begin
  perform private.require_active_user();
  v_side := private.part_side(p_part);
  if v_side is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  select * into p from public.part_requests where id = p_part;
  if p.stage in ('installed', 'cancelled', 'rejected') then raise exception 'ITM:part_closed: This part is closed'; end if;
  if p_status = 'confirmed_by_provider' and v_side <> 'provider' then
    raise exception 'ITM:provider_only: Only the provider can confirm compatibility on their own behalf';
  end if;
  if p_status = 'confirmed_by_supplier' and coalesce(btrim(p_note), '') = '' then
    raise exception 'ITM:note_required: Say which supplier confirmed it and how (e.g. "Sri Ram Traders, by phone, quoted part no.")';
  end if;
  update public.part_requests
  set compatibility = p_status, compatibility_note = nullif(btrim(p_note), ''), compatibility_set_by = auth.uid(), compatibility_set_at = now()
  where id = p_part;
  perform private.audit('part.compatibility', 'part_request', p_part::text, jsonb_build_object('status', p_status, 'side', v_side, 'note', p_note));
end $$;

/** Send the priced part to the customer for approval. Freezes it; posts a parts card. */
create function public.submit_part_for_approval(p_part uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.part_requests; v_hash text; v_conv uuid; r public.service_requests;
begin
  perform private.require_active_user();
  select * into p from public.part_requests where id = p_part for update;
  if not found or private.part_side(p_part) is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if p.stage <> 'identified' then raise exception 'ITM:not_identified: Only a part that is not yet sent can be sent for approval'; end if;
  if p.unit_price is null then raise exception 'ITM:price_required: Record the price before asking for approval'; end if;
  if p.availability = 'unknown' then raise exception 'ITM:availability_required: Check availability with the supplier first'; end if;
  if p.availability = 'unavailable' then raise exception 'ITM:unavailable: This part is unavailable. Find another supplier first.'; end if;
  if p.compatibility = 'not_compatible' then raise exception 'ITM:not_compatible: This part is marked not compatible'; end if;
  select * into r from public.service_requests where id = p.request_id;
  v_hash := encode(sha256(convert_to(private.part_content(p_part)::text, 'UTF8')), 'hex');
  update public.part_requests set stage = 'awaiting_approval', approval_hash = v_hash where id = p_part;
  perform private.part_event(p_part, 'identified', 'awaiting_approval', null);
  v_conv := private.conversation_for(p.request_id, p.provider_profile_id);
  insert into public.messages (conversation_id, sender_id, sender_side, kind, body, ref_id)
  values (v_conv, auth.uid(), private.part_side(p_part), 'parts_card',
          format('%s × %s %s — ₹%s (%s)', p.part_name, trim(to_char(p.quantity, 'FM999990.##')), p.unit,
                 to_char(p.total_price, 'FM99,99,99,99,990.00'),
                 case p.compatibility when 'unknown' then 'compatibility not confirmed' when 'confirmed_by_provider' then 'confirmed by provider'
                                      else 'confirmed by supplier' end),
          p_part);
  update public.conversations set last_message_at = now() where id = v_conv;
  if private.part_side(p_part) = 'provider' then
    perform private.notify(r.customer_id, 'part_approval_needed', 'Approve spare part: ' || p.part_name,
      format('₹%s — please approve or reject in the app', to_char(p.total_price, 'FM99,99,99,99,990.00')), '/requests/' || r.id || '/parts#part-' || p_part);
  end if;
  perform private.audit('part.submitted', 'part_request', p_part::text, jsonb_build_object('hash', v_hash, 'total', p.total_price));
  return v_hash;
end $$;

/** Customer approves or rejects the part cost; on approval chooses who arranges it. */
create function public.decide_part(p_part uuid, p_approve boolean, p_hash text, p_arranged_by text default null, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.part_requests; r public.service_requests;
begin
  perform private.require_active_user();
  select * into p from public.part_requests where id = p_part for update;
  select * into r from public.service_requests where id = p.request_id;
  if p.id is null or r.customer_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'only the customer can approve the cost of a part';
  end if;
  if p.stage <> 'awaiting_approval' then raise exception 'ITM:part_not_open: This part is not waiting for approval'; end if;
  if p_hash is distinct from p.approval_hash then
    raise exception 'ITM:part_changed: The part details changed. Please reload and review again.';
  end if;
  if p_approve and coalesce(p_arranged_by, '') not in ('customer', 'provider') then
    raise exception 'ITM:arranged_by_required: Choose who will arrange the part';
  end if;
  update public.part_requests
  set stage = case when p_approve then 'approved' else 'rejected' end::public.part_stage,
      arranged_by = case when p_approve then p_arranged_by else arranged_by end,
      decided_at = now(), decided_by = auth.uid(), decision_note = nullif(btrim(p_note), '')
  where id = p_part;
  perform private.part_event(p_part, 'awaiting_approval', case when p_approve then 'approved' else 'rejected' end::public.part_stage, p_note);
  perform private.system_message(private.conversation_for(p.request_id, p.provider_profile_id),
    case when p_approve then format('The customer approved %s (₹%s). %s will arrange it.', p.part_name, to_char(p.total_price, 'FM99,99,99,99,990.00'),
                                    case p_arranged_by when 'customer' then 'The customer' else 'The provider' end)
         else format('The customer did not approve %s.', p.part_name) end);
  perform private.part_notify_other_side(p_part, case when p_approve then 'part_approved' else 'part_rejected' end,
    case when p_approve then 'Part approved: ' else 'Part not approved: ' end || p.part_name, nullif(btrim(p_note), ''));
  perform private.audit(case when p_approve then 'part.approved' else 'part.rejected' end, 'part_request', p_part::text,
    jsonb_build_object('hash', p.approval_hash, 'total', p.total_price, 'arranged_by', p_arranged_by));
end $$;

/**
 * Move an approved part along: arranged → received → installed, or cancel.
 * Arranged/received: the arranging side (or the provider). Installed: provider only.
 */
create function public.advance_part(p_part uuid, p_stage public.part_stage, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.part_requests; v_side text;
begin
  perform private.require_active_user();
  select * into p from public.part_requests where id = p_part for update;
  v_side := private.part_side(p_part);
  if p.id is null or v_side is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if not (
    (p.stage = 'approved' and p_stage = 'arranged' and (v_side = p.arranged_by or v_side = 'provider')) or
    (p.stage = 'arranged' and p_stage = 'received' and (v_side = p.arranged_by or v_side = 'provider')) or
    (p.stage = 'received' and p_stage = 'installed' and v_side = 'provider') or
    (p.stage in ('identified', 'awaiting_approval', 'approved', 'arranged') and p_stage = 'cancelled')
  ) then
    raise exception 'ITM:invalid_part_step: That step is not possible now';
  end if;
  if p_stage = 'cancelled' and coalesce(btrim(p_note), '') = '' then
    raise exception 'ITM:note_required: Give a reason for cancelling the part';
  end if;
  update public.part_requests set stage = p_stage where id = p_part;
  perform private.part_event(p_part, p.stage, p_stage, p_note);
  perform private.part_notify_other_side(p_part, 'part_' || p_stage::text,
    format('%s: %s', initcap(p_stage::text), p.part_name), nullif(btrim(p_note), ''));
end $$;

create function public.register_part_photo(p_part uuid, p_storage_path text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if private.part_side(p_part) is null then raise exception using errcode = '42501', message = 'not allowed'; end if;
  if split_part(p_storage_path, '/', 1) <> p_part::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'part-photos' and o.name = p_storage_path) then
    raise exception 'ITM:file_missing: Upload the photo first';
  end if;
  update public.part_requests set photo_path = p_storage_path where id = p_part and stage not in ('installed', 'cancelled');
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
  private.can_view_part(uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
