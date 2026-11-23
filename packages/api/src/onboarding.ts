/**
 * Onboarding services: factories and machines (customers), provider profiles,
 * skills, documents, company teams, and admin verification.
 * Plain data goes straight to tables (RLS decides); status, membership and
 * verification go through SQL functions.
 */
import {
  AppError,
  companyDetailsSchema,
  customerMachineSchema,
  documentStoragePath,
  documentUploadSchema,
  factorySchema,
  inviteMemberSchema,
  makeModelSchema,
  parseOrThrow,
  providerDetailsSchema,
  providerSkillSchema,
  serviceAreaSchema,
  toAppError,
  type CustomerMachineInput,
  type FactoryInput,
} from '@itm/core';
import type { ProviderPublic, ProviderStatus, SkillLevel, VerificationKind } from '@itm/types';
import type { ItmClient } from './client';

export const DOCUMENT_BUCKET = 'provider-documents';

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}
/** For RPCs that always return a value. */
function value<T>(res: { data: T | null; error: unknown }): T {
  const v = unwrap(res);
  if (v === null || v === undefined) throw new AppError('unknown', { message: 'RPC returned no value' });
  return v;
}
function one<T>(rows: T[] | null): T {
  if (!rows || rows.length === 0) throw new AppError('forbidden');
  return rows[0]!;
}

// ---------------------------------------------------------------- customers

export async function saveFactory(client: ItmClient, input: FactoryInput, id?: string): Promise<string> {
  const v = parseOrThrow(factorySchema, input);
  const row = {
    name: v.name,
    address_line: v.addressLine ?? null,
    locality: v.locality,
    district: v.district ?? null,
    city: v.city,
    pincode: v.pincode ?? null,
    gstin: v.gstin ?? null,
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
  };
  const res = id
    ? await client.from('factories').update(row).eq('id', id).select('id')
    : await client.from('factories').insert(row).select('id');
  return one(unwrap(res)).id;
}

export async function setFactoryActive(client: ItmClient, id: string, active: boolean): Promise<void> {
  one(unwrap(await client.from('factories').update({ is_active: active }).eq('id', id).select('id')));
}

export async function saveCustomerMachine(client: ItmClient, input: CustomerMachineInput, id?: string): Promise<string> {
  const v = parseOrThrow(customerMachineSchema, input);
  const row = {
    factory_id: v.factoryId,
    machine_type_id: v.machineTypeId,
    manufacturer_id: v.manufacturerId ?? null,
    model_id: v.modelId ?? null,
    manufacturer_text: v.manufacturerText ?? null,
    model_text: v.modelText ?? null,
    label: v.label ?? null,
    year_installed: v.yearInstalled ?? null,
    serial_number: v.serialNumber ?? null,
    notes: v.notes ?? null,
  };
  const res = id
    ? await client.from('customer_machines').update(row).eq('id', id).select('id')
    : await client.from('customer_machines').insert(row).select('id');
  return one(unwrap(res)).id;
}

export async function removeCustomerMachine(client: ItmClient, id: string): Promise<void> {
  unwrap(await client.from('customer_machines').delete().eq('id', id));
}

// ---------------------------------------------------------------- provider profile

export async function saveProviderDetails(client: ItmClient, profileId: string, input: unknown): Promise<void> {
  const v = parseOrThrow(providerDetailsSchema, input);
  one(
    unwrap(
      await client
        .from('provider_profiles')
        .update({
          display_name: v.displayName,
          bio: v.bio ?? null,
          years_experience: v.yearsExperience ?? null,
          languages: v.languages,
          availability: v.availability,
          availability_note: v.availabilityNote ?? null,
        })
        .eq('id', profileId)
        .select('id'),
    ),
  );
}

export async function saveServiceArea(client: ItmClient, profileId: string, input: unknown): Promise<void> {
  const v = parseOrThrow(serviceAreaSchema, input);
  one(
    unwrap(
      await client
        .from('provider_profiles')
        .update({
          base_locality: v.baseLocality,
          base_district: v.baseDistrict ?? null,
          base_latitude: v.baseLatitude ?? null,
          base_longitude: v.baseLongitude ?? null,
          service_radius_km: v.serviceRadiusKm,
          service_districts: v.serviceDistricts,
        })
        .eq('id', profileId)
        .select('id'),
    ),
  );
}

export async function saveCompanyDetails(client: ItmClient, profileId: string, input: unknown): Promise<void> {
  const v = parseOrThrow(companyDetailsSchema, input);
  one(
    unwrap(
      await client
        .from('provider_profiles')
        .update({
          business_phone: v.businessPhone,
          business_email: v.businessEmail ?? null,
          business_address: v.businessAddress,
          business_pincode: v.businessPincode ?? null,
          gstin: v.gstin ?? null,
          registration_number: v.registrationNumber ?? null,
        })
        .eq('id', profileId)
        .select('id'),
    ),
  );
}

export async function addProviderSkill(client: ItmClient, profileId: string, input: unknown): Promise<string> {
  const v = parseOrThrow(providerSkillSchema, input);
  return one(
    unwrap(
      await client
        .from('provider_skills')
        .insert({
          provider_profile_id: profileId,
          catalogue_entity_id: v.catalogueEntityId,
          years_experience: v.yearsExperience,
          level: v.level,
          notes: v.notes ?? null,
        })
        .select('id'),
    ),
  ).id;
}

export async function updateProviderSkill(client: ItmClient, skillId: string, years: number, level: SkillLevel): Promise<void> {
  if (!Number.isInteger(years) || years < 0 || years > 60) throw new AppError('validation', { fieldErrors: { yearsExperience: ['0–60 years'] } });
  one(unwrap(await client.from('provider_skills').update({ years_experience: years, level }).eq('id', skillId).select('id')));
}

export async function removeProviderSkill(client: ItmClient, skillId: string): Promise<void> {
  unwrap(await client.from('provider_skills').delete().eq('id', skillId));
}

export async function addMakeModelExperience(client: ItmClient, input: unknown): Promise<void> {
  const v = parseOrThrow(makeModelSchema, input);
  unwrap(
    await client.from('provider_make_model_experience').insert({
      provider_skill_id: v.providerSkillId,
      manufacturer_id: v.manufacturerId ?? null,
      model_id: v.modelId ?? null,
      manufacturer_text: v.manufacturerText ?? null,
      model_text: v.modelText ?? null,
      years_experience: v.yearsExperience ?? null,
    }),
  );
}

export async function removeMakeModelExperience(client: ItmClient, id: string): Promise<void> {
  unwrap(await client.from('provider_make_model_experience').delete().eq('id', id));
}

export async function getProviderGaps(client: ItmClient, profileId: string): Promise<string[]> {
  return unwrap(await client.rpc('provider_profile_gaps', { p_profile: profileId })) ?? [];
}

export async function submitProviderProfile(client: ItmClient, profileId: string): Promise<void> {
  unwrap(await client.rpc('submit_provider_profile', { p_profile: profileId }));
}

export async function getProviderPublic(client: ItmClient, profileId: string): Promise<ProviderPublic | null> {
  return (unwrap(await client.rpc('get_provider_public', { p_profile: profileId })) as unknown as ProviderPublic | null) ?? null;
}

// ---------------------------------------------------------------- documents

/**
 * Upload a file to private storage under the provider's folder, then register
 * it. The object name is generated (never the user's file name).
 */
export async function uploadProviderDocument(
  client: ItmClient,
  profileId: string,
  file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number },
  meta: { docType: string; title: string; issuer?: string; validUntil?: string },
): Promise<string> {
  const v = parseOrThrow(documentUploadSchema, { ...meta, mimeType: file.mimeType, sizeBytes: file.sizeBytes });
  const path = documentStoragePath(profileId, v.mimeType, crypto.randomUUID());
  const up = await client.storage.from(DOCUMENT_BUCKET).upload(path, file.body, { contentType: v.mimeType, upsert: false });
  if (up.error) throw toAppError(up.error);
  try {
    return unwrap(
      await client.rpc('register_provider_document', {
        p_profile: profileId,
        p_doc_type: v.docType,
        p_storage_path: path,
        p_title: v.title,
        p_mime_type: v.mimeType,
        p_size_bytes: v.sizeBytes,
        p_issuer: v.issuer ?? null,
        p_valid_until: v.validUntil ?? null,
      }),
    ) as string;
  } catch (e) {
    await client.storage.from(DOCUMENT_BUCKET).remove([path]); // don't leave orphan files
    throw e;
  }
}

export async function deleteProviderDocument(client: ItmClient, documentId: string): Promise<void> {
  const path = unwrap(await client.rpc('delete_provider_document', { p_document: documentId }));
  if (path) await client.storage.from(DOCUMENT_BUCKET).remove([path]);
}

/** Short-lived link to view a document (RLS decides who may). */
export async function documentViewUrl(client: ItmClient, storagePath: string, seconds = 60): Promise<string | null> {
  const { data, error } = await client.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, seconds);
  return error ? null : data.signedUrl;
}

// ---------------------------------------------------------------- company team

export async function inviteCompanyMember(client: ItmClient, orgId: string, input: unknown): Promise<string> {
  const v = parseOrThrow(inviteMemberSchema, input);
  return value(await client.rpc('company_invite_member', { p_org: orgId, p_phone: v.phone, p_display_name: v.displayName ?? null }));
}

export async function revokeCompanyInvite(client: ItmClient, inviteId: string): Promise<void> {
  unwrap(await client.rpc('company_revoke_invite', { p_invite: inviteId }));
}

export async function acceptCompanyInvite(client: ItmClient, inviteId: string): Promise<string> {
  return value(await client.rpc('accept_company_invite', { p_invite: inviteId }));
}

export async function removeCompanyMember(client: ItmClient, memberProfileId: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new AppError('validation', { fieldErrors: { reason: ['Give a reason'] } });
  unwrap(await client.rpc('company_remove_member', { p_member_profile: memberProfileId, p_reason: reason.trim() }));
}

export async function copyCompanySkillToMember(client: ItmClient, companySkillId: string, memberProfileId: string, years: number, level: SkillLevel) {
  return unwrap(
    await client.rpc('copy_company_skill_to_member', { p_company_skill: companySkillId, p_member_profile: memberProfileId, p_years: years, p_level: level }),
  );
}

// ---------------------------------------------------------------- admin verification

export async function recordVerificationCheck(
  client: ItmClient,
  input: { profileId: string; kind: VerificationKind; passed: boolean; label?: string; validUntil?: string; documentId?: string; note?: string },
): Promise<string> {
  return value(
    await client.rpc('record_verification_check', {
      p_profile: input.profileId,
      p_kind: input.kind,
      p_passed: input.passed,
      p_label: input.label?.trim() || null,
      p_valid_until: input.validUntil || null,
      p_document: input.documentId || null,
      p_note: input.note?.trim() || null,
    }),
  );
}

export async function revokeVerificationCheck(client: ItmClient, checkId: string, reason: string): Promise<void> {
  unwrap(await client.rpc('revoke_verification_check', { p_check: checkId, p_reason: reason }));
}

export async function reviewProviderDocument(client: ItmClient, documentId: string, accept: boolean, note?: string): Promise<void> {
  unwrap(await client.rpc('review_provider_document', { p_document: documentId, p_accept: accept, p_note: note?.trim() || null }));
}

export async function setProviderStatus(client: ItmClient, profileId: string, status: ProviderStatus, reason?: string): Promise<void> {
  unwrap(await client.rpc('set_provider_status', { p_profile: profileId, p_status: status, p_reason: reason?.trim() || null }));
}
