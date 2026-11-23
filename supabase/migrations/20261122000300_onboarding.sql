-- =============================================================================
-- Onboarding (Prompt 5): customers (factories, machines), independent
-- technicians, service companies and their employees, documents and
-- verification.
--
-- Rules (docs/onboarding.md, business-model.md §6):
--   * Experience is stored per person per catalogue item. A company's skills
--     are never copied to employees automatically — only by an explicit,
--     per-skill action.
--   * Verification is a set of separate, dated checks (identity, business,
--     certificate, licence, insurance). No single "verified" flag; nothing
--     says "certified" unless a certificate check passed and is in date.
--   * Private documents (identity, business, certificates…) are readable only
--     by the provider's own managers and platform staff — never by customers.
--     A company admin cannot read an employee's identity document.
--   * Only platform admins approve, reject or suspend providers.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.provider_kind as enum ('individual', 'company', 'company_member');
create type public.provider_status as enum ('draft', 'submitted', 'approved', 'rejected', 'suspended');
create type public.skill_level as enum ('basic', 'experienced', 'expert');
create type public.availability_status as enum ('available', 'limited', 'unavailable');
create type public.provider_document_type as enum (
  'identity', 'business_registration', 'gst_certificate', 'certificate', 'licence', 'insurance', 'work_photo'
);
create type public.document_review_status as enum ('pending', 'accepted', 'rejected');
create type public.verification_kind as enum ('identity', 'business', 'certificate', 'licence', 'insurance');

create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- -----------------------------------------------------------------------------
-- Customers: factories and machines
-- -----------------------------------------------------------------------------
create table public.factories (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id),
  name         text not null check (char_length(btrim(name)) between 2 and 200),
  address_line text check (address_line is null or char_length(address_line) <= 300),
  locality     text not null check (char_length(btrim(locality)) between 2 and 100),
  district     text check (district is null or char_length(district) <= 60),
  city         text not null default 'Hyderabad' check (char_length(city) between 2 and 60),
  state        text not null default 'Telangana' check (char_length(state) between 2 and 60),
  pincode      text check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  latitude     numeric(9, 6) check (latitude is null or latitude between 6 and 38),
  longitude    numeric(9, 6) check (longitude is null or longitude between 68 and 98),
  gstin        text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint factory_coordinates_pair check ((latitude is null) = (longitude is null))
);
create index factories_owner on public.factories (owner_id);
create trigger factories_touch before update on public.factories
  for each row execute function private.touch_updated_at();

create table public.customer_machines (
  id               uuid primary key default gen_random_uuid(),
  factory_id       uuid not null references public.factories (id),
  owner_id         uuid not null default auth.uid() references public.profiles (id),
  machine_type_id  uuid not null references public.catalogue_entities (id),
  manufacturer_id  uuid references public.catalogue_entities (id),
  model_id         uuid references public.catalogue_entities (id),
  manufacturer_text text check (manufacturer_text is null or char_length(manufacturer_text) <= 200),
  model_text       text check (model_text is null or char_length(model_text) <= 200),
  label            text check (label is null or char_length(label) <= 100),
  year_installed   int check (year_installed is null or year_installed between 1950 and 2100),
  serial_number    text check (serial_number is null or char_length(serial_number) <= 100),
  notes            text check (notes is null or char_length(notes) <= 1000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index customer_machines_factory on public.customer_machines (factory_id);
create trigger customer_machines_touch before update on public.customer_machines
  for each row execute function private.touch_updated_at();

create function private.check_catalogue_ref(p_id uuid, p_kind public.catalogue_kind, p_label text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_id is null then return; end if;
  if not exists (select 1 from public.catalogue_entities e where e.id = p_id and e.kind = p_kind and e.status = 'approved') then
    raise exception 'ITM:catalogue_ref_invalid: Choose an approved % from the catalogue', p_label;
  end if;
end $$;

create function private.guard_customer_machine() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.factories f where f.id = new.factory_id and f.owner_id = new.owner_id) then
    raise exception 'ITM:factory_not_yours: Add machines to your own factory';
  end if;
  if tg_op = 'INSERT' or new.machine_type_id is distinct from old.machine_type_id then
    perform private.check_catalogue_ref(new.machine_type_id, 'machine_type', 'machine type');
  end if;
  if tg_op = 'INSERT' or new.manufacturer_id is distinct from old.manufacturer_id then
    perform private.check_catalogue_ref(new.manufacturer_id, 'manufacturer', 'manufacturer');
  end if;
  if tg_op = 'INSERT' or new.model_id is distinct from old.model_id then
    perform private.check_catalogue_ref(new.model_id, 'model', 'model');
    if new.model_id is not null and new.manufacturer_id is not null and not exists (
      select 1 from public.catalogue_entities m where m.id = new.model_id and m.scope_id = new.manufacturer_id
    ) then
      raise exception 'ITM:model_maker_mismatch: That model is not made by the chosen manufacturer';
    end if;
  end if;
  return new;
end $$;

create trigger customer_machines_guard before insert or update on public.customer_machines
  for each row execute function private.guard_customer_machine();

-- -----------------------------------------------------------------------------
-- Providers
-- -----------------------------------------------------------------------------
create table public.provider_profiles (
  id                 uuid primary key default gen_random_uuid(),
  kind               public.provider_kind not null,
  user_id            uuid references public.profiles (id),
  organization_id    uuid references public.organizations (id),
  display_name       text check (display_name is null or char_length(btrim(display_name)) between 2 and 120),
  bio                text check (bio is null or char_length(bio) <= 1000),
  years_experience   int check (years_experience is null or years_experience between 0 and 60),
  languages          text[] not null default '{}'
                     check (languages <@ array['en', 'te', 'hi', 'ur', 'ta', 'kn', 'mr', 'bn', 'or', 'ml']),
  availability       public.availability_status not null default 'available',
  availability_note  text check (availability_note is null or char_length(availability_note) <= 200),
  base_locality      text check (base_locality is null or char_length(base_locality) <= 100),
  base_district      text check (base_district is null or char_length(base_district) <= 60),
  base_latitude      numeric(9, 6) check (base_latitude is null or base_latitude between 6 and 38),
  base_longitude     numeric(9, 6) check (base_longitude is null or base_longitude between 68 and 98),
  service_radius_km  int not null default 25 check (service_radius_km between 1 and 500),
  service_districts  text[] not null default '{}' check (cardinality(service_districts) <= 40),
  business_phone     text check (business_phone is null or business_phone ~ '^\+91[6-9][0-9]{9}$'),
  business_email     text check (business_email is null or business_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  business_address   text check (business_address is null or char_length(business_address) <= 300),
  business_pincode   text check (business_pincode is null or business_pincode ~ '^[1-9][0-9]{5}$'),
  gstin              text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  registration_number text check (registration_number is null or char_length(registration_number) <= 60),
  status             public.provider_status not null default 'draft',
  status_reason      text check (status_reason is null or char_length(status_reason) <= 500),
  submitted_at       timestamptz,
  reviewed_by        uuid references public.profiles (id),
  reviewed_at        timestamptz,
  archived_at        timestamptz,  -- company_member whose membership ended
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint provider_kind_shape check (
    (kind = 'individual'     and user_id is not null and organization_id is null) or
    (kind = 'company'        and user_id is null     and organization_id is not null) or
    (kind = 'company_member' and user_id is not null and organization_id is not null)
  ),
  constraint business_fields_company_only check (
    kind = 'company' or (business_phone is null and business_email is null and business_address is null
                         and business_pincode is null and gstin is null and registration_number is null)
  ),
  constraint base_coordinates_pair check ((base_latitude is null) = (base_longitude is null))
);
create unique index provider_profiles_one_individual on public.provider_profiles (user_id) where kind = 'individual';
create unique index provider_profiles_one_company on public.provider_profiles (organization_id) where kind = 'company';
create unique index provider_profiles_one_member on public.provider_profiles (user_id, organization_id) where kind = 'company_member';
create index provider_profiles_status on public.provider_profiles (status);
create trigger provider_profiles_touch before update on public.provider_profiles
  for each row execute function private.touch_updated_at();

create table public.provider_skills (
  id                   uuid primary key default gen_random_uuid(),
  provider_profile_id  uuid not null references public.provider_profiles (id) on delete cascade,
  catalogue_entity_id  uuid not null references public.catalogue_entities (id),
  years_experience     int not null default 0 check (years_experience between 0 and 60),
  level                public.skill_level not null default 'experienced',
  notes                text check (notes is null or char_length(notes) <= 500),
  copied_from_skill_id uuid references public.provider_skills (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider_profile_id, catalogue_entity_id)
);
create index provider_skills_entity on public.provider_skills (catalogue_entity_id);
create trigger provider_skills_touch before update on public.provider_skills
  for each row execute function private.touch_updated_at();

create table public.provider_make_model_experience (
  id                uuid primary key default gen_random_uuid(),
  provider_skill_id uuid not null references public.provider_skills (id) on delete cascade,
  manufacturer_id   uuid references public.catalogue_entities (id),
  model_id          uuid references public.catalogue_entities (id),
  manufacturer_text text check (manufacturer_text is null or char_length(manufacturer_text) <= 200),
  model_text        text check (model_text is null or char_length(model_text) <= 200),
  years_experience  int check (years_experience is null or years_experience between 0 and 60),
  created_at        timestamptz not null default now(),
  constraint make_or_model_given check (
    coalesce(manufacturer_id::text, manufacturer_text, model_id::text, model_text) is not null
  )
);
create index provider_make_model_skill on public.provider_make_model_experience (provider_skill_id);

create function private.guard_provider_skill() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.catalogue_entities e
    where e.id = new.catalogue_entity_id and e.status = 'approved'
      and e.kind in ('machine_type', 'equipment_category', 'service_skill')
  ) then
    raise exception 'ITM:skill_ref_invalid: Choose an approved machine type, equipment category or service skill';
  end if;
  return new;
end $$;
create trigger provider_skills_guard before insert or update of catalogue_entity_id on public.provider_skills
  for each row execute function private.guard_provider_skill();

create function private.guard_make_model() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
    where s.id = new.provider_skill_id and e.kind = 'machine_type'
  ) then
    raise exception 'ITM:make_model_needs_machine: Add make and model experience to a machine type skill';
  end if;
  perform private.check_catalogue_ref(new.manufacturer_id, 'manufacturer', 'manufacturer');
  perform private.check_catalogue_ref(new.model_id, 'model', 'model');
  if new.model_id is not null and new.manufacturer_id is not null and not exists (
    select 1 from public.catalogue_entities m where m.id = new.model_id and m.scope_id = new.manufacturer_id
  ) then
    raise exception 'ITM:model_maker_mismatch: That model is not made by the chosen manufacturer';
  end if;
  return new;
end $$;
create trigger provider_make_model_guard before insert or update on public.provider_make_model_experience
  for each row execute function private.guard_make_model();

-- -----------------------------------------------------------------------------
-- Company invitations (employee joins by accepting with their own verified number)
-- -----------------------------------------------------------------------------
create table public.organization_invites (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id),
  phone            text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  display_name     text check (display_name is null or char_length(btrim(display_name)) between 2 and 120),
  invited_by       uuid not null references public.profiles (id),
  created_at       timestamptz not null default now(),
  accepted_at      timestamptz,
  accepted_user_id uuid references public.profiles (id),
  revoked_at       timestamptz
);
create unique index organization_invites_one_open on public.organization_invites (organization_id, phone)
  where accepted_at is null and revoked_at is null;

-- -----------------------------------------------------------------------------
-- Documents and verification
-- -----------------------------------------------------------------------------
create table public.provider_documents (
  id                  uuid primary key default gen_random_uuid(),
  provider_profile_id uuid not null references public.provider_profiles (id),
  doc_type            public.provider_document_type not null,
  title               text not null check (char_length(btrim(title)) between 2 and 150),
  issuer              text check (issuer is null or char_length(issuer) <= 150),
  valid_until         date,
  storage_path        text not null unique,
  mime_type           text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes          int not null check (size_bytes between 1 and 10485760),
  uploaded_by         uuid not null default auth.uid() references public.profiles (id),
  review_status       public.document_review_status not null default 'pending',
  review_note         text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by         uuid references public.profiles (id),
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  constraint work_photos_are_images check (doc_type <> 'work_photo' or mime_type like 'image/%')
);
create index provider_documents_profile on public.provider_documents (provider_profile_id);

create table public.verification_checks (
  id                  uuid primary key default gen_random_uuid(),
  provider_profile_id uuid not null references public.provider_profiles (id),
  kind                public.verification_kind not null,
  passed              boolean not null,
  label               text check (label is null or char_length(label) between 2 and 150),
  valid_until         date,
  document_id         uuid references public.provider_documents (id),
  note                text check (note is null or char_length(note) <= 500),
  reviewed_by         uuid not null references public.profiles (id),
  reviewed_at         timestamptz not null default now(),
  revoked_at          timestamptz,
  revoked_by          uuid references public.profiles (id),
  revoke_reason       text check (revoke_reason is null or char_length(revoke_reason) <= 500),
  constraint labelled_kinds check (kind not in ('certificate', 'licence', 'insurance') or label is not null)
);
create index verification_checks_profile on public.verification_checks (provider_profile_id);

-- Storage bucket for provider documents and work photos (private; signed URLs only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-documents', 'provider-documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------

/** Can the signed-in user edit this provider profile? (the person themself, or the company's admin) */
create function private.can_manage_provider(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_profiles pp
    where pp.id = p_profile and (
      (pp.kind in ('individual', 'company_member') and pp.user_id = auth.uid() and pp.archived_at is null)
      or (pp.organization_id is not null and private.has_role('company_admin', pp.organization_id))
    )
  );
$$;

/** Can the signed-in user read this document's file? Identity documents: only the person and staff. */
create function private.can_read_provider_document(p_doc uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_documents d join public.provider_profiles pp on pp.id = d.provider_profile_id
    where d.id = p_doc and (
      private.is_staff()
      or (d.doc_type = 'identity' and pp.user_id = auth.uid())
      or (d.doc_type <> 'identity' and private.can_manage_provider(pp.id))
    )
  );
$$;

/**
 * Storage read rule for a file path. Runs as owner so the "is this file
 * registered?" lookup is not itself filtered by RLS (which would make an
 * employee's identity document look unregistered to their company admin).
 */
create function private.can_read_storage_path(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_doc uuid;
begin
  if private.is_staff() then return true; end if;
  select id into v_doc from public.provider_documents where storage_path = p_path;
  if v_doc is not null then
    return private.can_read_provider_document(v_doc);
  end if;
  -- uploaded but not registered yet: the uploader, if they manage that folder
  return private.can_manage_provider(private.try_uuid(split_part(p_path, '/', 1)))
    and exists (select 1 from storage.objects o where o.bucket_id = 'provider-documents' and o.name = p_path and o.owner = auth.uid());
end $$;

/** Public work photo: accepted, and the provider is approved. Readable by anyone. */
create function private.is_public_work_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.provider_documents d join public.provider_profiles pp on pp.id = d.provider_profile_id
    where d.storage_path = p_path and d.doc_type = 'work_photo' and d.review_status = 'accepted'
      and pp.status = 'approved' and pp.archived_at is null
  );
$$;

-- -----------------------------------------------------------------------------
-- Guards on provider profile edits
-- -----------------------------------------------------------------------------
create function private.log_provider_resubmit(p_profile uuid) returns void
language sql security definer set search_path = '' as $$
  select private.audit('provider.resubmitted_on_change', 'provider_profile', p_profile::text, '{}'::jsonb);
$$;

-- Runs as the invoking role (not SECURITY DEFINER) so it can tell direct
-- table edits (current_user = authenticated) from the controlled functions
-- below (which run as the owner).
create function private.guard_provider_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.kind, new.user_id, new.organization_id) is distinct from (old.kind, old.user_id, old.organization_id) then
    raise exception 'ITM:immutable_field: Provider type and owner cannot change';
  end if;
  if current_user in ('authenticated', 'anon') and not private.is_platform_admin() then
    if (new.status, new.status_reason, new.reviewed_by, new.reviewed_at, new.submitted_at, new.archived_at)
       is distinct from (old.status, old.status_reason, old.reviewed_by, old.reviewed_at, old.submitted_at, old.archived_at) then
      raise exception 'ITM:status_change_forbidden: Use submit for review; only platform administrators change provider status';
    end if;
    -- Identity-defining details changed after approval → back to review.
    if old.status = 'approved' and (new.display_name, new.gstin, new.registration_number, new.business_address)
       is distinct from (old.display_name, old.gstin, old.registration_number, old.business_address) then
      new.status := 'submitted';
      new.submitted_at := now();
      new.status_reason := 'Details changed after approval; waiting for review again';
      perform private.log_provider_resubmit(new.id);
    end if;
  end if;
  return new;
end $$;
create trigger provider_profiles_guard before update on public.provider_profiles
  for each row execute function private.guard_provider_profile();

-- -----------------------------------------------------------------------------
-- RLS and grants
-- -----------------------------------------------------------------------------
alter table public.factories                      enable row level security;
alter table public.customer_machines              enable row level security;
alter table public.provider_profiles              enable row level security;
alter table public.provider_skills                enable row level security;
alter table public.provider_make_model_experience enable row level security;
alter table public.organization_invites           enable row level security;
alter table public.provider_documents             enable row level security;
alter table public.verification_checks            enable row level security;

revoke all on public.factories, public.customer_machines, public.provider_profiles, public.provider_skills,
  public.provider_make_model_experience, public.organization_invites, public.provider_documents,
  public.verification_checks from anon, authenticated;

-- Customers edit their own factories and machines directly (plain data, RLS-guarded).
grant select, insert, update on public.factories to authenticated;
grant select, insert, update, delete on public.customer_machines to authenticated;

create policy factories_own on public.factories for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and private.is_active_user() and private.has_role('customer'));
create policy factories_staff on public.factories for select to authenticated using (private.is_staff());

create policy customer_machines_own on public.customer_machines for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and private.is_active_user());
create policy customer_machines_staff on public.customer_machines for select to authenticated using (private.is_staff());

-- Provider profiles: created by functions; managers edit descriptive columns.
grant select on public.provider_profiles to authenticated;
grant update (display_name, bio, years_experience, languages, availability, availability_note,
              base_locality, base_district, base_latitude, base_longitude, service_radius_km, service_districts,
              business_phone, business_email, business_address, business_pincode, gstin, registration_number)
  on public.provider_profiles to authenticated;
grant update (status, status_reason, reviewed_by, reviewed_at, submitted_at, archived_at)
  on public.provider_profiles to authenticated; -- guarded by trigger: platform admins only

create policy provider_profiles_manage on public.provider_profiles for select to authenticated
  using (private.can_manage_provider(id));
create policy provider_profiles_company_peers on public.provider_profiles for select to authenticated
  using (organization_id is not null and private.is_org_member(organization_id) and kind <> 'company_member' );
create policy provider_profiles_staff on public.provider_profiles for select to authenticated
  using (private.is_staff());
create policy provider_profiles_update_manage on public.provider_profiles for update to authenticated
  using (private.can_manage_provider(id) and private.is_active_user())
  with check (private.can_manage_provider(id));
create policy provider_profiles_update_admin on public.provider_profiles for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

-- Skills and make/model experience: managers edit directly.
grant select, insert, update, delete on public.provider_skills to authenticated;
grant select, insert, update, delete on public.provider_make_model_experience to authenticated;

create policy provider_skills_read on public.provider_skills for select to authenticated
  using (private.can_manage_provider(provider_profile_id));
create policy provider_skills_insert on public.provider_skills for insert to authenticated
  with check (private.can_manage_provider(provider_profile_id) and private.is_active_user()
              and copied_from_skill_id is null); -- "copied from company" only via copy_company_skill_to_member
create policy provider_skills_update on public.provider_skills for update to authenticated
  using (private.can_manage_provider(provider_profile_id))
  with check (private.can_manage_provider(provider_profile_id) and private.is_active_user());
create policy provider_skills_delete on public.provider_skills for delete to authenticated
  using (private.can_manage_provider(provider_profile_id));
create policy provider_skills_staff on public.provider_skills for select to authenticated using (private.is_staff());

create policy provider_make_model_manage on public.provider_make_model_experience for all to authenticated
  using (exists (select 1 from public.provider_skills s where s.id = provider_skill_id and private.can_manage_provider(s.provider_profile_id)))
  with check (exists (select 1 from public.provider_skills s where s.id = provider_skill_id and private.can_manage_provider(s.provider_profile_id))
              and private.is_active_user());
create policy provider_make_model_staff on public.provider_make_model_experience for select to authenticated using (private.is_staff());

-- Invitations: company admins see their own; invitees see theirs (matched by verified phone).
grant select on public.organization_invites to authenticated;
create policy organization_invites_company on public.organization_invites for select to authenticated
  using (private.has_role('company_admin', organization_id));
create policy organization_invites_invitee on public.organization_invites for select to authenticated
  using (phone = (select p.phone from public.profiles p where p.id = auth.uid()));
create policy organization_invites_staff on public.organization_invites for select to authenticated using (private.is_staff());

-- Documents: metadata via functions; readable per can_read_provider_document.
grant select on public.provider_documents to authenticated;
create policy provider_documents_read on public.provider_documents for select to authenticated
  using (private.can_read_provider_document(id));

grant select on public.verification_checks to authenticated;
create policy verification_checks_manage on public.verification_checks for select to authenticated
  using (private.can_manage_provider(provider_profile_id) or private.is_staff());

-- Storage: path = <provider_profile_id>/<file>. Upload by managers; read per document rules;
-- delete only while not accepted. No updates (re-upload instead).
create policy provider_documents_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-documents'
    and private.can_manage_provider(private.try_uuid((storage.foldername(name))[1]))
    and private.is_active_user()
  );
create policy provider_documents_read_private on storage.objects for select to authenticated
  using (bucket_id = 'provider-documents' and private.can_read_storage_path(name));
create policy provider_documents_read_public on storage.objects for select to anon, authenticated
  using (bucket_id = 'provider-documents' and private.is_public_work_photo(name));
create policy provider_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-documents'
    and private.can_manage_provider(private.try_uuid((storage.foldername(name))[1]))
    and not exists (select 1 from public.provider_documents d where d.storage_path = name and d.review_status = 'accepted')
  );

-- -----------------------------------------------------------------------------
-- Functions
-- -----------------------------------------------------------------------------

-- Re-define register_role: a technician also gets a draft individual provider profile.
create or replace function public.register_role(p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_user();
  if p_role not in ('customer', 'technician') then
    raise exception 'ITM:role_not_self_service: That role cannot be chosen at sign-up';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), p_role, auth.uid())
  on conflict do nothing;
  if p_role = 'technician' then
    insert into public.provider_profiles (kind, user_id, display_name)
    select 'individual', auth.uid(), p.full_name from public.profiles p where p.id = auth.uid()
    on conflict do nothing;
  end if;
  perform private.audit('role.registered', 'profile', auth.uid()::text, jsonb_build_object('role', p_role));
end $$;

-- Re-define create_organization: also creates the company's draft provider profile.
create or replace function public.create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  perform private.require_active_user();
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid())
  returning id into v_org;
  insert into public.user_roles (user_id, role, organization_id, granted_by)
  values (auth.uid(), 'company_admin', v_org, auth.uid());
  insert into public.provider_profiles (kind, organization_id, display_name) values ('company', v_org, btrim(p_name));
  perform private.audit('organization.created', 'organization', v_org::text, jsonb_build_object('name', btrim(p_name)));
  return v_org;
end $$;

-- Company admin invites an employee by mobile number.
create function public.company_invite_member(p_org uuid, p_phone text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_active_user();
  if not private.has_role('company_admin', p_org) then
    raise exception using errcode = '42501', message = 'only the company admin can invite employees';
  end if;
  if exists (
    select 1 from public.provider_profiles pp join public.profiles p on p.id = pp.user_id
    where pp.organization_id = p_org and pp.kind = 'company_member' and pp.archived_at is null and p.phone = p_phone
  ) then
    raise exception 'ITM:already_member: That person is already in your team';
  end if;
  insert into public.organization_invites (organization_id, phone, display_name, invited_by)
  values (p_org, p_phone, nullif(btrim(p_display_name), ''), auth.uid())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'ITM:invite_exists: An invitation to that number is already open';
  end if;
  perform private.audit('organization.member_invited', 'organization', p_org::text, jsonb_build_object('invite', v_id));
  return v_id;
end $$;

create function public.company_revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.organization_invites;
begin
  perform private.require_active_user();
  select * into i from public.organization_invites where id = p_invite;
  if not found or not private.has_role('company_admin', i.organization_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  update public.organization_invites set revoked_at = now() where id = p_invite and accepted_at is null;
end $$;

-- The invited person accepts with their own OTP-verified number.
create function public.accept_company_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.organization_invites; v_profile uuid; v_phone text; v_name text;
begin
  perform private.require_active_user();
  select phone, full_name into v_phone, v_name from public.profiles where id = auth.uid();
  select * into i from public.organization_invites where id = p_invite for update;
  if not found or i.phone is distinct from v_phone or i.accepted_at is not null or i.revoked_at is not null then
    raise exception 'ITM:invite_invalid: This invitation is not available for your mobile number';
  end if;
  insert into public.user_roles (user_id, role, organization_id, granted_by)
  values (auth.uid(), 'company_technician', i.organization_id, i.invited_by)
  on conflict do nothing;
  select id into v_profile from public.provider_profiles
  where kind = 'company_member' and user_id = auth.uid() and organization_id = i.organization_id;
  if v_profile is null then
    insert into public.provider_profiles (kind, user_id, organization_id, display_name)
    values ('company_member', auth.uid(), i.organization_id, coalesce(v_name, i.display_name))
    returning id into v_profile;
  else
    update public.provider_profiles set archived_at = null, status = 'draft' where id = v_profile;
  end if;
  update public.organization_invites set accepted_at = now(), accepted_user_id = auth.uid() where id = p_invite;
  perform private.audit('organization.member_joined', 'organization', i.organization_id::text,
    jsonb_build_object('user', auth.uid(), 'profile', v_profile));
  return v_profile;
end $$;

-- Company admin ends an employee's membership (history kept).
create function public.company_remove_member(p_member_profile uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare pp public.provider_profiles;
begin
  perform private.require_active_user();
  select * into pp from public.provider_profiles where id = p_member_profile and kind = 'company_member';
  if not found or not private.has_role('company_admin', pp.organization_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if pp.user_id = auth.uid() then
    raise exception 'ITM:remove_self: Company admins cannot remove themselves';
  end if;
  update public.user_roles set revoked_at = now()
  where user_id = pp.user_id and organization_id = pp.organization_id and role = 'company_technician' and revoked_at is null;
  update public.provider_profiles set archived_at = now() where id = pp.id;
  perform private.audit('organization.member_removed', 'provider_profile', pp.id::text, jsonb_build_object('reason', p_reason));
end $$;

-- Explicit, per-skill copy of a company skill to one employee (never automatic).
create function public.copy_company_skill_to_member(p_company_skill uuid, p_member_profile uuid, p_years int, p_level public.skill_level)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.provider_skills; c public.provider_profiles; m public.provider_profiles; v_id uuid;
begin
  perform private.require_active_user();
  select * into s from public.provider_skills where id = p_company_skill;
  select * into c from public.provider_profiles where id = s.provider_profile_id;
  select * into m from public.provider_profiles where id = p_member_profile;
  if c.kind is distinct from 'company' or m.kind is distinct from 'company_member'
     or c.organization_id is distinct from m.organization_id or m.archived_at is not null then
    raise exception 'ITM:copy_invalid: Copy a company skill to a current employee of the same company';
  end if;
  if not private.can_manage_provider(m.id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  insert into public.provider_skills (provider_profile_id, catalogue_entity_id, years_experience, level, copied_from_skill_id)
  values (m.id, s.catalogue_entity_id, coalesce(p_years, 0), coalesce(p_level, 'experienced'), s.id)
  returning id into v_id;
  perform private.audit('provider.skill_copied', 'provider_profile', m.id::text, jsonb_build_object('from_skill', s.id));
  return v_id;
end $$;

-- Register an uploaded file. The object must already be in storage under the profile's folder.
create function public.register_provider_document(
  p_profile uuid, p_doc_type public.provider_document_type, p_storage_path text, p_title text,
  p_mime_type text, p_size_bytes int, p_issuer text default null, p_valid_until date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; pp public.provider_profiles;
begin
  perform private.require_active_user();
  select * into pp from public.provider_profiles where id = p_profile;
  if not found or not private.can_manage_provider(p_profile) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if p_doc_type = 'identity' and pp.user_id is distinct from auth.uid() then
    raise exception 'ITM:identity_self_only: Only the person themself can upload their identity document';
  end if;
  if p_doc_type in ('business_registration', 'gst_certificate') and pp.kind <> 'company' then
    raise exception 'ITM:business_doc_company_only: Business documents belong on the company profile';
  end if;
  if split_part(p_storage_path, '/', 1) <> p_profile::text then
    raise exception 'ITM:path_invalid: The file is not in this provider''s folder';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'provider-documents' and o.name = p_storage_path) then
    raise exception 'ITM:file_missing: Upload the file first';
  end if;
  insert into public.provider_documents (provider_profile_id, doc_type, title, issuer, valid_until, storage_path, mime_type, size_bytes)
  values (p_profile, p_doc_type, btrim(p_title), nullif(btrim(p_issuer), ''), p_valid_until, p_storage_path, p_mime_type, p_size_bytes)
  returning id into v_id;
  perform private.audit('provider.document_added', 'provider_profile', p_profile::text,
    jsonb_build_object('document', v_id, 'type', p_doc_type));
  return v_id;
end $$;

create function public.delete_provider_document(p_document uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d public.provider_documents;
begin
  perform private.require_active_user();
  select * into d from public.provider_documents where id = p_document;
  if not found or not private.can_read_provider_document(d.id) or not private.can_manage_provider(d.provider_profile_id) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if d.review_status = 'accepted' then
    raise exception 'ITM:document_reviewed: Reviewed documents are kept. Contact support to replace one.';
  end if;
  delete from public.provider_documents where id = p_document;
  perform private.audit('provider.document_deleted', 'provider_profile', d.provider_profile_id::text,
    jsonb_build_object('document', d.id, 'type', d.doc_type));
  return d.storage_path; -- the app removes the file
end $$;

create function private.pending_terms_count(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from (
    select distinct on (ld.code) ld.*
    from public.legal_documents ld
    where ld.review_status <> 'withdrawn' and (ld.effective_from is null or ld.effective_from <= now())
    order by ld.code, ld.effective_from desc nulls last, ld.created_at desc
  ) d
  where exists (select 1 from public.user_roles r where r.user_id = p_user and r.revoked_at is null and r.role = any (d.required_for))
    and not exists (select 1 from public.terms_acceptances t where t.user_id = p_user and t.legal_document_id = d.id);
$$;

/** What is still missing before a profile can be submitted. Empty array = ready. */
create function public.provider_profile_gaps(p_profile uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare pp public.provider_profiles; gaps text[] := '{}';
begin
  select * into pp from public.provider_profiles where id = p_profile;
  if not found or not (private.can_manage_provider(p_profile) or private.is_staff()) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  if coalesce(btrim(pp.display_name), '') = '' then gaps := gaps || 'Add your name or company name'::text; end if;
  if cardinality(pp.languages) = 0 then gaps := gaps || 'Choose the languages you speak'::text; end if;
  if pp.base_locality is null and pp.base_latitude is null then gaps := gaps || 'Add your base location'::text; end if;
  if pp.kind = 'company' then
    if pp.business_phone is null then gaps := gaps || 'Add a business phone number'::text; end if;
    if pp.business_address is null then gaps := gaps || 'Add the business address'::text; end if;
    if not exists (select 1 from public.provider_skills s where s.provider_profile_id = pp.id) then
      gaps := gaps || 'Add at least one service category or machine'::text;
    end if;
  else
    if not exists (
      select 1 from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
      where s.provider_profile_id = pp.id and e.kind = 'machine_type'
    ) then
      gaps := gaps || 'Add at least one machine you work on, with your years of experience'::text;
    end if;
    if private.pending_terms_count(pp.user_id) > 0 then gaps := gaps || 'Accept the provider terms'::text; end if;
  end if;
  if pp.kind = 'company' and private.pending_terms_count(auth.uid()) > 0 then
    gaps := gaps || 'Accept the service company terms'::text;
  end if;
  return gaps;
end $$;

create function public.submit_provider_profile(p_profile uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pp public.provider_profiles; gaps text[];
begin
  perform private.require_active_user();
  if not private.can_manage_provider(p_profile) then
    raise exception using errcode = '42501', message = 'not allowed';
  end if;
  select * into pp from public.provider_profiles where id = p_profile for update;
  if pp.status not in ('draft', 'rejected') then
    raise exception 'ITM:not_submittable: This profile is already % ', pp.status;
  end if;
  gaps := public.provider_profile_gaps(p_profile);
  if cardinality(gaps) > 0 then
    raise exception 'ITM:profile_incomplete: %', array_to_string(gaps, '; ');
  end if;
  update public.provider_profiles set status = 'submitted', submitted_at = now(), status_reason = null where id = p_profile;
  perform private.audit('provider.submitted', 'provider_profile', p_profile::text, '{}'::jsonb);
end $$;

-- Platform admin records a verification check (each kind separately).
create function public.record_verification_check(
  p_profile uuid, p_kind public.verification_kind, p_passed boolean, p_label text default null,
  p_valid_until date default null, p_document uuid default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; pp public.provider_profiles;
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins record verification checks';
  end if;
  select * into pp from public.provider_profiles where id = p_profile;
  if not found then raise exception 'ITM:not_found: Provider not found'; end if;
  if p_kind = 'business' and pp.kind <> 'company' then
    raise exception 'ITM:business_check_company_only: Business checks apply to companies';
  end if;
  if p_kind = 'identity' and pp.kind = 'company' then
    raise exception 'ITM:identity_check_person_only: Identity checks apply to people, not companies';
  end if;
  if p_passed and p_kind in ('certificate', 'licence', 'insurance') and p_document is null then
    raise exception 'ITM:document_required: Link the reviewed document';
  end if;
  if p_document is not null and not exists (
    select 1 from public.provider_documents d where d.id = p_document and d.provider_profile_id = p_profile
  ) then
    raise exception 'ITM:document_mismatch: That document belongs to another provider';
  end if;
  if p_passed and p_valid_until is not null and p_valid_until < current_date then
    raise exception 'ITM:expired: The document has expired; it cannot pass';
  end if;
  insert into public.verification_checks (provider_profile_id, kind, passed, label, valid_until, document_id, note, reviewed_by)
  values (p_profile, p_kind, p_passed, nullif(btrim(p_label), ''), p_valid_until, p_document, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;
  if p_document is not null then
    update public.provider_documents
    set review_status = case when p_passed then 'accepted' else 'rejected' end::public.document_review_status,
        review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_document;
  end if;
  perform private.audit('verification.recorded', 'provider_profile', p_profile::text,
    jsonb_build_object('check', v_id, 'kind', p_kind, 'passed', p_passed, 'label', p_label));
  return v_id;
end $$;

create function public.revoke_verification_check(p_check uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.verification_checks;
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins revoke verification checks';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'ITM:note_required: Give a reason'; end if;
  update public.verification_checks set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
  where id = p_check and revoked_at is null
  returning * into c;
  if c.id is null then raise exception 'ITM:not_found: Check not found or already revoked'; end if;
  perform private.audit('verification.revoked', 'provider_profile', c.provider_profile_id::text,
    jsonb_build_object('check', c.id, 'reason', p_reason));
end $$;

-- Review a work photo (accept / reject) without a verification check.
create function public.review_provider_document(p_document uuid, p_accept boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.provider_documents;
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins review documents';
  end if;
  update public.provider_documents
  set review_status = case when p_accept then 'accepted' else 'rejected' end::public.document_review_status,
      review_note = nullif(btrim(p_note), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_document returning * into d;
  if d.id is null then raise exception 'ITM:not_found: Document not found'; end if;
  perform private.audit('provider.document_reviewed', 'provider_profile', d.provider_profile_id::text,
    jsonb_build_object('document', d.id, 'accepted', p_accept));
end $$;

/**
 * Badges = for each (kind, label), the latest unrevoked decision, if it was a
 * pass and is still in date. The only source of verification badges.
 */
create function private.provider_badges(p_profile uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'label', c.label, 'valid_until', c.valid_until,
                                               'reviewed_at', c.reviewed_at) order by c.kind, c.label), '[]'::jsonb)
  from (
    select distinct on (v.kind, coalesce(v.label, '')) v.*
    from public.verification_checks v
    where v.provider_profile_id = p_profile and v.revoked_at is null
    order by v.kind, coalesce(v.label, ''), v.reviewed_at desc
  ) c
  where c.passed and (c.valid_until is null or c.valid_until >= current_date);
$$;

create function private.has_current_check(p_profile uuid, p_kind public.verification_kind)
returns boolean language sql stable security definer set search_path = '' as $$
  -- the latest decision per kind must be a pass, and in date
  select exists (
    select 1 from (
      select distinct on (coalesce(c.label, '')) c.passed, c.valid_until
      from public.verification_checks c
      where c.provider_profile_id = p_profile and c.kind = p_kind and c.revoked_at is null
      order by coalesce(c.label, ''), c.reviewed_at desc
    ) x where x.passed and (x.valid_until is null or x.valid_until >= current_date)
  );
$$;

-- Platform admin: approve / reject / suspend.
create function public.set_provider_status(p_profile uuid, p_status public.provider_status, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare pp public.provider_profiles;
begin
  perform private.require_active_user();
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'only platform admins change provider status';
  end if;
  select * into pp from public.provider_profiles where id = p_profile for update;
  if not found then raise exception 'ITM:not_found: Provider not found'; end if;
  if p_status in ('rejected', 'suspended') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'ITM:note_required: Give a reason';
  end if;
  if not (
    (pp.status = 'submitted' and p_status in ('approved', 'rejected')) or
    (pp.status = 'approved'  and p_status = 'suspended') or
    (pp.status = 'suspended' and p_status in ('approved', 'rejected')) or
    (pp.status in ('draft', 'rejected') and p_status = 'suspended')
  ) then
    raise exception 'ITM:invalid_transition: A % provider cannot be set to %', pp.status, p_status;
  end if;
  if p_status = 'approved' then
    if pp.kind = 'individual' and not private.has_current_check(pp.id, 'identity') then
      raise exception 'ITM:identity_check_required: Record a passed identity check before approving';
    end if;
    if pp.kind = 'company' and not private.has_current_check(pp.id, 'business') then
      raise exception 'ITM:business_check_required: Record a passed business details check before approving';
    end if;
    if pp.kind = 'company_member' and not exists (
      select 1 from public.provider_profiles c where c.organization_id = pp.organization_id and c.kind = 'company' and c.status = 'approved'
    ) then
      raise exception 'ITM:company_not_approved: Approve the company before its employees';
    end if;
    if pp.archived_at is not null then
      raise exception 'ITM:member_left: This person is no longer in the company';
    end if;
  end if;
  update public.provider_profiles
  set status = p_status, status_reason = nullif(btrim(p_reason), ''), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_profile;
  perform private.audit('provider.status_changed', 'provider_profile', p_profile::text,
    jsonb_build_object('from', pp.status, 'to', p_status, 'reason', p_reason));
end $$;

-- Customer-facing profile. Approved providers only; no documents, phone numbers or exact location.
create function public.get_provider_public(p_profile uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pp.id,
    'kind', pp.kind,
    'display_name', pp.display_name,
    'company_name', case when pp.kind = 'company_member' then o.name end,
    'bio', pp.bio,
    'years_experience', pp.years_experience,
    'languages', pp.languages,
    'availability', pp.availability,
    'availability_note', pp.availability_note,
    'base_locality', pp.base_locality,
    'base_district', pp.base_district,
    'service_radius_km', pp.service_radius_km,
    'service_districts', pp.service_districts,
    'mobile_verified', (pp.user_id is not null and exists (select 1 from public.profiles p where p.id = pp.user_id and p.phone is not null)),
    'badges', private.provider_badges(pp.id),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', e.key, 'kind', e.kind, 'name', e.name, 'years_experience', s.years_experience, 'level', s.level,
        'makes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'manufacturer', coalesce(mf.name, mm.manufacturer_text), 'model', coalesce(md.name, mm.model_text),
            'years_experience', mm.years_experience, 'catalogued', (mm.manufacturer_id is not null or mm.model_id is not null)))
          from public.provider_make_model_experience mm
          left join public.catalogue_entities mf on mf.id = mm.manufacturer_id
          left join public.catalogue_entities md on md.id = mm.model_id
          where mm.provider_skill_id = s.id), '[]'::jsonb))
        order by e.kind, s.years_experience desc, e.name)
      from public.provider_skills s join public.catalogue_entities e on e.id = s.catalogue_entity_id
      where s.provider_profile_id = pp.id and e.status = 'approved'), '[]'::jsonb),
    'team_size', case when pp.kind = 'company' then (
      select count(*) from public.provider_profiles m
      where m.organization_id = pp.organization_id and m.kind = 'company_member' and m.status = 'approved' and m.archived_at is null) end,
    'work_photos', coalesce((
      select jsonb_agg(jsonb_build_object('path', d.storage_path, 'title', d.title) order by d.created_at)
      from public.provider_documents d
      where d.provider_profile_id = pp.id and d.doc_type = 'work_photo' and d.review_status = 'accepted'), '[]'::jsonb)
  )
  from public.provider_profiles pp
  left join public.organizations o on o.id = pp.organization_id
  where pp.id = p_profile and pp.archived_at is null
    and (pp.status = 'approved' or private.can_manage_provider(pp.id) or private.is_staff());
$$;

-- Extend get_my_context with provider profiles I manage and invitations waiting for me.
create or replace function public.get_my_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'profile', (select to_jsonb(p) - 'status_reason' from public.profiles p where p.id = auth.uid()),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'role', r.role, 'organization_id', r.organization_id,
        'can_send_estimates', r.can_send_estimates) order by r.granted_at)
      from public.user_roles r where r.user_id = auth.uid() and r.revoked_at is null), '[]'::jsonb),
    'pending_documents', coalesce((
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
      )), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object('id', pp.id, 'kind', pp.kind, 'display_name', pp.display_name,
                                          'status', pp.status, 'organization_id', pp.organization_id,
                                          'organization_name', o.name) order by pp.kind, pp.created_at)
      from public.provider_profiles pp left join public.organizations o on o.id = pp.organization_id
      where pp.archived_at is null and (
        (pp.kind in ('individual', 'company_member') and pp.user_id = auth.uid())
        or (pp.kind = 'company' and private.has_role('company_admin', pp.organization_id)))), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'organization_id', i.organization_id, 'organization_name', o.name,
                                          'created_at', i.created_at))
      from public.organization_invites i join public.organizations o on o.id = i.organization_id
      where i.accepted_at is null and i.revoked_at is null
        and i.phone = (select p.phone from public.profiles p where p.id = auth.uid())), '[]'::jsonb),
    'factory_count', (select count(*) from public.factories f where f.owner_id = auth.uid() and f.is_active)
  ) end;
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
  private.try_uuid(text),
  private.log_provider_resubmit(uuid),
  private.can_read_storage_path(text)
to authenticated;
grant execute on function private.normalize_catalogue_text(text) to anon, authenticated;
grant execute on function private.is_public_work_photo(text) to anon, authenticated;

grant execute on function public.search_catalogue(text, public.catalogue_kind[], int, text) to anon, authenticated;
grant execute on function public.get_provider_public(uuid) to anon, authenticated;
-- All other public functions: authenticated (default privileges); each checks roles inside.
