import { describe, expect, it } from 'vitest';
import { siteLocationSchema } from '../src/onboarding';

describe('siteLocationSchema (live factory location)', () => {
  it('accepts a fix in India and clearing both values', () => {
    expect(siteLocationSchema.parse({ latitude: '16.872', longitude: '79.563' })).toEqual({ latitude: 16.872, longitude: 79.563 });
    expect(siteLocationSchema.parse({ latitude: '', longitude: '' })).toEqual({ latitude: undefined, longitude: undefined });
  });

  it('refuses locations outside India and half-filled pairs', () => {
    expect(siteLocationSchema.safeParse({ latitude: '51.5', longitude: '-0.12' }).success).toBe(false);
    expect(siteLocationSchema.safeParse({ latitude: '16.8', longitude: '' }).success).toBe(false);
    expect(siteLocationSchema.safeParse({ latitude: 'abc', longitude: '79.5' }).success).toBe(false);
  });
});
