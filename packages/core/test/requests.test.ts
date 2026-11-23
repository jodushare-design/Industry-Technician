import { describe, expect, it } from 'vitest';
import { JOB_STATUS_LABELS, SYMPTOM_LABELS, findCopyViolations, mediaKindOf, mediaStoragePath, serviceRequestSchema } from '../src';

const uuid = '11111111-1111-4111-8111-111111111111';

describe('service request validation', () => {
  it('accepts a minimal request and blank optional fields', () => {
    const r = serviceRequestSchema.safeParse({
      factoryId: uuid,
      serviceType: 'breakdown',
      customerMachineId: '',
      machineTypeId: '',
      industryId: '',
      symptoms: ['machine_stopped'],
      description: 'Husker stopped this morning',
      urgency: 'emergency',
      preferredDate: '',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown symptoms, short descriptions and bad dates', () => {
    const base = { factoryId: uuid, serviceType: 'breakdown', symptoms: [], description: 'Husker stopped this morning', urgency: 'flexible' };
    expect(serviceRequestSchema.safeParse({ ...base, symptoms: ['exploding'] }).success).toBe(false);
    expect(serviceRequestSchema.safeParse({ ...base, description: 'broken' }).success).toBe(false);
    expect(serviceRequestSchema.safeParse({ ...base, preferredDate: 'tomorrow' }).success).toBe(false);
  });

  it('offers exactly the ten problem options from the brief', () => {
    expect(Object.values(SYMPTOM_LABELS)).toEqual([
      'Machine stopped',
      'Unusual noise',
      'Vibration',
      'Overheating',
      'Low output',
      'Electrical fault',
      'Automation fault',
      'Regular service',
      'Installation',
      'Other',
    ]);
  });

  it('has a label for all 17 job statuses, none with banned wording', () => {
    expect(Object.keys(JOB_STATUS_LABELS)).toHaveLength(17);
    for (const l of Object.values(JOB_STATUS_LABELS)) expect(findCopyViolations(l)).toEqual([]);
  });
});

describe('request media', () => {
  it('classifies photos, videos and voice notes and rejects others', () => {
    expect(mediaKindOf('image/jpeg')).toBe('photo');
    expect(mediaKindOf('video/mp4')).toBe('video');
    expect(mediaKindOf('audio/webm')).toBe('voice');
    expect(mediaKindOf('application/pdf')).toBeNull();
  });

  it('builds a path without the user file name', () => {
    expect(mediaStoragePath('req1', 'audio/mp4', 'abc')).toBe('req1/abc.m4a');
  });
});
