/**
 * Hand-written mirror of supabase/migrations (public schema), in the same
 * shape `supabase gen types typescript` produces. When a Supabase project is
 * linked, run `npm run db:types` and switch index.ts to the generated file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'customer' | 'technician' | 'company_admin' | 'company_technician' | 'support_agent' | 'platform_admin';
export type AccountStatus = 'active' | 'suspended' | 'closed';
export type LegalReviewStatus = 'not_started' | 'in_review' | 'changes_requested' | 'approved' | 'withdrawn';

type Row<T> = T;
type NoInsert = never;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Row<{
          id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
          preferred_language: string;
          account_status: AccountStatus;
          status_reason: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: NoInsert;
        /** account_status / status_reason: platform admins only (DB trigger). */
        Update: {
          full_name?: string | null;
          email?: string | null;
          preferred_language?: string;
          account_status?: AccountStatus;
          status_reason?: string | null;
        };
        Relationships: [];
      };
      organizations: {
        Row: Row<{
          id: string;
          name: string;
          kind: 'service_company';
          account_status: AccountStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        }>;
        Insert: NoInsert;
        Update: { name?: string };
        Relationships: [];
      };
      user_roles: {
        Row: Row<{
          id: string;
          user_id: string;
          role: AppRole;
          organization_id: string | null;
          can_send_estimates: boolean;
          granted_by: string | null;
          granted_at: string;
          revoked_at: string | null;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      legal_documents: {
        Row: Row<{
          id: string;
          code: string;
          version: string;
          title: string;
          body_url: string | null;
          body_sha256: string | null;
          review_status: LegalReviewStatus;
          required_for: AppRole[];
          effective_from: string | null;
          created_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      terms_acceptances: {
        Row: Row<{
          id: string;
          user_id: string;
          legal_document_id: string;
          review_status_at_acceptance: LegalReviewStatus;
          channel: 'web' | 'android' | 'admin';
          app_version: string | null;
          accepted_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      audit_log: {
        Row: Row<{
          id: number;
          occurred_at: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      register_role: { Args: { p_role: AppRole }; Returns: undefined };
      create_organization: { Args: { p_name: string }; Returns: string };
      grant_staff_role: { Args: { p_user: string; p_role: AppRole }; Returns: undefined };
      revoke_role: { Args: { p_role_id: string }; Returns: undefined };
      accept_legal_document: {
        Args: { p_document_id: string; p_channel: string; p_app_version?: string | null };
        Returns: undefined;
      };
      get_my_context: { Args: Record<string, never>; Returns: Json };
    };
    Enums: {
      app_role: AppRole;
      account_status: AccountStatus;
      legal_review_status: LegalReviewStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
