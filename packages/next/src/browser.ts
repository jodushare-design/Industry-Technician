'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { ItmClient } from '@itm/api';
import type { Database } from '@itm/types';
import { publicSupabaseEnv } from './env';

let client: ItmClient | undefined;

/** Singleton browser client. Session is stored in cookies so server code can read it. */
export function getBrowserSupabase(): ItmClient {
  if (!client) {
    const { url, publicKey } = publicSupabaseEnv();
    client = createBrowserClient<Database>(url, publicKey) as unknown as ItmClient;
  }
  return client;
}
