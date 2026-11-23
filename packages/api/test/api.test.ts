import { describe, expect, it, vi } from 'vitest';
import { AppError } from '@itm/core';
import { assertPublicKey, createOrganization, getMyContext, sendOtp, verifyOtp, type ItmClient } from '../src';

function jwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b(payload)}.sig`;
}

describe('assertPublicKey', () => {
  it('accepts anon JWTs and publishable keys', () => {
    expect(() => assertPublicKey(jwt({ role: 'anon' }))).not.toThrow();
    expect(() => assertPublicKey('sb_publishable_abc123')).not.toThrow();
  });

  it('refuses service-role JWTs and secret keys', () => {
    expect(() => assertPublicKey(jwt({ role: 'service_role' }))).toThrow(/Refusing/);
    expect(() => assertPublicKey('sb_secret_abc123')).toThrow(/Refusing/);
    expect(() => assertPublicKey('')).toThrow(/missing/);
  });
});

function fakeClient(overrides: Record<string, unknown>): ItmClient {
  return overrides as unknown as ItmClient;
}

describe('services', () => {
  it('sendOtp validates and normalises before calling Supabase', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = fakeClient({ auth: { signInWithOtp } });
    await expect(sendOtp(client, '98765 43210')).resolves.toBe('+919876543210');
    expect(signInWithOtp).toHaveBeenCalledWith({ phone: '+919876543210', options: { channel: 'sms' } });

    await expect(sendOtp(client, '123')).rejects.toBeInstanceOf(AppError);
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('verifyOtp turns a rejected code into a field error', async () => {
    const client = fakeClient({ auth: { verifyOtp: vi.fn().mockResolvedValue({ error: { status: 403, message: 'Token has expired or is invalid' } }) } });
    const err = await verifyOtp(client, '9876543210', '123456').catch((e: unknown) => e as AppError);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('validation');
    expect((err as AppError).fieldErrors?.token).toBeDefined();
  });

  it('maps RPC errors to AppError', async () => {
    const client = fakeClient({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ITM:account_not_active: Your account is not active. Contact support.' } }),
    });
    const err = await getMyContext(client).catch((e: unknown) => e as AppError);
    expect((err as AppError).code).toBe('business_rule');
    expect((err as AppError).userMessage).toBe('Your account is not active. Contact support.');
  });

  it('createOrganization validates the name locally', async () => {
    const rpc = vi.fn();
    await expect(createOrganization(fakeClient({ rpc }), ' A ')).rejects.toMatchObject({ code: 'validation' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
