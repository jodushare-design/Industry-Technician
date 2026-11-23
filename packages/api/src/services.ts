/**
 * Service layer. Every function:
 *   1. validates input with the shared Zod schemas,
 *   2. calls Supabase (RLS + SQL functions enforce access),
 *   3. throws AppError on failure (never returns raw Supabase errors).
 *
 * The client type is structural so web (@supabase/ssr), admin and mobile
 * clients can all be passed in.
 */
import {
  AppError,
  basicProfileSchema,
  otpVerifySchema,
  parseOrThrow,
  phoneSignInSchema,
  toAppError,
  type BasicProfileInput,
  type Role,
} from '@itm/core';
import type { Channel, MyContext } from '@itm/types';
import type { ItmClient } from './client';

function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error);
  return res.data;
}

// ---------------------------------------------------------------- auth

/** Send a sign-in / sign-up OTP by SMS. Returns the normalised +91 number. */
export async function sendOtp(client: ItmClient, phone: string): Promise<string> {
  const input = parseOrThrow(phoneSignInSchema, { phone });
  const { error } = await client.auth.signInWithOtp({ phone: input.phone, options: { channel: 'sms' } });
  if (error) throw toAppError(error);
  return input.phone;
}

export async function verifyOtp(client: ItmClient, phone: string, token: string): Promise<void> {
  const input = parseOrThrow(otpVerifySchema, { phone, token });
  const { error } = await client.auth.verifyOtp({ phone: input.phone, token: input.token, type: 'sms' });
  if (error) {
    const e = toAppError(error);
    // Supabase reports wrong/expired codes as 4xx auth errors; give a clear message.
    if (e.code === 'unknown' || e.code === 'forbidden' || e.code === 'unauthenticated') {
      throw new AppError('validation', {
        message: e.message,
        userMessage: 'That code is wrong or has expired. Request a new one.',
        fieldErrors: { token: ['That code is wrong or has expired.'] },
        cause: error,
      });
    }
    throw e;
  }
}

export async function signOut(client: ItmClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw toAppError(error);
}

// ---------------------------------------------------------------- context

/** Profile, active roles and legal documents still to accept. Null when signed out. */
export async function getMyContext(client: ItmClient): Promise<MyContext | null> {
  const data = unwrap(await client.rpc('get_my_context'));
  return (data as unknown as MyContext | null) ?? null;
}

export function rolesOf(ctx: MyContext | null): Role[] {
  return ctx ? ctx.roles.map((r) => r.role) : [];
}

export async function registerRole(client: ItmClient, role: 'customer' | 'technician'): Promise<void> {
  unwrap(await client.rpc('register_role', { p_role: role }));
}

export async function createOrganization(client: ItmClient, name: string): Promise<string> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 200) {
    throw new AppError('validation', { fieldErrors: { name: ['Enter the company name (2–200 characters)'] } });
  }
  const id = unwrap(await client.rpc('create_organization', { p_name: trimmed }));
  if (!id) throw new AppError('unknown', { message: 'create_organization returned no id' });
  return id;
}

export async function acceptLegalDocuments(
  client: ItmClient,
  documentIds: readonly string[],
  channel: Channel,
  appVersion?: string,
): Promise<void> {
  for (const id of documentIds) {
    unwrap(await client.rpc('accept_legal_document', { p_document_id: id, p_channel: channel, p_app_version: appVersion ?? null }));
  }
}

export async function updateMyProfile(client: ItmClient, userId: string, input: BasicProfileInput): Promise<void> {
  const v = parseOrThrow(basicProfileSchema, input);
  const res = await client
    .from('profiles')
    .update({ full_name: v.fullName, email: v.email ?? null, preferred_language: v.preferredLanguage })
    .eq('id', userId)
    .select('id');
  const rows = unwrap(res);
  if (!rows || rows.length === 0) throw new AppError('forbidden');
}
