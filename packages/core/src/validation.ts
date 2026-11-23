/**
 * Input validation shared by client forms and server code.
 * Server code must re-validate; database constraints are the final check.
 */
import { z } from 'zod';
import { AppError } from './errors';

/** Indian mobile number → E.164 (+91XXXXXXXXXX). Accepts spaces, dashes, leading 0 or +91/91. */
export const indianMobile = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s\-()]/g, ''))
  .transform((s) => s.replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .refine((s) => /^[6-9]\d{9}$/.test(s), { message: 'Enter a valid 10-digit Indian mobile number' })
  .transform((s) => `+91${s}`);

export const otpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const personName = z
  .string()
  .trim()
  .min(2, 'Name is too short')
  .max(100, 'Name is too long');

export const optionalEmail = z
  .union([z.literal(''), z.email('Enter a valid email')])
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined));

export const phoneSignInSchema = z.object({ phone: indianMobile });
export const otpVerifySchema = z.object({ phone: indianMobile, token: otpCode });

export const basicProfileSchema = z.object({
  fullName: personName,
  email: optionalEmail,
  preferredLanguage: z.enum(['en', 'te', 'hi', 'ur']).default('en'),
});

export type PhoneSignInInput = z.input<typeof phoneSignInSchema>;
export type OtpVerifyInput = z.input<typeof otpVerifySchema>;
export type BasicProfileInput = z.input<typeof basicProfileSchema>;

/** Parse or throw an AppError('validation') with per-field messages. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  throw new AppError('validation', { message: 'Validation failed', fieldErrors });
}
