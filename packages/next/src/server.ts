import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getMyContext, rolesOf, type ItmClient } from '@itm/api';
import type { Role } from '@itm/core';
import type { Database, MyContext } from '@itm/types';
import { authCookieName, isSupabaseConfigured, publicSupabaseEnv } from './env';

/** Supabase client bound to the request's auth cookies (RLS applies as the signed-in user). */
export async function createServerSupabase(): Promise<ItmClient> {
  const { url, publicKey } = publicSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publicKey, {
    ...(authCookieName() && { cookieOptions: { name: authCookieName() } }),
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there. The proxy refreshes sessions.
        }
      },
    },
  }) as unknown as ItmClient;
}

export interface Session {
  client: ItmClient;
  context: MyContext;
  roles: Role[];
}

/**
 * Data-access-layer entry point: the signed-in user's context, or null.
 * Validates the session with Supabase Auth (getUser), not just the cookie.
 */
export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const client = await createServerSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const context = await getMyContext(client);
  if (!context) return null;
  return { client, context, roles: rolesOf(context) };
}
