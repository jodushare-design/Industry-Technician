-- =============================================================================
-- Foundation: profiles, roles, organizations, legal documents, terms
-- acceptance, audit log.
--
-- Principles (docs/discovery-report.md §5–6, docs/risk-control-design.md):
--   * RLS on every table, default deny.
--   * Writes that carry business meaning go through SECURITY DEFINER
--     functions that check auth.uid(); direct table writes are revoked.
--   * Nothing here deletes evidence: profiles cannot be hard-deleted through
--     the API, audit_log is append-only for every role.
--   * Business-rule errors are raised as  'ITM:<rule>: <user message>'.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.app_role as enum (
  'customer',
  'technician',
  'company_admin',
  'company_technician',
  'support_agent',
  'platform_admin'
);

create type public.account_status as enum ('active', 'suspended', 'closed');

create type public.legal_review_status as enum (
  'not_started', 'in_review', 'changes_requested', 'approved', 'withdrawn'
);

-- -----------------------------------------------------------------------------
-- Shared trigger: updated_at
-- -----------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Profiles (one per auth user)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete restrict,
  full_name          text check (full_name is null or char_length(full_name) between 2 and 100),
  phone              text unique check (phone is null or phone ~ '^\+91[6-9][0-9]{9}$'),
  email              text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  preferred_language text not null default 'en' check (preferred_language in ('en', 'te', 'hi', 'ur')),
  account_status     public.account_status not null default 'active',
  status_reason      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.profiles is
  'Private account data. Public provider profiles are a separate table (Prompt 5).';

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Organizations (service companies)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 200),
  kind           text not null default 'service_company' check (kind = 'service_company'),
  account_status public.account_status not null default 'active',
  created_by     uuid not null references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Role grants. A user may hold several roles; org-scoped roles carry an
-- organization_id. Revoking sets revoked_at (history is kept).
-- -----------------------------------------------------------------------------
create table public.user_roles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id),
  role               public.app_role not null,
  organization_id    uuid references public.organizations (id),
  -- company_technician only: may this employee send estimates for the company?
  can_send_estimates boolean not null default false,
  granted_by         uuid references public.profiles (id),
  granted_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  constraint org_scope check (
    (role in ('company_admin', 'company_technician')) = (organization_id is not null)
  ),
  constraint send_flag_only_for_employees check (
    not can_send_estimates or role = 'company_technician'
  )
);

create unique index user_roles_one_active
  on public.user_roles (user_id, role, coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index user_roles_org on public.user_roles (organization_id) where revoked_at is null;

-- -----------------------------------------------------------------------------
-- Legal documents and acceptance (risk-control §1)
-- -----------------------------------------------------------------------------
create table public.legal_documents (
  id               uuid primary key default gen_random_uuid(),
  code             text not null check (code ~ '^[a-z][a-z0-9_]{2,60}$'),
  version          text not null check (char_length(version) between 1 and 20),
  title            text not null,
  body_url         text,
  body_sha256      text check (body_sha256 is null or body_sha256 ~ '^[0-9a-f]{64}$'),
  review_status    public.legal_review_status not null default 'not_started',
  required_for     public.app_role[] not null default '{}',
  effective_from   timestamptz,
  created_at       timestamptz not null default now(),
  unique (code, version)
);

create table public.terms_acceptances (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles (id),
  legal_document_id    uuid not null references public.legal_documents (id),
  review_status_at_acceptance public.legal_review_status not null,
  channel              text not null check (channel in ('web', 'android', 'admin')),
  app_version          text check (app_version is null or char_length(app_version) <= 40),
  accepted_at          timestamptz not null default now(),
  unique (user_id, legal_document_id)
);

-- -----------------------------------------------------------------------------
-- Audit log — append-only for every role (risk-control §12)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid,
  action      text not null check (action ~ '^[a-z_]+\.[a-z_.]+$'),
  entity_type text not null,
  entity_id   text,
  details     jsonb not null default '{}'::jsonb
);
create index audit_log_entity on public.audit_log (entity_type, entity_id);
create index audit_log_actor on public.audit_log (actor_id, occurred_at desc);

create function private.audit(p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create function private.block_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'ITM:audit_append_only: Audit records cannot be changed or deleted';
end $$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.block_audit_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.block_audit_mutation();

-- -----------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so RLS policies can call them without
-- recursion). Stable; safe to use in policies.
-- -----------------------------------------------------------------------------
create function private.has_role(p_role public.app_role, p_org uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid()
      and r.role = p_role
      and r.revoked_at is null
      and (p_org is null or r.organization_id = p_org)
  );
$$;

create function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_status = 'active');
$$;

create function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('platform_admin') or private.has_role('support_agent');
$$;

create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_role('platform_admin');
$$;

create function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.organization_id = p_org and r.revoked_at is null
  );
$$;

create function private.require_active_user() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not authenticated';
  end if;
  if not private.is_active_user() then
    raise exception 'ITM:account_not_active: Your account is not active. Contact support.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- New auth user → profile
-- -----------------------------------------------------------------------------
create function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, phone)
  values (
    new.id,
    case
      when new.phone ~ '^\+?91[6-9][0-9]{9}$' then '+' || ltrim(new.phone, '+')
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- Guard: users may edit their own name/email/language only.
-- Status, phone and id changes need staff (status) or Auth (phone).
-- -----------------------------------------------------------------------------
create function private.guard_profile_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id <> old.id then
    raise exception 'ITM:immutable_field: Profile id cannot change';
  end if;
  if (new.account_status, new.status_reason) is distinct from (old.account_status, old.status_reason)
     and auth.uid() is not null and not private.is_platform_admin() then
    raise exception 'ITM:status_change_forbidden: Only platform administrators can change account status';
  end if;
  if new.phone is distinct from old.phone and auth.uid() is not null then
    raise exception 'ITM:phone_via_auth: Change your mobile number through sign-in verification';
  end if;
  if new.account_status is distinct from old.account_status then
    perform private.audit('profile.status_changed', 'profile', new.id::text,
      jsonb_build_object('from', old.account_status, 'to', new.account_status, 'reason', new.status_reason));
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.organizations     enable row level security;
alter table public.user_roles        enable row level security;
alter table public.legal_documents   enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.audit_log         enable row level security;

-- Table privileges: start from nothing, grant only what policies need.
revoke all on public.profiles, public.organizations, public.user_roles,
  public.legal_documents, public.terms_acceptances, public.audit_log
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name, email, preferred_language) on public.profiles to authenticated;
grant update (account_status, status_reason) on public.profiles to authenticated; -- guarded by trigger: admins only

grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select on public.user_roles to authenticated;
grant select on public.legal_documents to anon, authenticated;
grant select on public.terms_acceptances to authenticated;
grant select on public.audit_log to authenticated;

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_staff on public.profiles
  for select to authenticated using (private.is_staff());
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() and private.is_active_user())
  with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

-- organizations
create policy organizations_select_member on public.organizations
  for select to authenticated using (private.is_org_member(id) or private.is_staff());
create policy organizations_update_company_admin on public.organizations
  for update to authenticated
  using (private.has_role('company_admin', id) and private.is_active_user())
  with check (private.has_role('company_admin', id));

-- user_roles: see your own; company admins see their org; staff see all
create policy user_roles_select_own on public.user_roles
  for select to authenticated using (user_id = auth.uid());
create policy user_roles_select_company_admin on public.user_roles
  for select to authenticated
  using (organization_id is not null and private.has_role('company_admin', organization_id));
create policy user_roles_select_staff on public.user_roles
  for select to authenticated using (private.is_staff());

-- legal_documents: readable by everyone unless withdrawn; staff see all
create policy legal_documents_select_public on public.legal_documents
  for select to anon, authenticated using (review_status <> 'withdrawn');
create policy legal_documents_select_staff on public.legal_documents
  for select to authenticated using (private.is_staff());

-- terms_acceptances
create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated using (user_id = auth.uid());
create policy terms_acceptances_select_staff on public.terms_acceptances
  for select to authenticated using (private.is_staff());

-- audit_log: platform admins read; nobody writes directly
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (private.is_platform_admin());

-- -----------------------------------------------------------------------------
-- RPC: write paths
-- -----------------------------------------------------------------------------

-- Self-service roles: only customer and technician may be self-granted.
create function public.register_role(p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if p_role not in ('customer', 'technician') then
    raise exception 'ITM:role_not_self_service: That role cannot be chosen at sign-up';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), p_role, auth.uid())
  on conflict do nothing;
  perform private.audit('role.registered', 'profile', auth.uid()::text, jsonb_build_object('role', p_role));
end $$;

-- Create a service company; the creator becomes its company_admin.
create function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform private.require_active_user();
  insert into public.organizations (name, created_by) values (trim(p_name), auth.uid())
  returning id into v_org;
  insert into public.user_roles (user_id, role, organization_id, granted_by)
  values (auth.uid(), 'company_admin', v_org, auth.uid());
  perform private.audit('organization.created', 'organization', v_org::text, jsonb_build_object('name', trim(p_name)));
  return v_org;
end $$;

-- Staff roles are granted only by a platform admin (the first admin is
-- bootstrapped with SQL by the operator — see docs/setup.md).
create function public.grant_staff_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins can grant staff roles';
  end if;
  if p_role not in ('support_agent', 'platform_admin') then
    raise exception 'ITM:not_staff_role: Only staff roles can be granted here';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid())
  on conflict do nothing;
  perform private.audit('role.staff_granted', 'profile', p_user::text, jsonb_build_object('role', p_role));
end $$;

create function public.revoke_role(p_role_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.user_roles;
begin
  perform private.require_active_user();
  select * into r from public.user_roles where id = p_role_id and revoked_at is null;
  if not found then
    raise exception 'ITM:role_not_found: That role is not active';
  end if;
  if not (
    private.is_platform_admin()
    or (r.organization_id is not null and private.has_role('company_admin', r.organization_id)
        and r.user_id <> auth.uid())
    or (r.user_id = auth.uid() and r.role in ('customer', 'technician'))
  ) then
    raise exception using errcode = '42501', message = 'not allowed to revoke this role';
  end if;
  update public.user_roles set revoked_at = now() where id = p_role_id;
  perform private.audit('role.revoked', 'user_role', p_role_id::text,
    jsonb_build_object('user_id', r.user_id, 'role', r.role, 'organization_id', r.organization_id));
end $$;

-- Record acceptance of a legal document. Stores the document's review status
-- at the time, so draft acceptances (dev/pilot) are distinguishable later.
create function public.accept_legal_document(p_document_id uuid, p_channel text, p_app_version text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.legal_documents;
begin
  perform private.require_active_user();
  select * into d from public.legal_documents where id = p_document_id;
  if not found or d.review_status = 'withdrawn' then
    raise exception 'ITM:document_unavailable: This document is no longer available';
  end if;
  insert into public.terms_acceptances (user_id, legal_document_id, review_status_at_acceptance, channel, app_version)
  values (auth.uid(), d.id, d.review_status, p_channel, p_app_version)
  on conflict (user_id, legal_document_id) do nothing;
  perform private.audit('legal.accepted', 'legal_document', d.id::text,
    jsonb_build_object('code', d.code, 'version', d.version, 'review_status', d.review_status, 'channel', p_channel));
end $$;

-- Read model for the apps: who am I, what can I do, what must I accept.
create function public.get_my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'profile', (select to_jsonb(p) - 'status_reason' from public.profiles p where p.id = auth.uid()),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'role', r.role, 'organization_id', r.organization_id,
        'can_send_estimates', r.can_send_estimates) order by r.granted_at)
      from public.user_roles r where r.user_id = auth.uid() and r.revoked_at is null), '[]'::jsonb),
    'pending_documents', coalesce((
      -- latest version of each document required for any of my roles, not yet accepted
      select jsonb_agg(jsonb_build_object('id', d.id, 'code', d.code, 'version', d.version, 'title', d.title,
                                          'review_status', d.review_status, 'body_url', d.body_url))
      from (
        select distinct on (ld.code) ld.*
        from public.legal_documents ld
        where ld.review_status <> 'withdrawn'
          and (ld.effective_from is null or ld.effective_from <= now())
        order by ld.code, ld.effective_from desc nulls last, ld.created_at desc
      ) d
      where exists (
        select 1 from public.user_roles r
        where r.user_id = auth.uid() and r.revoked_at is null and r.role = any (d.required_for)
      )
      and not exists (
        select 1 from public.terms_acceptances t where t.user_id = auth.uid() and t.legal_document_id = d.id
      )), '[]'::jsonb)
  ) end;
$$;

-- Function privileges: nothing callable by anon except what is listed.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.register_role(public.app_role),
  public.create_organization(text),
  public.grant_staff_role(uuid, public.app_role),
  public.revoke_role(uuid),
  public.accept_legal_document(uuid, text, text),
  public.get_my_context()
to authenticated;
-- Policies call these helpers as the invoking role:
grant execute on function
  private.has_role(public.app_role, uuid),
  private.is_active_user(),
  private.is_staff(),
  private.is_platform_admin(),
  private.is_org_member(uuid)
to authenticated;
