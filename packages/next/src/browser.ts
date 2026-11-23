'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { ItmClient } from '@itm/api';
import type { Database } from '@itm/types';
import { authCookieName, publicSupabaseEnv } from './env';

let client: ItmClient | undefined;

/** Singleton browser client. Session is stored in cookies so server code can read it. */
export function getBrowserSupabase(): ItmClient {
  if (!client) {
    const { url, publicKey } = publicSupabaseEnv();
    const name = authCookieName();
    client = createBrowserClient<Database>(url, publicKey, name ? { cookieOptions: { name } } : {}) as unknown as ItmClient;
  }
  return client;
}
