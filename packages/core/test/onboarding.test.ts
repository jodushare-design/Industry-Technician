import { describe, expect, it } from 'vitest';
import {
  TELANGANA_DISTRICTS,
  badgeText,
  companyDetailsSchema,
  customerMachineSchema,
  distanceKm,
  documentStoragePath,
  documentUploadSchema,
  factorySchema,
  findCopyViolations,
  makeModelSchema,
  providerDetailsSchema,
  serviceAreaSchema,
} from '../src';

describe('onboarding validation', () => {
  it('has all 33 Telangana districts', () => {
    expect(TELANGANA_DISTRICTS).toHaveLength(33);
    expect(new Set(TELANGANA_DISTRICTS).size).toBe(33);
  });

  it('factory: requires name and locality; validates PIN, GSTIN and coordinate pairs', () => {
    expect(factorySchema.safeParse({ name: 'Sri Lakshmi Rice Mill', locality: 'Miryalaguda', pincode: '508207', gstin: '36abcde1234f1z5' }).success).toBe(true);
    expect(factorySchema.safeParse({ name: 'X', locality: 'Y' }).success).toBe(false);
    expect(factorySchema.safeParse({ name: 'Mill', locality: 'Area', pincode: '012345' }).success).toBe(false);
    expect(factorySchema.safeParse({ name: 'Mill', locality: 'Area', latitude: '17.4' }).success).toBe(false);
    expect(factorySchema.safeParse({ name: 'Mill', locality: 'Area', district: 'Gotham' }).success).toBe(false);
  });

  it('customer machine needs a machine type; make/model are optional', () => {
    const f = '11111111-1111-4111-8111-111111111111';
    expect(customerMachineSchema.safeParse({ factoryId: f, machineTypeId: f, manufacturerText: '', modelText: '' }).success).toBe(true);
    expect(customerMachineSchema.safeParse({ factoryId: f, machineTypeId: '' }).success).toBe(false);
  });

  it('provider details need a language; service area needs base area and radius', () => {
    expect(providerDetailsSchema.safeParse({ displayName: 'Ravi', languages: [], availability: 'available' }).success).toBe(false);
    expect(serviceAreaSchema.safeParse({ baseLocality: 'Nalgonda', serviceRadiusKm: '40', serviceDistricts: ['Nalgonda', 'Suryapet'] }).success).toBe(true);
    expect(serviceAreaSchema.safeParse({ baseLocality: 'Nalgonda', serviceRadiusKm: '0', serviceDistricts: [] }).success).toBe(false);
  });

  it('company details normalise the business phone', () => {
    const r = companyDetailsSchema.parse({ businessPhone: '98765 43210', businessAddress: 'Plot 4, IDA Nacharam' });
    expect(r.businessPhone).toBe('+919876543210');
  });

  it('make/model needs at least one value', () => {
    const s = '11111111-1111-4111-8111-111111111111';
    expect(makeModelSchema.safeParse({ providerSkillId: s }).success).toBe(false);
    expect(makeModelSchema.safeParse({ providerSkillId: s, modelText: 'As on plate' }).success).toBe(true);
  });

  it('documents: PDF/images up to 10 MB; storage path never uses the user file name', () => {
    expect(documentUploadSchema.safeParse({ docType: 'identity', title: 'ID', mimeType: 'application/pdf', sizeBytes: 1000 }).success).toBe(true);
    expect(documentUploadSchema.safeParse({ docType: 'identity', title: 'ID', mimeType: 'application/zip', sizeBytes: 1000 }).success).toBe(false);
    expect(documentUploadSchema.safeParse({ docType: 'licence', title: 'Lic', mimeType: 'image/png', sizeBytes: 11 * 1024 * 1024 }).success).toBe(false);
    expect(documentStoragePath('p1', 'image/jpeg', 'abc')).toBe('p1/abc.jpg');
  });
});

describe('badge wording', () => {
  const at = '2026-11-20T10:00:00Z';
  it('states exactly what was reviewed and when', () => {
    expect(badgeText({ kind: 'identity', label: null, valid_until: null, reviewed_at: at })).toBe('Identity checked (reviewed 20 Nov 2026)');
    expect(badgeText({ kind: 'certificate', label: 'Colour sorter training', valid_until: '2030-01-01', reviewed_at: at })).toBe(
      'Certificate reviewed: Colour sorter training, valid until 1 Jan 2030',
    );
  });
  it('never uses "certified" or other banned claims', () => {
    for (const kind of ['identity', 'business', 'certificate', 'licence', 'insurance'] as const) {
      expect(findCopyViolations(badgeText({ kind, label: 'X', valid_until: null, reviewed_at: at }))).toEqual([]);
    }
  });
});

describe('distanceKm', () => {
  it('Hyderabad to Nalgonda is about 90–110 km', () => {
    const d = distanceKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.0575, lng: 79.2684 });
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(110);
  });
});
