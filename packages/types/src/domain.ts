import type { AccountStatus, AppRole, LegalReviewStatus } from './database';

/** Shape returned by the get_my_context() RPC. */
export interface MyContext {
  profile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    email: string | null;
    preferred_language: string;
    account_status: AccountStatus;
    created_at: string;
    updated_at: string;
  };
  roles: Array<{
    id: string;
    role: AppRole;
    organization_id: string | null;
    can_send_estimates: boolean;
  }>;
  pending_documents: Array<{
    id: string;
    code: string;
    version: string;
    title: string;
    review_status: LegalReviewStatus;
    body_url: string | null;
  }>;
  /** Provider profiles this user manages (own individual/member profile, companies they administer). */
  providers: Array<{
    id: string;
    kind: 'individual' | 'company' | 'company_member';
    display_name: string | null;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended';
    organization_id: string | null;
    organization_name: string | null;
  }>;
  /** Company invitations waiting for this user's mobile number. */
  invites: Array<{ id: string; organization_id: string; organization_name: string; created_at: string }>;
  factory_count: number;
}

/** Shape returned by get_provider_public(). Never contains documents, phone numbers or coordinates. */
export interface ProviderPublic {
  id: string;
  kind: 'individual' | 'company' | 'company_member';
  display_name: string | null;
  company_name: string | null;
  bio: string | null;
  years_experience: number | null;
  languages: string[];
  availability: 'available' | 'limited' | 'unavailable';
  availability_note: string | null;
  base_locality: string | null;
  base_district: string | null;
  service_radius_km: number;
  service_districts: string[];
  mobile_verified: boolean;
  badges: Array<{
    kind: 'identity' | 'business' | 'certificate' | 'licence' | 'insurance';
    label: string | null;
    valid_until: string | null;
    reviewed_at: string;
  }>;
  skills: Array<{
    key: string;
    kind: 'machine_type' | 'equipment_category' | 'service_skill';
    name: string;
    years_experience: number;
    level: 'basic' | 'experienced' | 'expert';
    makes: Array<{ manufacturer: string | null; model: string | null; years_experience: number | null; catalogued: boolean }>;
  }>;
  team_size: number | null;
  work_photos: Array<{ path: string; title: string }>;
}

export type Channel = 'web' | 'android' | 'admin';
