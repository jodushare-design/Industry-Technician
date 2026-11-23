/** Service requests, matching, invitations and selection. */
import {
  AppError,
  MAX_MEDIA_BYTES,
  mediaKindOf,
  mediaStoragePath,
  parseOrThrow,
  serviceRequestSchema,
  toAppError,
  type MatchResult,
  type ServiceRequestInput,
} from '@itm/core';
import type { ItmClient } from './client';

export const REQUEST_MEDIA_BUCKET = 'request-media';

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}
function value<T>(res: { data: T | null; error: unknown }): T {
  const v = unwrap(res);
  if (v === null || v === undefined) throw new AppError('unknown', { message: 'RPC returned no value' });
  return v;
}

export async function createServiceRequest(client: ItmClient, input: ServiceRequestInput): Promise<string> {
  const v = parseOrThrow(serviceRequestSchema, input);
  return value(
    await client.rpc('create_service_request', {
      p_factory: v.factoryId,
      p_service_type: v.serviceType,
      p_description: v.description,
      p_symptoms: v.symptoms,
      p_customer_machine: v.customerMachineId ?? null,
      p_machine_type: v.machineTypeId ?? null,
      p_industry: v.industryId ?? null,
      p_manufacturer_text: v.manufacturerText ?? null,
      p_model_text: v.modelText ?? null,
      p_urgency: v.urgency,
      p_preferred_date: v.preferredDate ?? null,
    }),
  );
}

/** Upload a photo, short video or voice note to the request (browser or app). */
export async function uploadRequestMedia(
  client: ItmClient,
  requestId: string,
  file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number },
): Promise<string> {
  const kind = mediaKindOf(file.mimeType);
  if (!kind) throw new AppError('validation', { userMessage: 'Add a photo (JPG, PNG), a short video (MP4) or a voice note (MP3, M4A, AAC, WebM).' });
  if (file.sizeBytes > MAX_MEDIA_BYTES) throw new AppError('validation', { userMessage: 'Files must be 50 MB or smaller. Record a shorter video.' });
  const path = mediaStoragePath(requestId, file.mimeType, crypto.randomUUID());
  const up = await client.storage.from(REQUEST_MEDIA_BUCKET).upload(path, file.body, { contentType: file.mimeType, upsert: false });
  if (up.error) throw toAppError(up.error);
  try {
    return value(
      await client.rpc('register_request_attachment', {
        p_request: requestId,
        p_kind: kind,
        p_storage_path: path,
        p_mime_type: file.mimeType,
        p_size_bytes: file.sizeBytes,
      }),
    );
  } catch (e) {
    await client.storage.from(REQUEST_MEDIA_BUCKET).remove([path]);
    throw e;
  }
}

export async function mediaUrl(client: ItmClient, path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await client.storage.from(REQUEST_MEDIA_BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function matchProviders(client: ItmClient, requestId: string, limit = 20): Promise<MatchResult[]> {
  return (unwrap(await client.rpc('match_providers', { p_request: requestId, p_limit: limit })) as unknown as MatchResult[]) ?? [];
}

export async function inviteProvider(client: ItmClient, requestId: string, providerId: string): Promise<string> {
  return value(await client.rpc('invite_provider', { p_request: requestId, p_provider: providerId }));
}

export async function withdrawInvitation(client: ItmClient, invitationId: string): Promise<void> {
  unwrap(await client.rpc('withdraw_invitation', { p_invitation: invitationId }));
}

export async function respondToInvitation(client: ItmClient, invitationId: string, accept: boolean, reason?: string): Promise<void> {
  unwrap(await client.rpc('respond_to_invitation', { p_invitation: invitationId, p_accept: accept, p_reason: reason?.trim() || null }));
}

export async function selectProvider(client: ItmClient, requestId: string, providerId: string): Promise<void> {
  unwrap(await client.rpc('select_provider', { p_request: requestId, p_provider: providerId }));
}

export async function cancelServiceRequest(client: ItmClient, requestId: string, reason: string): Promise<void> {
  if (reason.trim().length < 3) throw new AppError('validation', { userMessage: 'Tell the providers why you are cancelling.' });
  unwrap(await client.rpc('cancel_service_request', { p_request: requestId, p_reason: reason.trim() }));
}

export interface ProviderRequestView {
  id: string;
  reference: string;
  status: string;
  service_type: string;
  symptoms: string[];
  description: string;
  urgency: string;
  preferred_date: string | null;
  created_at: string;
  machine_type: string;
  machine_type_key: string;
  industry: string | null;
  manufacturer: string | null;
  model: string | null;
  machine_label: string | null;
  year_installed: number | null;
  locality: string;
  district: string | null;
  city: string;
  invitations: { id: string; provider_id: string; status: string; match_reasons: string[] | null; invited_at: string }[] | null;
  selected_you: boolean;
  engaged: boolean;
  customer_name: string;
  factory_name: string | null;
  address_line: string | null;
  pincode: string | null;
  attachments: { id: string; kind: 'photo' | 'video' | 'voice'; path: string; mime_type: string }[];
}

export async function getRequestForProvider(client: ItmClient, requestId: string): Promise<ProviderRequestView | null> {
  return (unwrap(await client.rpc('get_request_for_provider', { p_request: requestId })) as unknown as ProviderRequestView | null) ?? null;
}

export interface InvitationSummary {
  invitation_id: string;
  status: string;
  invited_at: string;
  provider_id: string;
  provider_name: string | null;
  request_id: string;
  reference: string;
  request_status: string;
  service_type: string;
  urgency: string;
  machine_type: string;
  symptoms: string[];
  locality: string;
  district: string | null;
  selected_you: boolean;
}

export async function listMyInvitations(client: ItmClient, includeClosed = false): Promise<InvitationSummary[]> {
  return (unwrap(await client.rpc('list_my_invitations', { p_include_closed: includeClosed })) as unknown as InvitationSummary[]) ?? [];
}
