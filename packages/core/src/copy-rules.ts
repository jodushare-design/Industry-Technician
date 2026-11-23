/**
 * Marketplace wording rules (docs/business-model.md §5).
 * Used by the CI copy-lint over UI strings and by provider-profile checks.
 */

export interface CopyRule {
  id: string;
  pattern: RegExp;
  reason: string;
  suggestion: string;
}

export const BANNED_COPY: readonly CopyRule[] = [
  {
    id: 'our-staff',
    pattern: /\bour\s+(technicians?|engineers?|repair\s+team|mechanics?|electricians?|experts?)\b/i,
    reason: 'Implies the platform employs the providers.',
    suggestion: 'Use "independent service providers" or "service companies".',
  },
  {
    id: 'we-repair',
    pattern: /\bwe(?:'ll|\s+will)?\s+(repair|fix|service|maintain|diagnose)\b/i,
    reason: 'Implies the platform performs the work.',
    suggestion: 'Use "find a technician" or "contact a provider".',
  },
  {
    id: 'guarantee',
    pattern: /\b(guaranteed?|guarantees|assured)\b/i,
    reason: 'The platform does not guarantee repair outcomes.',
    suggestion: 'Remove the claim, or describe the specific check that was done.',
  },
  {
    id: 'certified',
    pattern: /\b(certified|verified\s+experts?)\b/i,
    reason: 'Only allowed in the reviewed-certificate badge template.',
    suggestion: 'Use the dated badge, e.g. "Certificate reviewed: <name>, valid until <date>".',
  },
];

export interface CopyViolation {
  ruleId: string;
  match: string;
  index: number;
  reason: string;
  suggestion: string;
}

/** Return every banned-wording match in `text`. */
export function findCopyViolations(text: string): CopyViolation[] {
  const out: CopyViolation[] = [];
  for (const rule of BANNED_COPY) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`);
    for (const m of text.matchAll(re)) {
      out.push({ ruleId: rule.id, match: m[0], index: m.index ?? 0, reason: rule.reason, suggestion: rule.suggestion });
    }
  }
  return out;
}
