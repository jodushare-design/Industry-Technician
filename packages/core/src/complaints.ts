/** Job completion, site safety and complaints: labels and small rules. */

export const SAFETY_CHECKLIST = [
  ['access', 'Site access and timing agreed'],
  ['isolation', 'Machine isolation / lock-out-tag-out arranged by the site'],
  ['permits', 'Any permits needed (hot work, confined space, height) arranged'],
  ['ppe', 'Personal protective equipment agreed'],
  ['site_contact', 'Site contact person named'],
] as const;
export type SafetyItem = (typeof SAFETY_CHECKLIST)[number][0];

export const COMPLAINT_CATEGORY_LABELS = {
  no_show: 'Provider did not come',
  delay: 'Delay',
  price_dispute: 'Price disagreement',
  work_quality: 'Concern about the work',
  parts_issue: 'Problem with a part',
  conduct: 'Behaviour or harassment',
  safety_incident: 'Safety incident (injury, fire, shock, serious damage)',
  data_privacy: 'Privacy or personal data',
  platform_issue: 'Problem with the app',
  other: 'Something else',
} as const;
export type ComplaintCategory = keyof typeof COMPLAINT_CATEGORY_LABELS;

export const COMPLAINT_STATUS_LABELS = {
  open: 'Received',
  acknowledged: 'Acknowledged',
  in_progress: 'Being handled',
  resolved: 'Resolved',
  closed: 'Closed',
} as const;
export type ComplaintStatus = keyof typeof COMPLAINT_STATUS_LABELS;

/** How a complaint was handled — never a technical finding about the work. */
export const RESOLUTION_LABELS = {
  resolved_between_parties: 'Resolved between customer and provider',
  provider_action_taken: 'Provider took action',
  account_action_taken: 'Platform account action (warning or suspension)',
  referred_to_authorities: 'Referred to the authorities',
  no_action_needed: 'No further action needed',
  withdrawn_by_complainant: 'Withdrawn by the complainant',
} as const;
export type ComplaintResolution = keyof typeof RESOLUTION_LABELS;

export type SlaState = 'ok' | 'ack_overdue' | 'resolution_overdue' | 'done';

/** Grievance timelines: acknowledge in 24 h, resolution target 15 days (set by the database). */
export function complaintSla(
  c: { status: ComplaintStatus; ack_due_at: string; resolve_due_at: string; acknowledged_at: string | null },
  now = new Date(),
): SlaState {
  if (c.status === 'resolved' || c.status === 'closed') return 'done';
  if (!c.acknowledged_at && new Date(c.ack_due_at) < now) return 'ack_overdue';
  if (new Date(c.resolve_due_at) < now) return 'resolution_overdue';
  return 'ok';
}

/** Words that should route a complaint to the incident path (shown as a prompt in the form). */
export const INCIDENT_WORDS = /\b(injur|hurt|fire|burn|shock|electrocut|explo|gas leak|accident|collapse|fatal|death|died)/i;
