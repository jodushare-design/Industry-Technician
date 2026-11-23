/** Service requests: labels, validation and media rules shared by all apps. */
import { z } from 'zod';

export const SERVICE_TYPE_LABELS = {
  breakdown: 'Repair — something is wrong',
  maintenance: 'Regular service / maintenance',
  installation: 'Installation or commissioning',
  inspection: 'Inspection or advice',
  other: 'Something else',
} as const;
export type ServiceType = keyof typeof SERVICE_TYPE_LABELS;

/** The problem options from the product brief. Customer descriptions, not diagnoses. */
export const SYMPTOM_LABELS = {
  machine_stopped: 'Machine stopped',
  unusual_noise: 'Unusual noise',
  vibration: 'Vibration',
  overheating: 'Overheating',
  low_output: 'Low output',
  electrical_fault: 'Electrical fault',
  automation_fault: 'Automation fault',
  regular_service: 'Regular service',
  installation: 'Installation',
  other: 'Other',
} as const;
export type Symptom = keyof typeof SYMPTOM_LABELS;

export const URGENCY_LABELS = {
  emergency: 'Urgent — machine down now',
  within_3_days: 'Within 2–3 days',
  this_week: 'This week',
  flexible: 'Flexible',
} as const;
export type Urgency = keyof typeof URGENCY_LABELS;

/** Customer-facing wording for each job status (Prompt 10 list). */
export const JOB_STATUS_LABELS = {
  submitted: 'Submitted',
  finding_providers: 'Finding providers',
  provider_contacted: 'Provider contacted',
  discussion: 'In discussion',
  estimate_sent: 'Estimate sent',
  awaiting_approval: 'Waiting for your approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  provider_travelling: 'Provider travelling',
  provider_arrived: 'Provider arrived',
  work_in_progress: 'Work in progress',
  waiting_for_parts: 'Waiting for parts',
  work_completed: 'Work completed',
  customer_confirmation_pending: 'Waiting for your confirmation',
  closed: 'Closed',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
} as const;
export type JobStatus = keyof typeof JOB_STATUS_LABELS;

export const INVITATION_STATUS_LABELS = {
  invited: 'Waiting for reply',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  not_selected: 'Not selected',
  closed: 'Closed',
} as const;

const symptomKeys = Object.keys(SYMPTOM_LABELS) as [Symptom, ...Symptom[]];
const blankToUndefined = <T extends z.ZodType>(s: T) => z.union([z.literal(''), s]).optional().transform((v) => (v === '' ? undefined : v));

export const serviceRequestSchema = z.object({
  factoryId: z.uuid('Choose the factory'),
  serviceType: z.enum(Object.keys(SERVICE_TYPE_LABELS) as [ServiceType, ...ServiceType[]]),
  customerMachineId: blankToUndefined(z.uuid()),
  machineTypeId: blankToUndefined(z.uuid()),
  industryId: blankToUndefined(z.uuid()),
  manufacturerText: blankToUndefined(z.string().trim().max(200)),
  modelText: blankToUndefined(z.string().trim().max(200)),
  symptoms: z.array(z.enum(symptomKeys)).max(10),
  description: z.string().trim().min(10, 'Describe the problem in a sentence or two (at least 10 characters)').max(2000),
  urgency: z.enum(Object.keys(URGENCY_LABELS) as [Urgency, ...Urgency[]]),
  preferredDate: blankToUndefined(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')),
});
export type ServiceRequestInput = z.input<typeof serviceRequestSchema>;

export const MEDIA_TYPES = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  video: ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'],
  voice: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-m4a', 'audio/3gpp'],
} as const;
export type MediaKind = keyof typeof MEDIA_TYPES;
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

export function mediaKindOf(mimeType: string): MediaKind | null {
  for (const [kind, types] of Object.entries(MEDIA_TYPES) as [MediaKind, readonly string[]][]) {
    if (types.includes(mimeType)) return kind;
  }
  return null;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'weba', 'audio/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/3gpp': '3gp',
};

/** <requestId>/<random>.<ext> — never the user's file name. */
export function mediaStoragePath(requestId: string, mimeType: string, id: string): string {
  return `${requestId}/${id}.${EXT[mimeType] ?? 'bin'}`;
}

export interface MatchResult {
  provider_id: string;
  kind: 'individual' | 'company';
  display_name: string | null;
  base_locality: string | null;
  years_experience: number | null;
  availability: 'available' | 'limited' | 'unavailable';
  score: number;
  rank: number;
  distance_km: number | null;
  reasons: string[];
  invitation_status: keyof typeof INVITATION_STATUS_LABELS | null;
}
