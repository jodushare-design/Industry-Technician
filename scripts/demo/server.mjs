/**
 * LOCAL DEMO ONLY — a tiny stand-in for Supabase so the apps can be tried
 * without an account or Docker.
 *
 * It runs the real migrations and row-level security on an in-process
 * Postgres (PGlite, persisted in .data-demo/) and speaks the small part of
 * the Supabase HTTP API the apps use:
 *   /rest/v1/<table>      select (eq, neq, gt, gte, lt, lte, like, ilike, is, in), order, limit, range, count; insert/update/delete
 *   /rest/v1/rpc/<fn>     database functions
 *   /auth/v1/...          phone sign-in with the demo code 123456 (no SMS), user, refresh, logout
 *   /storage/v1/...       upload, signed URLs, delete (files kept in .data-demo/storage)
 * Realtime is not provided: the apps fall back to refreshing.
 *
 * Every request runs as the signed-in user (role "authenticated" with the
 * JWT claims), exactly like Supabase, so access rules are enforced.
 *
 * Never use this for real data. The signing secret is public.
 *
 *   npm run demo          start (seeds on first run)
 *   npm run demo:reset    wipe and re-seed
 */
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { seedDemo } from './seed.mjs';
import { DEMO_OTP, DEMO_PORT, DEMO_SECRET, signJwt, verifyJwt } from './jwt.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, '.data-demo');
const PORT = DEMO_PORT;

// ----------------------------------------------------------------- database
const reset = process.argv.includes('--reset');
if (reset && existsSync(DATA)) rmSync(DATA, { recursive: true, force: true });
mkdirSync(join(DATA, 'storage'), { recursive: true });
const fresh = !existsSync(join(DATA, 'pg', 'PG_VERSION'));
// Keep `date` values as 'YYYY-MM-DD' text, the way PostgREST returns them (PGlite would make JS Dates).
const db = new PGlite(join(DATA, 'pg'), { extensions: { pg_trgm }, parsers: { 1082: (v) => v } });
await db.waitReady;

// One connection: run requests one at a time.
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/** Run fn inside a transaction as the caller (anon or the signed-in user), like Supabase. */
async function asCaller(claims, fn) {
  return serial(async () => {
    await db.exec('begin');
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await db.exec(claims.role === 'authenticated' ? 'set local role authenticated' : 'set local role anon');
      const out = await fn();
      await db.exec('commit');
      return out;
    } catch (e) {
      await db.exec('rollback');
      throw e;
    }
  });
}

if (fresh) {
  console.log('Setting up the demo database (first run)…');
  await db.exec(readFileSync(join(ROOT, 'supabase', 'local', 'shim.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  await db.exec(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'));
  await db.exec(readFileSync(join(ROOT, 'supabase', 'seed', 'catalogue.sql'), 'utf8'));
  await seedDemo({ db, asCaller, storageDir: join(DATA, 'storage') });
  console.log('Demo data ready.');
}

// ----------------------------------------------------------------- helpers
const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (id) => {
  if (!IDENT.test(id)) throw httpError(400, 'PGRST100', `Invalid name: ${id}`);
  return `"${id}"`;
};
function httpError(status, code, message) {
  return Object.assign(new Error(message), { status, code, httpError: true });
}
const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? Number(x) : x));

const columnTypes = new Map();
async function typesOf(table) {
  if (!columnTypes.has(table)) {
    const r = await serial(() =>
      db.query(
        `select a.attname as name, format_type(a.atttypid, a.atttypmod) as type
         from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = $1 and a.attnum > 0 and not a.attisdropped`,
        [table],
      ),
    );
    columnTypes.set(table, new Map(r.rows.map((x) => [x.name, x.type])));
  }
  return columnTypes.get(table);
}

/** JS value → SQL parameter for a column/argument type. */
function toParam(value, type) {
  if (value === null || value === undefined) return null;
  if (type.endsWith('[]')) {
    const arr = Array.isArray(value) ? value : [value];
    return `{${arr.map((v) => (v === null ? 'NULL' : `"${String(v).replace(/(["\\])/g, '\\$1')}"`)).join(',')}}`;
  }
  if (type === 'jsonb' || type === 'json') return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Split a PostgREST list "(a,b,"c,d")" into values. */
function parseList(raw) {
  const s = raw.replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || s.endsWith(',')) out.push(cur);
  return out;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function buildWhere(params, types, values) {
  const clauses = [];
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    const col = q(key);
    const ctype = types.get(key) ?? 'text';
    let v = raw;
    let negate = false;
    if (v.startsWith('not.')) {
      negate = true;
      v = v.slice(4);
    }
    const dot = v.indexOf('.');
    const op = v.slice(0, dot);
    const arg = v.slice(dot + 1);
    let clause;
    const add = (x) => {
      values.push(x);
      return `$${values.length}`;
    };
    switch (op) {
      case 'eq': clause = `${col} = ${add(arg)}::${ctype}`; break;
      case 'neq': clause = `${col} <> ${add(arg)}::${ctype}`; break;
      case 'gt': clause = `${col} > ${add(arg)}::${ctype}`; break;
      case 'gte': clause = `${col} >= ${add(arg)}::${ctype}`; break;
      case 'lt': clause = `${col} < ${add(arg)}::${ctype}`; break;
      case 'lte': clause = `${col} <= ${add(arg)}::${ctype}`; break;
      case 'like': clause = `${col}::text like ${add(arg.replace(/\*/g, '%'))}`; break;
      case 'ilike': clause = `${col}::text ilike ${add(arg.replace(/\*/g, '%'))}`; break;
      case 'is':
        if (!['null', 'true', 'false'].includes(arg)) throw httpError(400, 'PGRST100', 'Invalid is value');
        clause = `${col} is ${arg}`;
        break;
      case 'in': clause = `${col}::text = any(${add(toParam(parseList(arg), 'text[]'))}::text[])`; break;
      default: throw httpError(400, 'PGRST100', `Unsupported filter ${op}`);
    }
    clauses.push(negate ? `not (${clause})` : clause);
  }
  return clauses.length ? `where ${clauses.join(' and ')}` : '';
}

function buildSelect(raw) {
  if (!raw || raw.trim() === '*') return '*';
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => (c === '*' ? '*' : q(c)))
    .join(', ');
}

function buildOrder(raw) {
  if (!raw) return '';
  const parts = raw.split(',').map((p) => {
    const [col, ...mods] = p.split('.');
    let s = q(col);
    if (mods.includes('desc')) s += ' desc';
    if (mods.includes('nullsfirst')) s += ' nulls first';
    if (mods.includes('nullslast')) s += ' nulls last';
    return s;
  });
  return `order by ${parts.join(', ')}`;
}

function claimsFrom(req) {
  const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const p = verifyJwt(auth);
  if (p?.role === 'authenticated' && p.sub) return { sub: p.sub, role: 'authenticated', phone: p.phone };
  return { role: 'anon' };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

function pgErrorResponse(e) {
  if (e.httpError) return { status: e.status, body: { code: e.code, message: e.message, details: null, hint: null } };
  const code = e.code ?? 'XX000';
  const status = code === '42501' ? 403 : code === 'P0001' ? 400 : code.startsWith('23') ? 409 : 400;
  return { status, body: { code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
}

// ----------------------------------------------------------------- REST
async function handleRest(req, res, url, claims) {
  const name = url.pathname.replace(/^\/rest\/v1\//, '');
  if (name.startsWith('rpc/')) return handleRpc(req, res, name.slice(4), claims);
  const table = name;
  if (!IDENT.test(table)) throw httpError(404, 'PGRST205', 'Unknown table');
  const types = await typesOf(table);
  if (types.size === 0) throw httpError(404, 'PGRST205', `Unknown table ${table}`);
  const params = [...url.searchParams.entries()];
  const prefer = req.headers.prefer ?? '';
  const values = [];
  const where = buildWhere(params, types, values);
  const select = buildSelect(url.searchParams.get('select'));

  if (req.method === 'GET' || req.method === 'HEAD') {
    let limit = url.searchParams.get('limit');
    let offset = url.searchParams.get('offset');
    const range = req.headers.range;
    if (range && /^\d+-\d+$/.test(range)) {
      const [a, b] = range.split('-').map(Number);
      offset = String(a);
      limit = String(b - a + 1);
    }
    const sql = `select ${select} from public.${q(table)} ${where} ${buildOrder(url.searchParams.get('order'))}
                 ${limit ? `limit ${Number(limit)}` : ''} ${offset ? `offset ${Number(offset)}` : ''}`;
    const out = await asCaller(claims, async () => {
      const rows = req.method === 'HEAD' ? [] : (await db.query(sql, values)).rows;
      const total = /count=exact/.test(prefer)
        ? Number((await db.query(`select count(*)::int as n from public.${q(table)} ${where}`, values)).rows[0].n)
        : null;
      return { rows, total };
    });
    const start = Number(offset ?? 0);
    const headers = { 'content-type': 'application/json' };
    if (out.total !== null) headers['content-range'] = `${out.rows.length ? `${start}-${start + out.rows.length - 1}` : '*'}/${out.total}`;
    res.writeHead(200, headers);
    return res.end(req.method === 'HEAD' ? undefined : json(out.rows));
  }

  const representation = /return=representation/.test(prefer);
  if (req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '[]');
    const rows = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const vals = [];
    const tuples = rows.map((r) => `(${cols.map((c) => {
      if (!(c in r)) return 'default';
      vals.push(toParam(r[c], types.get(c) ?? 'text'));
      return `$${vals.length}::${types.get(c) ?? 'text'}`;
    }).join(', ')})`);
    const sql = `insert into public.${q(table)} (${cols.map(q).join(', ')}) values ${tuples.join(', ')} returning ${select}`;
    const out = await asCaller(claims, async () => (await db.query(sql, vals)).rows);
    res.writeHead(201, { 'content-type': 'application/json' });
    return res.end(representation ? json(out) : '');
  }
  if (req.method === 'PATCH') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const sets = Object.entries(body).map(([c, v]) => {
      values.push(toParam(v, types.get(c) ?? 'text'));
      return `${q(c)} = $${values.length}::${types.get(c) ?? 'text'}`;
    });
    if (!sets.length) throw httpError(400, 'PGRST100', 'Nothing to update');
    const sql = `update public.${q(table)} set ${sets.join(', ')} ${where} returning ${select}`;
    const out = await asCaller(claims, async () => (await db.query(sql, values)).rows);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(representation ? json(out) : '');
  }
  if (req.method === 'DELETE') {
    const sql = `delete from public.${q(table)} ${where} returning ${select}`;
    const out = await asCaller(claims, async () => (await db.query(sql, values)).rows);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(representation ? json(out) : '');
  }
  throw httpError(405, 'PGRST100', 'Method not allowed');
}

const fnCache = new Map();
async function fnInfo(fn) {
  if (!fnCache.has(fn)) {
    const r = await serial(() =>
      db.query(
        `select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
                p.proretset as retset, format_type(p.prorettype, null) as rettype
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`,
        [fn],
      ),
    );
    fnCache.set(fn, r.rows[0] ?? null);
  }
  return fnCache.get(fn);
}

async function handleRpc(req, res, fn, claims) {
  if (!IDENT.test(fn)) throw httpError(404, 'PGRST202', 'Unknown function');
  const info = await fnInfo(fn);
  if (!info) throw httpError(404, 'PGRST202', `Unknown function ${fn}`);
  const args = JSON.parse((await readBody(req)).toString() || '{}');
  const names = info.names ?? [];
  const values = [];
  const passed = [];
  names.forEach((n, i) => {
    if (n in args) {
      values.push(toParam(args[n], info.types[i]));
      passed.push(`${q(n)} => $${values.length}::${info.types[i]}`);
    }
  });
  const call = `public.${q(fn)}(${passed.join(', ')})`;
  const sql = info.retset || info.rettype.startsWith('TABLE') ? `select * from ${call}` : `select ${call} as r`;
  const out = await asCaller(claims, async () => (await db.query(sql, values)).rows);
  res.writeHead(200, { 'content-type': 'application/json' });
  if (info.retset) return res.end(json(out));
  return res.end(info.rettype === 'void' ? '' : json(out[0]?.r ?? null));
}

// ----------------------------------------------------------------- auth
function userObject(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', phone: u.phone, email: u.email ?? '',
    phone_confirmed_at: u.created_at, app_metadata: { provider: 'phone', providers: ['phone'] },
    user_metadata: {}, identities: [], created_at: u.created_at, updated_at: u.created_at,
  };
}
function sessionFor(u) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub: u.id, role: 'authenticated', aud: 'authenticated', phone: u.phone, iat: now, exp: now + 3600, session_id: randomUUID() };
  return {
    access_token: signJwt(claims), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: signJwt({ sub: u.id, typ: 'refresh', iat: now, exp: now + 30 * 86400 }),
    user: userObject(u),
  };
}
const digits = (p) => String(p ?? '').replace(/\D/g, '');
async function userBy(where, value) {
  const r = await serial(() => db.query(`select id, phone, email, created_at from auth.users where ${where} = $1`, [value]));
  return r.rows[0] ?? null;
}

async function handleAuth(req, res, url) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : json(body));
  };
  const bad = (msg, code = 'validation_failed') => send(400, { code: 400, error_code: code, msg, message: msg });

  if (path === '/otp' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    if (!/^91[6-9]\d{9}$/.test(digits(body.phone))) return bad('Invalid phone number');
    console.log(`[demo] OTP requested for +${digits(body.phone)} — use code ${DEMO_OTP}`);
    return send(200, { message_id: null });
  }
  if (path === '/verify' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const phone = digits(body.phone);
    if (!/^91[6-9]\d{9}$/.test(phone)) return bad('Invalid phone number');
    if (body.token !== DEMO_OTP) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    let u = await userBy('phone', phone);
    if (!u) {
      await serial(() => db.query('insert into auth.users (id, phone) values ($1, $2)', [randomUUID(), phone]));
      u = await userBy('phone', phone);
    }
    return send(200, sessionFor(u));
  }
  if (path === '/user' && req.method === 'GET') {
    const p = verifyJwt(req.headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (!p?.sub) return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    const u = await userBy('id', p.sub);
    return u ? send(200, userObject(u)) : send(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
  }
  if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const body = JSON.parse((await readBody(req)).toString() || '{}');
    const p = verifyJwt(body.refresh_token);
    if (p?.typ !== 'refresh') return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    const u = await userBy('id', p.sub);
    return u ? send(200, sessionFor(u)) : send(400, { code: 400, error_code: 'user_not_found', msg: 'User not found' });
  }
  if (path === '/logout') return send(204);
  return send(404, { code: 404, msg: 'Not available in the demo' });
}

// ----------------------------------------------------------------- storage
const signFile = (bucket, path, exp) => createHmac('sha256', DEMO_SECRET).update(`${bucket}/${path}:${exp}`).digest('base64url');
const filePath = (bucket, path) => join(DATA, 'storage', bucket, ...path.split('/'));

async function handleStorage(req, res, url, claims) {
  const rest = decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\//, ''));
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(json(body));
  };
  const notFound = () => send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' });

  if (rest.startsWith('sign/') && req.method === 'POST') {
    const [, bucket, ...p] = rest.split('/');
    const path = p.join('/');
    const { expiresIn = 60 } = JSON.parse((await readBody(req)).toString() || '{}');
    const visible = await asCaller(claims, async () =>
      (await db.query('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, path])).rows.length > 0,
    );
    if (!visible) return notFound();
    const exp = Math.floor(Date.now() / 1000) + Number(expiresIn);
    return send(200, { signedURL: `/object/sign/${bucket}/${path}?token=${exp}.${signFile(bucket, path, exp)}` });
  }
  if (rest.startsWith('sign/') && req.method === 'GET') {
    const [, bucket, ...p] = rest.split('/');
    const path = p.join('/');
    const [exp, sig] = String(url.searchParams.get('token') ?? '').split('.');
    if (!exp || Number(exp) < Date.now() / 1000 || sig !== signFile(bucket, path, exp) || !existsSync(filePath(bucket, path))) {
      return send(400, { statusCode: '400', error: 'InvalidSignature', message: 'The signature is invalid or expired' });
    }
    const meta = (await serial(() => db.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, path]))).rows[0];
    res.writeHead(200, { 'content-type': meta?.metadata?.mimetype ?? 'application/octet-stream', 'cache-control': 'private, max-age=60' });
    return res.end(readFileSync(filePath(bucket, path)));
  }
  if (req.method === 'POST' || req.method === 'PUT') {
    const [bucket, ...p] = rest.split('/');
    const path = p.join('/');
    const raw = await readBody(req);
    let bytes = raw;
    let mime = req.headers['content-type'] ?? 'application/octet-stream';
    if (mime.startsWith('multipart/form-data')) {
      const form = await new Request('http://local/upload', { method: 'POST', headers: { 'content-type': mime }, body: raw }).formData();
      const file = [...form.values()].find((v) => typeof v === 'object' && v && 'arrayBuffer' in v);
      if (!file) return send(400, { statusCode: '400', error: 'invalid', message: 'No file' });
      bytes = Buffer.from(await file.arrayBuffer());
      mime = file.type || 'application/octet-stream';
    }
    const b = (await serial(() => db.query('select file_size_limit, allowed_mime_types from storage.buckets where id = $1', [bucket]))).rows[0];
    if (!b) return send(400, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (b.allowed_mime_types && !b.allowed_mime_types.includes(mime)) {
      return send(400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${mime} is not supported` });
    }
    if (b.file_size_limit && bytes.length > Number(b.file_size_limit)) {
      return send(400, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    }
    const id = randomUUID();
    try {
      await asCaller(claims, () =>
        db.query('insert into storage.objects (id, bucket_id, name, owner, metadata) values ($1, $2, $3, $4, $5)', [
          id, bucket, path, claims.sub ?? null, JSON.stringify({ mimetype: mime, size: bytes.length }),
        ]),
      );
    } catch (e) {
      if (e.code === '23505') return send(400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      return send(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    }
    mkdirSync(dirname(filePath(bucket, path)), { recursive: true });
    writeFileSync(filePath(bucket, path), bytes);
    return send(200, { Id: id, Key: `${bucket}/${path}` });
  }
  if (req.method === 'DELETE') {
    const bucket = rest.split('/')[0];
    const { prefixes = [] } = JSON.parse((await readBody(req)).toString() || '{}');
    const deleted = await asCaller(claims, async () =>
      (await db.query('delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name', [bucket, toParam(prefixes, 'text[]')])).rows,
    );
    for (const d of deleted) {
      try { unlinkSync(filePath(bucket, d.name)); } catch { /* already gone */ }
    }
    return send(200, deleted.map((d) => ({ name: d.name, bucket_id: bucket })));
  }
  return send(404, { statusCode: '404', error: 'not_found', message: 'Not available in the demo' });
}

// ----------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin ?? '*';
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*');
  res.setHeader('access-control-expose-headers', 'content-range');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url, claimsFrom(req));
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/storage/v1/object/')) return await handleStorage(req, res, url, claimsFrom(req));
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('Industrial Technician Marketplace — LOCAL DEMO backend. Not for real data.\n');
    }
    res.writeHead(404).end();
  } catch (e) {
    const { status, body } = pgErrorResponse(e);
    if (status >= 500 || !e.code) console.error(e);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(json(body));
  }
});
// No realtime in the demo: refuse websocket upgrades quickly (apps fall back to refreshing).
server.on('upgrade', (_req, socket) => socket.destroy());
server.listen(PORT, () => {
  console.log(`\nDemo backend on http://localhost:${PORT}  (sign-in code: ${DEMO_OTP})`);
  console.log('Run "npm run demo:env" once, then start the apps with npm run dev:web / dev:admin.\n');
});
