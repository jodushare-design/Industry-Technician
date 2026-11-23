/** Estimates: form validation, totals in paise, labels and the approval statement. */
import { z } from 'zod';
import { formatInr, sumPaise, toDecimalString, toPaise, type Paise } from './money';

export const ESTIMATE_KIND_LABELS = {
  inspection: 'Inspection only',
  repair: 'Repair / service',
  additional_work: 'Additional work',
} as const;
export type EstimateKind = keyof typeof ESTIMATE_KIND_LABELS;

export const ESTIMATE_STATUS_LABELS = {
  draft: 'Draft (not sent)',
  sent: 'Waiting for customer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  revision_requested: 'Changes requested',
  superseded: 'Replaced by a newer revision',
  withdrawn: 'Withdrawn by provider',
  expired: 'Expired',
} as const;

export const AMOUNT_FIELDS = [
  ['inspection_fee', 'Inspection fee'],
  ['visit_charge', 'Visit charge'],
  ['labour', 'Labour'],
  ['travel', 'Travel'],
  ['parts', 'Parts'],
  ['other_charges', 'Other charges'],
  ['tax_amount', 'Tax'],
] as const;
export type AmountField = (typeof AMOUNT_FIELDS)[number][0];

const amount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    const s = v === undefined || v === '' ? '0' : String(v);
    try {
      return toDecimalString(toPaise(s));
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter an amount in rupees, e.g. 1500 or 1500.50' });
      return z.NEVER;
    }
  });
const text = (max: number) => z.string().trim().max(max).optional().transform((v) => v ?? '');

export const estimateDraftSchema = z.object({
  inspection_fee: amount,
  visit_charge: amount,
  labour: amount,
  travel: amount,
  parts: amount,
  other_charges: amount,
  other_charges_note: text(200),
  tax_amount: amount,
  tax_note: text(200),
  scope: text(3000),
  exclusions: text(2000),
  expected_completion: text(200),
  valid_until: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')]).optional().transform((v) => v ?? ''),
  notes: text(1000),
});
export type EstimateDraftInput = z.input<typeof estimateDraftSchema>;
export type EstimateDraft = z.output<typeof estimateDraftSchema>;

export function estimateTotal(values: Partial<Record<AmountField, string | number | null | undefined>>): Paise {
  return sumPaise(AMOUNT_FIELDS.map(([k]) => {
    const v = values[k];
    try {
      return v === undefined || v === null || v === '' ? 0n : toPaise(String(v));
    } catch {
      return 0n;
    }
  }));
}

/**
 * Shown above the Approve button (risk-control-design.md §4). Wording pending
 * legal review (docs/legal-review/09-estimate-and-approval-terms.md).
 */
export function approvalStatement(o: { providerName: string; revisionNo: number; total: Paise; kind: EstimateKind }): string {
  const what = o.kind === 'inspection' ? 'an inspection' : o.kind === 'additional_work' ? 'additional work' : 'the work described';
  return (
    `You are approving revision ${o.revisionNo} from ${o.providerName} for ${formatInr(o.total)}. ` +
    `${o.providerName} is an independent service provider and is responsible for ${what}. ` +
    `Any extra work or parts need your separate approval. Payment is arranged directly with the provider.`
  );
}
