-- =============================================================================
-- In-app chat, notifications and optional contact sharing (Prompt 7)
--
-- * One conversation per request per contacted provider, created when the
--   customer contacts the provider. Job-linked; history is kept forever.
-- * Participants: the customer, the provider's managers (individual, or the
--   company's admins) and the employee the company assigns to the job.
--   Platform staff cannot read chats through RLS (complaint access with an
--   audit trail comes in Prompt 10).
-- * Messages cannot be edited or deleted (they are the record of what was
--   discussed). Estimate and parts cards are messages that point to records.
-- * Phone numbers are shared only when BOTH sides consent; either side can
--   withdraw consent. WhatsApp is an optional convenience — approvals stay in
--   the platform.
-- =============================================================================

create type public.message_kind as enum ('text', 'photo', 'video', 'voice', 'estimate_card', 'parts_card', 'system');

-- Company assigns one of its employees to an engaged request.
alter table public.request_invitations add column assigned_member_id uuid references public.provider_profiles (id);

create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  request_id          uuid not null references public.service_requests (id),
  provider_profile_id uuid not null references public.provider_profiles (id),
  created_at          timestamptz not null default now(),
  last_message_at     timestamptz,
  unique (request_id, provider_profile_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  sender_id       uuid references public.profiles (id),         -- null for system messages
  sender_side     text not null check (sender_side in ('customer', 'provider', 'system')),
  kind            public.message_kind not null,
  body            text check (body is null or char_length(body) <= 4000),
  storage_path    text unique,
  mime_type       text,
  size_bytes      int check (size_bytes is null or size_bytes between 1 and 52428800),
  ref_id          uuid,                                          -- estimate / part request for cards
  client_id       uuid,                                          -- sender-generated id: safe retries
  created_at      timestamptz not null default now(),
  constraint text_has_body check (kind <> 'text' or (body is not null and char_length(btrim(body)) > 0)),
  constraint media_has_file check (kind not in ('photo', 'video', 'voice') or storage_path is not null),
  constraint cards_have_ref check (kind not in ('estimate_card', 'parts_card') or ref_id is not null),
  unique (sender_id, client_id)
);
create index messages_conversation on public.messages (conversation_id, created_at);
create trigger messages_no_update before update or delete on public.messages
  for each row execute function private.block_audit_mutation();

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id),
  user_id         uuid not null references public.profiles (id),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.contact_share_consents (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  side            text not null check (side in ('customer', 'provider')),
  user_id         uuid not null references public.profiles (id),
  granted_at      timestamptz not null default now(),
  revoked_at      timestamptz
);
create unique index contact_share_one_active on public.contact_share_consents (conversation_id, side) where revoked_at is null;

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id),
  kind        text not null check (kind ~ '^[a-z_]+$'),
  title       text not null check (char_length(title) <= 150),
  body        text check (body is null or char_length(body) <= 300),
  link        text check (link is null or link ~ '^/[A-Za-z0-9/_?=&#.-]*$'),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  push_sent_at timestamptz   -- for the future push sender (Edge Function)
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
              'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/3gpp'])
on conflict (id) do nothing;

-- Realtime for chat and notifications (RLS applies to subscribers).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.notifications;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Participants
-- -----------------------------------------------------------------------------

/** User ids who act for a provider profile: the person, or the company's admins. */
create function private.provider_manager_ids(p_profile uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select pp.user_id from public.provider_profiles pp
  where pp.id = p_profile and pp.kind in ('individual', 'company_member') and pp.user_id is not null and pp.archived_at is null
  union
  select r.user_id from public.provider_profiles pp
  join public.user_roles r on r.organization_id = pp.organization_id and r.role = 'company_admin' and r.revoked_at is null
  where pp.id = p_profile and pp.organization_id is not null;
$$;

/** The employee a company assigned to this request, if any. */
create function private.assigned_member_user(p_request uuid, p_provider uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.user_id from public.request_invitations i
  join public.provider_profiles m on m.id = i.assigned_member_id and m.archived_at is null
  where i.request_id = p_request and i.provider_profile_id = p_provider;
$$;

create function private.conversation_participant_ids(p_conv uuid)
returns setof uuid language sql stable security definer set search_path = '' as $$
  select r.customer_id from public.conversations c join public.service_requests r on r.id = c.request_id where c.id = p_conv
  union
  select private.provider_manager_ids(c.provider_profile_id) from public.conversations c where c.id = p_conv
  union
  select private.assigned_member_user(c.request_id, c.provider_profile_id) from public.conversations c where c.id = p_conv;
$$;

-- EXISTS, not IN: the participant list can contain NULL (no assigned employee),
-- and "x IN (…, NULL)" is NULL rather than false — which "not …" would let through.
create function private.is_conversation_participant(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from private.conversation_participant_ids(p_conv) p(id) where p.id = auth.uid());
$$;

create function private.conversation_side(p_conv uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.conversations c join public.service_requests r on r.id = c.request_id
                 where c.id = p_conv and r.customer_id = auth.uid()) then 'customer'
    when private.is_conversation_participant(p_conv) then 'provider'
  end;
$$;

/** Posting is allowed while the provider is still engaged and the job is open. */
create function private.conversation_open(p_conv uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    join public.service_requests r on r.id = c.request_id
    join public.request_invitations i on i.request_id = c.request_id and i.provider_profile_id = c.provider_profile_id
    where c.id = p_conv and i.status in ('invited', 'accepted') and r.status not in ('closed', 'cancelled')
  );
$$;

-- Assigned employees can also view the request itself.
create or replace function private.is_request_provider(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.request_invitations i
    where i.request_id = p_request and i.status <> 'withdrawn'
      and (private.can_manage_provider(i.provider_profile_id)
           or private.assigned_member_user(i.request_id, i.provider_profile_id) = auth.uid())
  );
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user, p_kind, left(p_title, 150), left(p_body, 300), p_link
  where p_user is not null and p_user is distinct from auth.uid();
$$;

create function private.system_message(p_conv uuid, p_text text)
returns void language sql security definer set search_path = '' as $$
  insert into public.messages (conversation_id, sender_side, kind, body) values (p_conv, 'system', 'system', p_text);
  update public.conversations set last_message_at = now() where id = p_conv;
$$;

-- Conversation + notifications when a provider is contacted / responds / is withdrawn.
create function private.on_invitation_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid; v_machine text; v_name text; v_customer uuid; v_u uuid;
begin
  select mt.name, r.customer_id into v_machine, v_customer
  from public.service_requests r join public.catalogue_entities mt on mt.id = r.machine_type_id where r.id = new.request_id;
  select display_name into v_name from public.provider_profiles where id = new.provider_profile_id;

  insert into public.conversations (request_id, provider_profile_id) values (new.request_id, new.provider_profile_id)
  on conflict (request_id, provider_profile_id) do nothing;
  select id into v_conv from public.conversations where request_id = new.request_id and provider_profile_id = new.provider_profile_id;

  if tg_op = 'INSERT' or (old.status is distinct from new.status) then
    if new.status = 'invited' then
      perform private.system_message(v_conv, format('The customer contacted %s about this request.', coalesce(v_name, 'the provider')));
      for v_u in select private.provider_manager_ids(new.provider_profile_id) loop
        perform private.notify(v_u, 'request_received', 'New request: ' || v_machine, 'A customer would like your help.', '/work/' || new.request_id);
      end loop;
    elsif new.status = 'accepted' then
      perform private.system_message(v_conv, format('%s accepted the request.', coalesce(v_name, 'The provider')));
      perform private.notify(v_customer, 'invitation_accepted', coalesce(v_name, 'A provider') || ' accepted your request', v_machine, '/requests/' || new.request_id);
    elsif new.status = 'declined' then
      perform private.system_message(v_conv, format('%s declined the request.', coalesce(v_name, 'The provider')));
      perform private.notify(v_customer, 'invitation_declined', coalesce(v_name, 'A provider') || ' declined your request', v_machine, '/requests/' || new.request_id);
    elsif new.status in ('withdrawn', 'closed') then
      perform private.system_message(v_conv, 'This conversation is closed.');
      for v_u in select private.provider_manager_ids(new.provider_profile_id) loop
        perform private.notify(v_u, 'request_closed', 'Request closed: ' || v_machine, null, '/work/' || new.request_id);
      end loop;
    end if;
  end if;
  if tg_op = 'UPDATE' and new.assigned_member_id is distinct from old.assigned_member_id and new.assigned_member_id is not null then
    perform private.notify((select user_id from public.provider_profiles where id = new.assigned_member_id),
      'job_assigned', 'You were assigned a job: ' || v_machine, null, '/work/' || new.request_id);
  end if;
  return new;
end $$;

create trigger request_invitations_chat after insert or update on public.request_invitations
  for each row execute function private.on_invitation_change();

-- Notify the other participants of a new message.
create function private.on_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_u uuid; v_request uuid; v_side text; v_link text; v_preview text;
begin
  if new.sender_side = 'system' then return new; end if;
  select c.request_id into v_request from public.conversations c where c.id = new.conversation_id;
  v_preview := case new.kind when 'text' then left(new.body, 120) when 'photo' then 'Sent a photo' when 'video' then 'Sent a video'
                 when 'voice' then 'Sent a voice note' when 'estimate_card' then 'Sent an estimate' when 'parts_card' then 'Shared a part' end;
  for v_u in select private.conversation_participant_ids(new.conversation_id) loop
    continue when v_u = new.sender_id;
    v_side := case when exists (select 1 from public.service_requests r where r.id = v_request and r.customer_id = v_u) then 'customer' else 'provider' end;
    v_link := case v_side when 'customer' then '/requests/' || v_request else '/work/' || v_request end || '?c=' || new.conversation_id;
    -- one unread "new messages" notification per conversation at a time
    if not exists (select 1 from public.notifications n where n.user_id = v_u and n.read_at is null and n.kind = 'new_message' and n.link = v_link) then
      perform private.notify(v_u, 'new_message', 'New message', v_preview, v_link);
    end if;
  end loop;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function private.on_message_insert();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.conversations          enable row level security;
alter table public.messages               enable row level security;
alter table public.conversation_reads     enable row level security;
alter table public.contact_share_consents enable row level security;
alter table public.notifications          enable row level security;

revoke all on public.conversations, public.messages, public.conversation_reads, public.contact_share_consents,
  public.notifications from anon, authenticated;
grant select on public.conversations, public.messages, public.conversation_reads, public.contact_share_consents,
  public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy conversations_read on public.conversations for select to authenticated
  using (private.is_conversation_participant(id));
create policy messages_read on public.messages for select to authenticated
  using (private.is_conversation_participant(conversation_id));
create policy conversation_reads_read on public.conversation_reads for select to authenticated
  using (private.is_conversation_participant(conversation_id));
create policy contact_share_read on public.contact_share_consents for select to authenticated
  using (private.is_conversation_participant(conversation_id));
create policy notifications_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy chat_media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
              and private.is_conversation_participant(private.try_uuid((storage.foldername(name))[1]))
              and private.conversation_open(private.try_uuid((storage.foldername(name))[1]))
              and private.is_active_user());
create policy chat_media_read on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and private.is_conversation_participant(private.try_uuid((storage.foldername(name))[1])));

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------
create function public.send_message(
  p_conversation uuid, p_kind public.message_kind, p_body text default null, p_storage_path text default null,
  p_mime_type text default null, p_size_bytes int default null, p_client_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_side text;
begin
  perform private.require_active_user();
  v_side := private.conversation_side(p_conversation);
  if v_side is null then
    raise exception using errcode = '42501', message = 'not a participant in this conversation';
  end if;
  if p_kind not in ('text', 'photo', 'video', 'voice') then
    raise exception 'ITM:kind_not_allowed: Estimates and parts are sent from their own forms';
  end if;
  -- idempotent retry: same client id returns the original message
  if p_client_id is not null then
    select id into v_id from public.messages where sender_id = auth.uid() and client_id = p_client_id;
    if v_id is not null then return v_id; end if;
  end if;
  if not private.conversation_open(p_conversation) then
    raise exception 'ITM:conversation_closed: This conversation is closed. You can still read it.';
  end if;
  if (select count(*) from public.messages m where m.sender_id = auth.uid() and m.created_at > now() - interval '1 minute') >= 30 then
    raise exception 'ITM:message_rate: You are sending messages too quickly. Please wait a moment.';
  end if;
  if p_kind in ('photo', 'video', 'voice') then
    if p_storage_path is null or split_part(p_storage_path, '/', 1) <> p_conversation::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'chat-media' and o.name = p_storage_path) then
      raise exception 'ITM:file_missing: Upload the file first';
    end if;
    if not (
      (p_kind = 'photo' and p_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic'))
      or (p_kind = 'video' and p_mime_type in ('video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'))
      or (p_kind = 'voice' and p_mime_type in ('audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/3gpp'))
    ) then
      raise exception 'ITM:media_type: That file type is not supported';
    end if;
  end if;
  insert into public.messages (conversation_id, sender_id, sender_side, kind, body, storage_path, mime_type, size_bytes, client_id)
  values (p_conversation, auth.uid(), v_side, p_kind, nullif(btrim(p_body), ''), p_storage_path, p_mime_type, p_size_bytes, p_client_id)
  returning id into v_id;
  update public.conversations set last_message_at = now() where id = p_conversation;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  return v_id;
end $$;

create function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text;
begin
  if not private.is_conversation_participant(p_conversation) then
    raise exception using errcode = '42501', message = 'not a participant in this conversation';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at) values (p_conversation, auth.uid(), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
  v_side := private.conversation_side(p_conversation);
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and kind = 'new_message' and link like '%?c=' || p_conversation::text;
end $$;

/** Company admin assigns one of its current employees to an engaged request. */
create function public.assign_company_member(p_invitation uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.request_invitations; c public.provider_profiles;
begin
  perform private.require_active_user();
  select * into i from public.request_invitations where id = p_invitation for update;
  select * into c from public.provider_profiles where id = i.provider_profile_id;
  if c.kind is distinct from 'company' or not private.has_role('company_admin', c.organization_id) then
    raise exception using errcode = '42501', message = 'only the company admin can assign employees';
  end if;
  if i.status <> 'accepted' then
    raise exception 'ITM:not_engaged: Accept the request before assigning an employee';
  end if;
  if p_member is not null and not exists (
    select 1 from public.provider_profiles m where m.id = p_member and m.kind = 'company_member'
      and m.organization_id = c.organization_id and m.archived_at is null and m.status = 'approved'
  ) then
    raise exception 'ITM:member_invalid: Choose an approved employee of your company';
  end if;
  update public.request_invitations set assigned_member_id = p_member where id = p_invitation;
  perform private.system_message((select id from public.conversations where request_id = i.request_id and provider_profile_id = i.provider_profile_id),
    case when p_member is null then 'The company removed the assigned technician.'
         else format('%s will handle this job for %s.', (select display_name from public.provider_profiles where id = p_member), c.display_name) end);
  perform private.audit('request.member_assigned', 'service_request', i.request_id::text, jsonb_build_object('member', p_member));
end $$;

/** Give or withdraw consent to share phone numbers in this conversation. */
create function public.set_contact_sharing(p_conversation uuid, p_consent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_side text;
begin
  perform private.require_active_user();
  v_side := private.conversation_side(p_conversation);
  if v_side is null then
    raise exception using errcode = '42501', message = 'not a participant in this conversation';
  end if;
  if p_consent then
    if not private.conversation_open(p_conversation) then
      raise exception 'ITM:conversation_closed: This conversation is closed';
    end if;
    insert into public.contact_share_consents (conversation_id, side, user_id) values (p_conversation, v_side, auth.uid())
    on conflict do nothing;
    perform private.system_message(p_conversation, case v_side when 'customer' then 'The customer agreed to share phone numbers.'
                                                             else 'The provider agreed to share phone numbers.' end);
  else
    update public.contact_share_consents set revoked_at = now()
    where conversation_id = p_conversation and side = v_side and revoked_at is null;
    perform private.system_message(p_conversation, 'Phone number sharing was turned off.');
  end if;
  perform private.audit(case when p_consent then 'chat.contact_consent_given' else 'chat.contact_consent_withdrawn' end,
    'conversation', p_conversation::text, jsonb_build_object('side', v_side));
end $$;

/**
 * Phone numbers for WhatsApp/phone hand-off — only when BOTH sides currently
 * consent and the conversation is open. Provider number: the individual's own
 * number, or the company's business phone.
 */
create function public.get_conversation_contacts(p_conversation uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_customer int; v_provider int; c public.conversations;
begin
  if not private.is_conversation_participant(p_conversation) then
    raise exception using errcode = '42501', message = 'not a participant in this conversation';
  end if;
  select count(*) filter (where side = 'customer'), count(*) filter (where side = 'provider')
  into v_customer, v_provider
  from public.contact_share_consents where conversation_id = p_conversation and revoked_at is null;
  select * into c from public.conversations where id = p_conversation;
  return jsonb_build_object(
    'customer_consented', v_customer > 0,
    'provider_consented', v_provider > 0,
    'shared', v_customer > 0 and v_provider > 0 and private.conversation_open(p_conversation),
    'customer_phone', case when v_customer > 0 and v_provider > 0 and private.conversation_open(p_conversation)
      then (select p.phone from public.service_requests r join public.profiles p on p.id = r.customer_id where r.id = c.request_id) end,
    'provider_phone', case when v_customer > 0 and v_provider > 0 and private.conversation_open(p_conversation)
      then (select coalesce(pp.business_phone, u.phone) from public.provider_profiles pp
            left join public.profiles u on u.id = pp.user_id where pp.id = c.provider_profile_id) end
  );
end $$;

/** Conversations visible to me, with unread counts. */
create function public.list_my_conversations()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'last_message_at' desc nulls last), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id, 'request_id', c.request_id, 'reference', r.reference, 'machine_type', mt.name,
      'provider_id', c.provider_profile_id, 'provider_name', pp.display_name,
      'my_side', private.conversation_side(c.id), 'open', private.conversation_open(c.id),
      'last_message_at', c.last_message_at,
      'unread', (select count(*) from public.messages m where m.conversation_id = c.id
                   and (m.sender_id is distinct from auth.uid())
                   and m.created_at > coalesce((select cr.last_read_at from public.conversation_reads cr
                                               where cr.conversation_id = c.id and cr.user_id = auth.uid()), 'epoch'::timestamptz))
    ) as x
    from public.conversations c
    join public.service_requests r on r.id = c.request_id
    join public.catalogue_entities mt on mt.id = r.machine_type_id
    join public.provider_profiles pp on pp.id = c.provider_profile_id
    where private.is_conversation_participant(c.id)
  ) t;
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
  private.can_view_request(uuid),
  private.is_conversation_participant(uuid),
  private.conversation_open(uuid)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
