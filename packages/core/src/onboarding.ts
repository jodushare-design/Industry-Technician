/**
 * Onboarding: shared lists, validation and display rules for customers,
 * technicians and service companies. The database re-checks everything.
 */
import { z } from 'zod';
import { indianMobile, optionalEmail } from './validation';

export const TELANGANA_DISTRICTS = [
  'Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial', 'Jangaon', 'Jayashankar Bhupalpally',
  'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam', 'Kumuram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar',
  'Mancherial', 'Medak', 'Medchal-Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal',
  'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Rangareddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad',
  'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri',
] as const;

export const LANGUAGE_OPTIONS = [
  ['te', 'Telugu'],
  ['en', 'English'],
  ['hi', 'Hindi'],
  ['ur', 'Urdu'],
  ['ta', 'Tamil'],
  ['kn', 'Kannada'],
  ['mr', 'Marathi'],
  ['bn', 'Bengali'],
  ['or', 'Odia'],
  ['ml', 'Malayalam'],
] as const;
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number][0];
const LANGUAGE_CODES = LANGUAGE_OPTIONS.map(([c]) => c) as [LanguageCode, ...LanguageCode[]];

export const AVAILABILITY_LABELS = {
  available: 'Available for new work',
  limited: 'Limited availability',
  unavailable: 'Not taking new work',
} as const;

export const SKILL_LEVEL_LABELS = { basic: 'Basic', experienced: 'Experienced', expert: 'Expert' } as const;

export const PROVIDER_STATUS_LABELS = {
  draft: 'Draft — not visible to customers',
  submitted: 'Submitted — waiting for review',
  approved: 'Approved — visible to customers',
  rejected: 'Not approved — see the reason and resubmit',
  suspended: 'Suspended',
} as const;

export const DOCUMENT_TYPES = {
  identity: { label: 'Identity document', hint: 'Only you and platform reviewers can see this. Customers never see it.', who: 'person' },
  business_registration: { label: 'Business registration', hint: 'e.g. Udyam, shop & establishment, company or LLP certificate', who: 'company' },
  gst_certificate: { label: 'GST certificate', hint: 'If your business is GST-registered', who: 'company' },
  certificate: { label: 'Training or skill certificate', hint: 'Shown as a dated badge only after review', who: 'any' },
  licence: { label: 'Licence', hint: 'e.g. electrical contractor or supervisor licence, boiler repairer approval', who: 'any' },
  insurance: { label: 'Insurance policy', hint: 'e.g. public liability or employees’ compensation', who: 'any' },
  work_photo: { label: 'Work photo', hint: 'Photos of your work. Customers can see accepted photos. Avoid faces and confidential details.', who: 'any' },
} as const;
export type ProviderDocumentType = keyof typeof DOCUMENT_TYPES;

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const pincode = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit PIN code');
const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN');
const optional = <T extends z.ZodType>(s: T) => z.union([z.literal(''), s]).optional().transform((v) => (v === '' ? undefined : v));
const latitude = z.coerce.number().min(6).max(38);
const longitude = z.coerce.number().min(68).max(98);

export const factorySchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the factory or business name').max(200),
    addressLine: optional(z.string().trim().max(300)),
    locality: z.string().trim().min(2, 'Enter the area or village').max(100),
    district: optional(z.enum(TELANGANA_DISTRICTS)),
    city: z.string().trim().min(2).max(60).default('Hyderabad'),
    pincode: optional(pincode),
    gstin: optional(gstin),
    latitude: optional(latitude),
    longitude: optional(longitude),
  })
  .refine((f) => (f.latitude === undefined) === (f.longitude === undefined), { message: 'Location needs both latitude and longitude', path: ['latitude'] });
export type FactoryInput = z.input<typeof factorySchema>;

export const customerMachineSchema = z.object({
  factoryId: z.uuid(),
  machineTypeId: z.uuid('Choose the machine type (or "I don\'t know the machine name")'),
  manufacturerId: optional(z.uuid()),
  modelId: optional(z.uuid()),
  manufacturerText: optional(z.string().trim().max(200)),
  modelText: optional(z.string().trim().max(200)),
  label: optional(z.string().trim().max(100)),
  yearInstalled: optional(z.coerce.number().int().min(1950).max(2100)),
  serialNumber: optional(z.string().trim().max(100)),
  notes: optional(z.string().trim().max(1000)),
});
export type CustomerMachineInput = z.input<typeof customerMachineSchema>;

export const providerDetailsSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name as customers should see it').max(120),
  bio: optional(z.string().trim().max(1000)),
  yearsExperience: optional(z.coerce.number().int().min(0).max(60)),
  languages: z.array(z.enum(LANGUAGE_CODES)).min(1, 'Choose at least one language'),
  availability: z.enum(['available', 'limited', 'unavailable']),
  availabilityNote: optional(z.string().trim().max(200)),
});

export const serviceAreaSchema = z
  .object({
    baseLocality: z.string().trim().min(2, 'Enter your base area').max(100),
    baseDistrict: optional(z.enum(TELANGANA_DISTRICTS)),
    baseLatitude: optional(latitude),
    baseLongitude: optional(longitude),
    serviceRadiusKm: z.coerce.number().int().min(1).max(500),
    serviceDistricts: z.array(z.enum(TELANGANA_DISTRICTS)).max(40),
  })
  .refine((f) => (f.baseLatitude === undefined) === (f.baseLongitude === undefined), { message: 'Location needs both latitude and longitude', path: ['baseLatitude'] });

export const companyDetailsSchema = z.object({
  businessPhone: indianMobile,
  businessEmail: optionalEmail,
  businessAddress: z.string().trim().min(5, 'Enter the business address').max(300),
  businessPincode: optional(pincode),
  gstin: optional(gstin),
  registrationNumber: optional(z.string().trim().max(60)),
});

export const providerSkillSchema = z.object({
  catalogueEntityId: z.uuid('Choose a machine, category or skill'),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  level: z.enum(['basic', 'experienced', 'expert']),
  notes: optional(z.string().trim().max(500)),
});

export const makeModelSchema = z
  .object({
    providerSkillId: z.uuid(),
    manufacturerId: optional(z.uuid()),
    modelId: optional(z.uuid()),
    manufacturerText: optional(z.string().trim().max(200)),
    modelText: optional(z.string().trim().max(200)),
    yearsExperience: optional(z.coerce.number().int().min(0).max(60)),
  })
  .refine((m) => m.manufacturerId || m.modelId || m.manufacturerText || m.modelText, {
    message: 'Enter a make or a model',
    path: ['manufacturerText'],
  });

export const inviteMemberSchema = z.object({
  phone: indianMobile,
  displayName: optional(z.string().trim().min(2).max(120)),
});

export const documentUploadSchema = z.object({
  docType: z.enum(Object.keys(DOCUMENT_TYPES) as [ProviderDocumentType, ...ProviderDocumentType[]]),
  title: z.string().trim().min(2, 'Give the document a title').max(150),
  issuer: optional(z.string().trim().max(150)),
  validUntil: optional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')),
  mimeType: z.enum(ALLOWED_UPLOAD_TYPES, 'Upload a PDF, JPG, PNG or WebP file'),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'Files must be 10 MB or smaller'),
});

/** Safe object name: <profileId>/<uuid>.<ext> — never the user's file name (may contain personal data). */
export function documentStoragePath(profileId: string, mimeType: (typeof ALLOWED_UPLOAD_TYPES)[number], id: string): string {
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mimeType];
  return `${profileId}/${id}.${ext}`;
}

// ---------------------------------------------------------------- badges

export interface Badge {
  kind: 'identity' | 'business' | 'certificate' | 'licence' | 'insurance';
  label: string | null;
  valid_until: string | null;
  reviewed_at: string;
}

// Always Indian time, whatever the server's timezone.
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/**
 * Customer-facing wording for a verification badge. Factual: what was checked
 * and when. Never says "certified" or "verified expert" (business-model.md §6).
 */
export function badgeText(b: Badge): string {
  const when = `reviewed ${fmtDate(b.reviewed_at)}`;
  const until = b.valid_until ? `, valid until ${fmtDate(b.valid_until)}` : '';
  switch (b.kind) {
    case 'identity':
      return `Identity checked (${when})`;
    case 'business':
      return `Business details reviewed (${when})`;
    case 'certificate':
      return `Certificate reviewed: ${b.label ?? 'certificate'}${until}`;
    case 'licence':
      return `Licence reviewed: ${b.label ?? 'licence'}${until}`;
    case 'insurance':
      return `Insurance reviewed: ${b.label ?? 'policy'}${until}`;
  }
}

/** Great-circle distance in km (matching, "within your service area"). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A live-location fix for a site in India, or both empty to remove it. */
export const siteLocationSchema = z
  .object({ latitude: optional(latitude), longitude: optional(longitude) })
  .refine((f) => (f.latitude === undefined) === (f.longitude === undefined), {
    message: 'Location needs both latitude and longitude',
    path: ['latitude'],
  });
export type SiteLocationInput = z.input<typeof siteLocationSchema>;
