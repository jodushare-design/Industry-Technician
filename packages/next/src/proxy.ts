import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@itm/types';
import { isSupabaseConfigured, publicSupabaseEnv } from './env';

export interface SessionProxyOptions {
  /** Paths that need a signed-in user (prefix match). */
  protectedPrefixes: readonly string[];
  signInPath: string;
}

/**
 * Refresh the Supabase session cookie on every request and redirect
 * signed-out users away from protected paths. Authorization (roles) is
 * still checked in the page/data layer and by RLS — this is only a
 * convenience redirect.
 */
export async function refreshSession(request: NextRequest, opts: SessionProxyOptions): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return response;

  const { url, publicKey } = publicSupabaseEnv();
  const supabase = createServerClient<Database>(url, publicKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const needsAuth = opts.protectedPrefixes.some((p) => p === '/' || path === p || path.startsWith(`${p}/`));

  if (needsAuth && !data.user) {
    const target = request.nextUrl.clone();
    target.pathname = opts.signInPath;
    target.search = '';
    target.searchParams.set('next', path);
    return NextResponse.redirect(target);
  }
  return response;
}

/** Matcher that skips static assets. */
export const STATIC_ASSET_EXCLUSION = '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)';
