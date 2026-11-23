/** HS256 tokens for the LOCAL demo backend only. The secret is public — never use it for real data. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const DEMO_SECRET = 'itm-local-demo-secret-NOT-FOR-PRODUCTION';
export const DEMO_OTP = '123456';
export const DEMO_PORT = Number(process.env.DEMO_PORT ?? 54321);

const b64u = (s) => Buffer.from(s).toString('base64url');

export function signJwt(payload) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const sig = createHmac('sha256', DEMO_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyJwt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const expected = createHmac('sha256', DEMO_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The public ("anon") key the apps use against the demo backend. */
export const ANON_KEY = signJwt({ role: 'anon', iss: 'itm-demo', iat: 1764000000, exp: 4102444800 });
