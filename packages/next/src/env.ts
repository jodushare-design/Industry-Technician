/**
 * Public Supabase configuration for the Next.js apps.
 *
 * Only NEXT_PUBLIC_* values are read here. The service-role / secret key is
 * never read by the web or admin apps (CI guard: scripts/guards).
 *
 * Next.js inlines NEXT_PUBLIC_* only when accessed as literal property names,
 * so each variable is read explicitly.
 */
import { assertPublicKey } from '@itm/api';

export interface PublicSupabaseEnv {
  url: string;
  publicKey: string;
}

export function publicSupabaseEnv(): PublicSupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  if (!url || !publicKey) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see docs/setup.md).',
    );
  }
  assertPublicKey(publicKey);
  return { url, publicKey };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
