/** Job progress, completion reports, confirmation and complaints. */
import { AppError, MAX_MEDIA_BYTES, mediaKindOf, toAppError, type SafetyItem } from '@itm/core';
import type { ComplaintCategory, ComplaintResolution, ComplaintStatus, Json, JobStatus, Tables } from '@itm/types';
import type { ItmClient } from './client';

export const JOB_PHOTO_BUCKET = 'job-photos';
export const COMPLAINT_FILE_BUCKET = 'complaint-files';
export type Complaint = Tables<'complaints'>;
export type CompletionReport = Tables<'completion_reports'>;

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}
function value<T>(res: { data: T | null; error: unknown }): T {
  const v = unwrap(res);
  if (v === null || v === undefined) throw new AppError('unknown');
  return v;
}

export async function scheduleJob(client: ItmClient, requestId: string, whenIso: string, note?: string) {
  unwrap(await client.rpc('schedule_job', { p_request: requestId, p_when: whenIso, p_note: note?.trim() || null }));
}

export async function acknowledgeSiteSafety(client: ItmClient, requestId: string, items: Record<SafetyItem, boolean>) {
  unwrap(await client.rpc('acknowledge_site_safety', { p_request: requestId, p_items: items as unknown as Json }));
}

export async function updateJobProgress(client: ItmClient, requestId: string, status: JobStatus, note?: string) {
  unwrap(await client.rpc('update_job_progress', { p_request: requestId, p_status: status, p_note: note?.trim() || null }));
}

export async function uploadJobPhoto(client: ItmClient, requestId: string, phase: 'before' | 'after', file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number }) {
  if (mediaKindOf(file.mimeType) !== 'photo') throw new AppError('validation', { userMessage: 'Add a JPG, PNG or WebP photo.' });
  if (file.sizeBytes > 10 * 1024 * 1024) throw new AppError('validation', { userMessage: 'Photos must be 10 MB or smaller.' });
  const ext = file.mimeType.split('/')[1]!.replace('jpeg', 'jpg');
  const path = `${requestId}/${crypto.randomUUID()}.${ext}`;
  const up = await client.storage.from(JOB_PHOTO_BUCKET).upload(path, file.body, { contentType: file.mimeType });
  if (up.error) throw toAppError(up.error);
  return value(await client.rpc('add_job_photo', { p_request: requestId, p_phase: phase, p_storage_path: path }));
}

export async function submitCompletionReport(
  client: ItmClient,
  requestId: string,
  f: { fault_identified: string; work_performed: string; parts_note?: string; remaining_issues?: string; recommendations?: string; completed_on?: string },
) {
  if (f.fault_identified.trim().length < 5 || f.work_performed.trim().length < 5) {
    throw new AppError('validation', { userMessage: 'Describe the fault you found and the work you did (at least a few words each).' });
  }
  return value(await client.rpc('submit_completion_report', { p_request: requestId, p_fields: f as unknown as Json }));
}

export async function confirmCompletion(client: ItmClient, requestId: string, rating?: number, comment?: string) {
  unwrap(await client.rpc('confirm_completion', { p_request: requestId, p_rating: rating ?? null, p_comment: comment?.trim() || null }));
}

export async function reportConcern(client: ItmClient, requestId: string, category: ComplaintCategory, description: string) {
  return value(await client.rpc('report_concern', { p_request: requestId, p_category: category, p_description: description.trim() }));
}

export async function openComplaint(client: ItmClient, input: { requestId?: string; category: ComplaintCategory; description: string; againstProviderId?: string }) {
  if (input.description.trim().length < 10) throw new AppError('validation', { userMessage: 'Describe what happened (at least 10 characters).' });
  return value(
    await client.rpc('open_complaint', {
      p_request: input.requestId ?? null,
      p_category: input.category,
      p_description: input.description.trim(),
      p_against_provider: input.againstProviderId ?? null,
    }),
  );
}

export async function addComplaintMessage(client: ItmClient, complaintId: string, body: string, internal = false) {
  unwrap(await client.rpc('add_complaint_message', { p_complaint: complaintId, p_body: body, p_internal: internal }));
}

export async function uploadComplaintFile(client: ItmClient, complaintId: string, file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number }) {
  if (!mediaKindOf(file.mimeType) && file.mimeType !== 'application/pdf') throw new AppError('validation', { userMessage: 'Add a photo, video, voice note or PDF.' });
  if (file.sizeBytes > MAX_MEDIA_BYTES) throw new AppError('validation', { userMessage: 'Files must be 50 MB or smaller.' });
  const ext = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType.split('/')[1]!.replace('jpeg', 'jpg').replace('quicktime', 'mov');
  const path = `${complaintId}/${crypto.randomUUID()}.${ext}`;
  const up = await client.storage.from(COMPLAINT_FILE_BUCKET).upload(path, file.body, { contentType: file.mimeType });
  if (up.error) throw toAppError(up.error);
  return value(await client.rpc('register_complaint_attachment', { p_complaint: complaintId, p_storage_path: path, p_mime_type: file.mimeType, p_size_bytes: file.sizeBytes }));
}

export async function signedUrl(client: ItmClient, bucket: string, path: string, seconds = 300) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

// ---- staff
export async function acknowledgeComplaint(client: ItmClient, id: string, message?: string) {
  unwrap(await client.rpc('acknowledge_complaint', { p_complaint: id, p_message: message?.trim() || null }));
}
export async function assignComplaint(client: ItmClient, id: string, staffId: string) {
  unwrap(await client.rpc('assign_complaint', { p_complaint: id, p_staff: staffId }));
}
export async function escalateComplaint(client: ItmClient, id: string, reason: string) {
  unwrap(await client.rpc('escalate_complaint', { p_complaint: id, p_reason: reason }));
}
export async function setComplaintStatus(client: ItmClient, id: string, status: ComplaintStatus, resolution?: ComplaintResolution, notes?: string) {
  unwrap(await client.rpc('set_complaint_status', { p_complaint: id, p_status: status, p_resolution: resolution ?? null, p_notes: notes?.trim() || null }));
}
export async function closeDisputedJob(client: ItmClient, requestId: string, note: string) {
  unwrap(await client.rpc('close_disputed_job', { p_request: requestId, p_note: note }));
}
export async function staffReadConversation(client: ItmClient, complaintId: string, conversationId: string) {
  return (unwrap(await client.rpc('staff_read_conversation', { p_complaint: complaintId, p_conversation: conversationId })) as unknown as {
    created_at: string; sender_side: string; kind: string; body: string | null; has_file: boolean;
  }[]) ?? [];
}
