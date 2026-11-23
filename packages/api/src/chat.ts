/** In-app chat, notifications and consented contact sharing. */
import { AppError, MAX_MEDIA_BYTES, mediaKindOf, mediaStoragePath, toAppError } from '@itm/core';
import type { Tables } from '@itm/types';
import type { ItmClient } from './client';

export const CHAT_MEDIA_BUCKET = 'chat-media';
export type Message = Tables<'messages'>;

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

export async function listMessages(client: ItmClient, conversationId: string, limit = 200): Promise<Message[]> {
  const rows = unwrap(
    await client.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit),
  );
  return (rows ?? []).reverse();
}

/** Send a text message. Pass the same clientId when retrying so it is never duplicated. */
export async function sendText(client: ItmClient, conversationId: string, body: string, clientId: string): Promise<string> {
  const text = body.trim();
  if (!text) throw new AppError('validation', { userMessage: 'Type a message first.' });
  if (text.length > 4000) throw new AppError('validation', { userMessage: 'Messages can be up to 4000 characters.' });
  const id = unwrap(await client.rpc('send_message', { p_conversation: conversationId, p_kind: 'text', p_body: text, p_client_id: clientId }));
  if (!id) throw new AppError('unknown');
  return id;
}

export async function sendMedia(
  client: ItmClient,
  conversationId: string,
  file: { body: Blob | ArrayBuffer; mimeType: string; sizeBytes: number },
  clientId: string,
): Promise<string> {
  const kind = mediaKindOf(file.mimeType);
  if (!kind) throw new AppError('validation', { userMessage: 'Send a photo, a short video or a voice note.' });
  if (file.sizeBytes > MAX_MEDIA_BYTES) throw new AppError('validation', { userMessage: 'Files must be 50 MB or smaller.' });
  const path = mediaStoragePath(conversationId, file.mimeType, clientId);
  // Retry-safe: the object name comes from the clientId, so a retried upload reuses it.
  const up = await client.storage.from(CHAT_MEDIA_BUCKET).upload(path, file.body, { contentType: file.mimeType, upsert: false });
  if (up.error && !/exists|duplicate/i.test(up.error.message)) throw toAppError(up.error);
  const id = unwrap(
    await client.rpc('send_message', {
      p_conversation: conversationId,
      p_kind: kind,
      p_storage_path: path,
      p_mime_type: file.mimeType,
      p_size_bytes: file.sizeBytes,
      p_client_id: clientId,
    }),
  );
  if (!id) throw new AppError('unknown');
  return id;
}

export async function chatMediaUrl(client: ItmClient, path: string, seconds = 600): Promise<string | null> {
  const { data, error } = await client.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}

export async function markConversationRead(client: ItmClient, conversationId: string): Promise<void> {
  await client.rpc('mark_conversation_read', { p_conversation: conversationId });
}

/** When each participant last read this conversation (for "Read" ticks). */
export async function conversationReads(client: ItmClient, conversationId: string) {
  return unwrap(await client.from('conversation_reads').select('user_id, last_read_at').eq('conversation_id', conversationId)) ?? [];
}

export async function setContactSharing(client: ItmClient, conversationId: string, consent: boolean): Promise<void> {
  unwrap(await client.rpc('set_contact_sharing', { p_conversation: conversationId, p_consent: consent }));
}

export interface ConversationContacts {
  customer_consented: boolean;
  provider_consented: boolean;
  shared: boolean;
  customer_phone: string | null;
  provider_phone: string | null;
}

export async function getConversationContacts(client: ItmClient, conversationId: string): Promise<ConversationContacts> {
  return unwrap(await client.rpc('get_conversation_contacts', { p_conversation: conversationId })) as unknown as ConversationContacts;
}

/** wa.me link with no job details unless the user chose to include the reference. */
export function whatsappLink(phoneE164: string, reference?: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  return reference ? `https://wa.me/${digits}?text=${encodeURIComponent(`About request ${reference}`)}` : `https://wa.me/${digits}`;
}

export interface ConversationSummary {
  id: string;
  request_id: string;
  reference: string;
  machine_type: string;
  provider_id: string;
  provider_name: string | null;
  my_side: 'customer' | 'provider';
  open: boolean;
  last_message_at: string | null;
  unread: number;
}

export async function listMyConversations(client: ItmClient): Promise<ConversationSummary[]> {
  return (unwrap(await client.rpc('list_my_conversations')) as unknown as ConversationSummary[]) ?? [];
}

export async function assignCompanyMember(client: ItmClient, invitationId: string, memberProfileId: string | null): Promise<void> {
  unwrap(await client.rpc('assign_company_member', { p_invitation: invitationId, p_member: memberProfileId }));
}

// ---------------------------------------------------------------- notifications

export async function listNotifications(client: ItmClient, limit = 50) {
  return unwrap(await client.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)) ?? [];
}

export async function unreadNotificationCount(client: ItmClient): Promise<number> {
  const { count, error } = await client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw toAppError(error);
  return count ?? 0;
}

export async function markNotificationsRead(client: ItmClient, ids?: string[]): Promise<void> {
  let q = client.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids?.length) q = q.in('id', ids);
  unwrap(await q);
}
