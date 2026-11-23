/** Spare-parts coordination: labels and form validation. */
import { z } from 'zod';
import { toDecimalString, toPaise } from './money';

export const PART_STAGE_LABELS = {
  identified: 'Identified',
  awaiting_approval: 'Waiting for customer approval',
  approved: 'Approved',
  rejected: 'Not approved',
  arranged: 'Ordered / arranged',
  received: 'Received (collected or delivered)',
  installed: 'Installed',
  cancelled: 'Cancelled',
} as const;
export type PartStage = keyof typeof PART_STAGE_LABELS;

/** Factual compatibility wording — never implies the platform checked it. */
export const COMPATIBILITY_LABELS = {
  unknown: 'Compatibility not confirmed',
  confirmed_by_provider: 'Confirmed by the provider',
  confirmed_by_supplier: 'Confirmed by the supplier',
  not_compatible: 'Not compatible',
} as const;
export type PartCompatibility = keyof typeof COMPATIBILITY_LABELS;

export const AVAILABILITY_LABELS_PART = {
  unknown: 'Not checked yet',
  in_stock: 'In stock',
  to_order: 'To be ordered',
  unavailable: 'Not available',
} as const;

export const PART_UNITS = ['pcs', 'set', 'pair', 'm', 'kg', 'l'] as const;

/** The brief's workflow, for display. */
export const PART_WORKFLOW = [
  'Part identified',
  'Compatibility checked or marked unknown',
  'Supplier availability checked',
  'Price recorded',
  'Customer reviews the cost',
  'Customer approves or rejects',
  'Customer or provider arranges the part',
  'Part collected or delivered',
  'Part installed',
  'Part recorded in the completion report',
] as const;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const money = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    try {
      return toDecimalString(toPaise(v));
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter the price in rupees, e.g. 2400 or 2400.50' });
      return z.NEVER;
    }
  });

export const partFieldsSchema = z.object({
  part_name: z.string().trim().min(2, 'Name the part').max(200),
  part_number: opt(100),
  manufacturer_text: opt(200),
  customer_machine_id: z.union([z.literal(''), z.uuid()]).optional().transform((v) => v || undefined),
  model_text: opt(200),
  quantity: z.coerce.number().positive('Quantity must be more than 0').max(100000).default(1),
  unit: z.enum(PART_UNITS).default('pcs'),
  specifications: opt(2000),
  supplier_name: opt(200),
  supplier_contact: opt(200),
  availability: z.enum(['unknown', 'in_stock', 'to_order', 'unavailable']).optional(),
  unit_price: money,
  expected_delivery: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional().transform((v) => v || undefined),
});
export type PartFieldsInput = z.input<typeof partFieldsSchema>;
