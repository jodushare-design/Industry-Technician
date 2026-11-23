/**
 * Hand-written mirror of supabase/migrations (public schema), in the same
 * shape `supabase gen types typescript` produces. When a Supabase project is
 * linked, run `npm run db:types` and switch index.ts to the generated file.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = 'customer' | 'technician' | 'company_admin' | 'company_technician' | 'support_agent' | 'platform_admin';
export type AccountStatus = 'active' | 'suspended' | 'closed';
export type LegalReviewStatus = 'not_started' | 'in_review' | 'changes_requested' | 'approved' | 'withdrawn';
export type CatalogueKind =
  | 'industry'
  | 'process_stage'
  | 'discipline'
  | 'equipment_category'
  | 'machine_type'
  | 'manufacturer'
  | 'product_family'
  | 'model'
  | 'controller'
  | 'component'
  | 'spare_part'
  | 'fault'
  | 'service_skill';
export type CatalogueStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'merged' | 'retired';
export type VerificationStatus = 'unverified' | 'source_recorded' | 'verified' | 'disputed';
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type SourceType = 'platform_taxonomy' | 'manufacturer' | 'government' | 'industry_body' | 'distributor' | 'user_suggestion' | 'other';
export type RegulatedWork = 'electrical_installation' | 'boiler' | 'pressure_vessel' | 'lifting_equipment';
export type CatalogueRelation =
  | 'stage_of'
  | 'used_in'
  | 'in_category'
  | 'in_discipline'
  | 'in_family'
  | 'is_type'
  | 'has_component'
  | 'controlled_by'
  | 'part_for'
  | 'fault_of'
  | 'skill_for';

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
      catalogue_entities: {
        Row: Row<{
          id: string;
          key: string;
          kind: CatalogueKind;
          name: string;
          normalized_name: string;
          description: string | null;
          scope_id: string | null;
          attributes: Json;
          regulated_work: RegulatedWork | null;
          regulated_note: string | null;
          is_generic: boolean;
          sort_order: number;
          status: CatalogueStatus;
          verification_status: VerificationStatus;
          confidence: ConfidenceLevel | null;
          merged_into_id: string | null;
          import_batch_id: string | null;
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_aliases: {
        Row: Row<{ id: string; entity_id: string; alias: string; normalized: string; language: string; created_by: string | null; created_at: string }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_links: {
        Row: Row<{
          id: string;
          from_id: string;
          to_id: string;
          relation: CatalogueRelation;
          verification_status: VerificationStatus;
          confidence: ConfidenceLevel | null;
          created_by: string | null;
          created_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_sources: {
        Row: Row<{
          id: string;
          entity_id: string | null;
          link_id: string | null;
          source_type: SourceType;
          source_url: string | null;
          source_org: string | null;
          research_date: string;
          verification_date: string | null;
          confidence: ConfidenceLevel;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_suggestions: {
        Row: Row<{
          id: string;
          suggested_by: string;
          kind: CatalogueKind;
          name: string;
          details: string | null;
          related_entity_id: string | null;
          manufacturer_name: string | null;
          model_name: string | null;
          source_url: string | null;
          status: 'pending' | 'accepted' | 'rejected' | 'duplicate';
          resolved_entity_id: string | null;
          review_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_search_events: {
        Row: Row<{
          id: number;
          occurred_at: string;
          user_id: string | null;
          query: string;
          kinds: CatalogueKind[] | null;
          result_count: number;
          selected_entity_id: string | null;
          channel: string;
        }>;
        Insert: NoInsert;
        Update: never;
        Relationships: [];
      };
      catalogue_import_batches: {
        Row: Row<{
          id: string;
          file_name: string;
          format: 'csv' | 'json' | 'seed' | 'manual';
          row_count: number;
          created_count: number;
          existing_count: number;
          duplicate_count: number;
          error_count: number;
          report: Json;
          imported_by: string | null;
          imported_at: string;
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
      search_catalogue: {
        Args: { p_query: string; p_kinds?: CatalogueKind[] | null; p_limit?: number; p_channel?: string };
        Returns: Json;
      };
      log_catalogue_selection: { Args: { p_event_id: number; p_entity_id: string }; Returns: undefined };
      suggest_catalogue_entry: {
        Args: {
          p_kind: CatalogueKind;
          p_name: string;
          p_details?: string | null;
          p_related_entity?: string | null;
          p_manufacturer_name?: string | null;
          p_model_name?: string | null;
          p_source_url?: string | null;
        };
        Returns: string;
      };
      catalogue_resolve: { Args: { p_id: string }; Returns: string };
      catalogue_import: { Args: { p_rows: Json; p_file_name: string; p_format: string; p_dry_run?: boolean }; Returns: Json };
      catalogue_set_status: { Args: { p_ids: string[]; p_status: CatalogueStatus; p_note?: string | null }; Returns: number };
      catalogue_set_verification: {
        Args: { p_id: string; p_status: VerificationStatus; p_confidence: ConfidenceLevel | null };
        Returns: undefined;
      };
      catalogue_add_alias: { Args: { p_entity: string; p_alias: string; p_language?: string }; Returns: string };
      catalogue_remove_alias: { Args: { p_alias_id: string }; Returns: undefined };
      catalogue_add_source: {
        Args: {
          p_entity: string;
          p_source_type: SourceType;
          p_source_url: string | null;
          p_source_org: string | null;
          p_research_date: string | null;
          p_verification_date: string | null;
          p_confidence: ConfidenceLevel | null;
          p_notes: string | null;
        };
        Returns: string;
      };
      catalogue_find_duplicates: {
        Args: { p_entity: string; p_threshold?: number };
        Returns: { id: string; key: string; name: string; status: CatalogueStatus; similarity: number; matched_on: string }[];
      };
      catalogue_merge: { Args: { p_from: string; p_into: string; p_note: string }; Returns: undefined };
      catalogue_search_report: { Args: { p_days?: number }; Returns: Json };
      catalogue_resolve_suggestion: {
        Args: { p_id: string; p_action: 'create' | 'link' | 'reject'; p_entity?: string | null; p_note?: string | null };
        Returns: string | null;
      };
    };
    Enums: {
      app_role: AppRole;
      account_status: AccountStatus;
      legal_review_status: LegalReviewStatus;
      catalogue_kind: CatalogueKind;
      catalogue_status: CatalogueStatus;
      verification_status: VerificationStatus;
      confidence_level: ConfidenceLevel;
      source_type: SourceType;
      catalogue_relation: CatalogueRelation;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
