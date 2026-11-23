/**
 * In-process Postgres (PGlite) with a minimal Supabase shim, so migrations
 * and RLS can be tested without Docker or a hosted project.
 *
 * The shim reproduces the parts of Supabase our migrations depend on:
 *   - roles anon / authenticated / service_role
 *   - auth.users and auth.uid() (reads request.jwt.claims like Supabase)
 *   - Supabase's default grants on the public schema
 *
 * It is NOT a full Supabase. Run the same suite against a hosted dev project
 * before release (docs/setup.md → "RLS tests against Supabase").
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const SUPABASE_SHIM = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    phone text unique,
    email text,
    raw_user_meta_data jsonb default '{}'::jsonb,
    created_at timestamptz default now()
  );
  -- Same definitions as Supabase's auth schema (empty settings are treated as unset).
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create function auth.role() returns text language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    )::text
  $$;
  grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createTestDb(opts: { seed?: boolean } = {}): Promise<Db> {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  if (opts.seed) await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  return db;
}

let phoneCounter = 9_000_000_100;

/** Create an auth user (as the Auth service would) and return its id. */
export async function createUser(db: Db, phone?: string): Promise<string> {
  const id = randomUUID();
  const p = phone ?? `91${phoneCounter++}`;
  await db.query('insert into auth.users (id, phone) values ($1, $2)', [id, p]);
  return id;
}

/** Grant a role directly as the operator (bypasses RLS — test setup only). */
export async function grantRole(db: Db, userId: string, role: string, orgId: string | null = null): Promise<void> {
  await db.query('insert into public.user_roles (user_id, role, organization_id) values ($1, $2::public.app_role, $3)', [
    userId,
    role,
    orgId,
  ]);
}

/**
 * Run `fn` as a signed-in user (role `authenticated`, auth.uid() = userId),
 * or as anon when userId is null. Always rolled back, so tests don't leak state.
 */
export async function as<T>(db: Db, userId: string | null, fn: (q: Db['query']) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await db.exec('begin');
    const claims = userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : JSON.stringify({ role: 'anon' });
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await db.exec(userId ? 'set local role authenticated' : 'set local role anon');
    result = await fn(db.query.bind(db) as Db['query']);
  } finally {
    await db.exec('rollback');
  }
  return result;
}

/** Same as `as` but commits — for multi-step scenarios that build on earlier steps. */
export async function asCommit<T>(db: Db, userId: string, fn: (q: Db['query']) => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    await db.exec('set local role authenticated');
    const r = await fn(db.query.bind(db) as Db['query']);
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
