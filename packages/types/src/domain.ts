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
}

export type Channel = 'web' | 'android' | 'admin';
