import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from '@itm/types';

export type ItmClient = SupabaseClient<Database>;

/**
 * Throws if `key` is a privileged key. Client apps must only ever hold the
 * public key (legacy "anon" JWT or new "sb_publishable_…" key).
 */
export function assertPublicKey(key: string): void {
  if (!key) throw new Error('Supabase public key is missing. Check your environment configuration.');
  if (key.startsWith('sb_secret_')) {
    throw new Error('Refusing to use a Supabase SECRET key in a client application.');
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(base64UrlDecode(parts[1]!)) as { role?: string };
      if (payload.role && payload.role !== 'anon') {
        throw new Error(`Refusing to use a Supabase "${payload.role}" key in a client application.`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Refusing')) throw e;
      // not a JWT we can read — leave it to Supabase to reject
    }
  }
}

function base64UrlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return atob(b64); // available in browsers, Node 16+ and Hermes
}

/** Create a typed Supabase client with the public key. */
export function createItmClient(
  url: string,
  publicKey: string,
  options?: SupabaseClientOptions<'public'>,
): ItmClient {
  if (!url) throw new Error('Supabase URL is missing. Check your environment configuration.');
  assertPublicKey(publicKey);
  return createClient<Database>(url, publicKey, options);
}
