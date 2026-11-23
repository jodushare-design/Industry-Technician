import { describe, expect, it } from 'vitest';
import { approvalStatement, estimateDraftSchema, estimateTotal, findCopyViolations, toPaise } from '../src';

describe('estimate form', () => {
  it('normalises rupee amounts to two decimals and defaults blanks to zero', () => {
    const r = estimateDraftSchema.parse({ labour: '2500', parts: '4,800.5', travel: '', scope: ' Replace rolls ' });
    expect(r).toMatchObject({ labour: '2500.00', parts: '4800.50', travel: '0.00', inspection_fee: '0.00', scope: 'Replace rolls' });
  });

  it('rejects negative and badly formatted amounts', () => {
    expect(estimateDraftSchema.safeParse({ labour: '-5' }).success).toBe(false);
    expect(estimateDraftSchema.safeParse({ labour: '12.345' }).success).toBe(false);
    expect(estimateDraftSchema.safeParse({ labour: 'abc' }).success).toBe(false);
  });

  it('totals in paise without floating-point error', () => {
    expect(estimateTotal({ labour: '0.10', parts: '0.20', tax_amount: '1404' })).toBe(toPaise('1404.30'));
    expect(estimateTotal({ inspection_fee: '500' })).toBe(50000n);
  });
});

describe('approval statement', () => {
  it('names the provider, revision and total, and states responsibility and payment', () => {
    const s = approvalStatement({ providerName: 'Ravi Tech', revisionNo: 2, total: toPaise('8968'), kind: 'repair' });
    expect(s).toBe(
      'You are approving revision 2 from Ravi Tech for ₹8,968.00. Ravi Tech is an independent service provider and is responsible for the work described. Any extra work or parts need your separate approval. Payment is arranged directly with the provider.',
    );
    expect(findCopyViolations(s)).toEqual([]);
  });
});
