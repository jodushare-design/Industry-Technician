import { describe, expect, it } from 'vitest';
import { COMPLAINT_CATEGORY_LABELS, INCIDENT_WORDS, RESOLUTION_LABELS, SAFETY_CHECKLIST, complaintSla, findCopyViolations } from '../src';

describe('complaint rules', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const base = { status: 'open' as const, acknowledged_at: null, ack_due_at: '2026-11-23T12:00:00Z', resolve_due_at: '2026-12-07T12:00:00Z' };

  it('flags overdue acknowledgement and resolution', () => {
    expect(complaintSla(base, now)).toBe('ok');
    expect(complaintSla({ ...base, ack_due_at: '2026-11-22T11:00:00Z' }, now)).toBe('ack_overdue');
    expect(complaintSla({ ...base, status: 'in_progress', acknowledged_at: '2026-11-22T10:00:00Z', resolve_due_at: '2026-11-22T11:00:00Z' }, now)).toBe('resolution_overdue');
    expect(complaintSla({ ...base, status: 'resolved' }, now)).toBe('done');
  });

  it('spots incident wording', () => {
    expect(INCIDENT_WORDS.test('The operator got an electric shock')).toBe(true);
    expect(INCIDENT_WORDS.test('He came two hours late')).toBe(false);
  });

  it('resolution wording is about handling, never a technical verdict or guarantee', () => {
    for (const l of [...Object.values(RESOLUTION_LABELS), ...Object.values(COMPLAINT_CATEGORY_LABELS), ...SAFETY_CHECKLIST.map(([, l]) => l)]) {
      expect(findCopyViolations(l)).toEqual([]);
      expect(l).not.toMatch(/fault (was|is) (the )?(provider|technician)/i);
    }
  });
});
