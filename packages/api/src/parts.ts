/** Spare-parts coordination services. */
import { AppError, parseOrThrow, partFieldsSchema, toAppError, type PartFieldsInput } from '@itm/core';
import type { Json, PartCompatibility, PartStage, Tables } from '@itm/types';
import type { ItmClient } from './client';

export const PART_PHOTO_BUCKET = 'part-photos';
export type PartRequest = Tables<'part_requests'>;

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

export async function listParts(client: ItmClient, requestId: string): Promise<PartRequest[]> {
  return unwrap(await client.from('part_requests').select('*').eq('request_id', requestId).order('created_at')) ?? [];
}

export async function partHistory(client: ItmClient, partIds: string[]) {
  if (!partIds.length) return [];
  return unwrap(await client.from('part_status_events').select('*').in('part_id', partIds).order('id')) ?? [];
}

export async function createPartRequest(client: ItmClient, requestId: string, providerId: string, input: PartFieldsInput): Promise<string> {
  const v = parseOrThrow(partFieldsSchema, input);
  const id = unwrap(await client.rpc('create_part_request', { p_request: requestId, p_provider: providerId, p_fields: v as unknown as Json }));
  if (!id) throw new AppError('unknown');
  return id;
}

/** Only the keys present are changed. */
export async function updatePartRequest(client: ItmClient, partId: string, fields: Record<string, string>): Promise<void> {
  unwrap(await client.rpc('update_part_request', { p_part: partId, p_fields: fields as unknown as Json }));
}

export async function setPartCompatibility(client: ItmClient, partId: string, status: PartCompatibility, note: string): Promise<void> {
  unwrap(await client.rpc('set_part_compatibility', { p_part: partId, p_status: status, p_note: note }));
}

export async function submitPartForApproval(client: ItmClient, partId: string): Promise<string> {
  const h = unwrap(await client.rpc('submit_part_for_approval', { p_part: partId }));
  if (!h) throw new AppError('unknown');
  return h;
}

export async function decidePart(client: ItmClient, partId: string, approve: boolean, hash: string, arrangedBy?: 'customer' | 'provider', note?: string) {
  unwrap(await client.rpc('decide_part', { p_part: partId, p_approve: approve, p_hash: hash, p_arranged_by: arrangedBy ?? null, p_note: note?.trim() || null }));
}

export async function advancePart(client: ItmClient, partId: string, stage: PartStage, note?: string): Promise<void> {
  unwrap(await client.rpc('advance_part', { p_part: partId, p_stage: stage, p_note: note?.trim() || null }));
}

export async function uploadPartPhoto(client: ItmClient, partId: string, file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number }) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic'].includes(file.mimeType)) throw new AppError('validation', { userMessage: 'Add a JPG, PNG or WebP photo.' });
  if (file.sizeBytes > 10 * 1024 * 1024) throw new AppError('validation', { userMessage: 'Photos must be 10 MB or smaller.' });
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[file.mimeType];
  const path = `${partId}/${crypto.randomUUID()}.${ext}`;
  const up = await client.storage.from(PART_PHOTO_BUCKET).upload(path, file.body, { contentType: file.mimeType });
  if (up.error) throw toAppError(up.error);
  unwrap(await client.rpc('register_part_photo', { p_part: partId, p_storage_path: path }));
}

export async function partPhotoUrl(client: ItmClient, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from(PART_PHOTO_BUCKET).createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}
