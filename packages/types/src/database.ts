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

export type ProviderKind = 'individual' | 'company' | 'company_member';
export type ProviderStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended';
export type SkillLevel = 'basic' | 'experienced' | 'expert';
export type AvailabilityStatus = 'available' | 'limited' | 'unavailable';
export type ProviderDocumentType = 'identity' | 'business_registration' | 'gst_certificate' | 'certificate' | 'licence' | 'insurance' | 'work_photo';
export type DocumentReviewStatus = 'pending' | 'accepted' | 'rejected';
export type VerificationKind = 'identity' | 'business' | 'certificate' | 'licence' | 'insurance';

export type JobStatus =
  | 'submitted' | 'finding_providers' | 'provider_contacted' | 'discussion' | 'estimate_sent' | 'awaiting_approval'
  | 'approved' | 'scheduled' | 'provider_travelling' | 'provider_arrived' | 'work_in_progress' | 'waiting_for_parts'
  | 'work_completed' | 'customer_confirmation_pending' | 'closed' | 'cancelled' | 'disputed';
export type ServiceType = 'breakdown' | 'maintenance' | 'installation' | 'inspection' | 'other';
export type RequestUrgency = 'emergency' | 'within_3_days' | 'this_week' | 'flexible';
export type InvitationStatus = 'invited' | 'accepted' | 'declined' | 'withdrawn' | 'not_selected' | 'closed';

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
      factories: {
        Row: Row<{
          id: string; owner_id: string; name: string; address_line: string | null; locality: string; district: string | null;
          city: string; state: string; pincode: string | null; latitude: number | null; longitude: number | null;
          gstin: string | null; is_active: boolean; created_at: string; updated_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; owner_id: string; name: string; address_line: string | null; locality: string; district: string | null;
          city: string; state: string; pincode: string | null; latitude: number | null; longitude: number | null;
          gstin: string | null; is_active: boolean; created_at: string; updated_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; owner_id: string; name: string; address_line: string | null; locality: string; district: string | null;
          city: string; state: string; pincode: string | null; latitude: number | null; longitude: number | null;
          gstin: string | null; is_active: boolean; created_at: string; updated_at: string;
        }>>;
        Relationships: [];
      };
      customer_machines: {
        Row: Row<{
          id: string; factory_id: string; owner_id: string; machine_type_id: string; manufacturer_id: string | null;
          model_id: string | null; manufacturer_text: string | null; model_text: string | null; label: string | null;
          year_installed: number | null; serial_number: string | null; notes: string | null; is_active: boolean;
          created_at: string; updated_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; factory_id: string; owner_id: string; machine_type_id: string; manufacturer_id: string | null;
          model_id: string | null; manufacturer_text: string | null; model_text: string | null; label: string | null;
          year_installed: number | null; serial_number: string | null; notes: string | null; is_active: boolean;
          created_at: string; updated_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; factory_id: string; owner_id: string; machine_type_id: string; manufacturer_id: string | null;
          model_id: string | null; manufacturer_text: string | null; model_text: string | null; label: string | null;
          year_installed: number | null; serial_number: string | null; notes: string | null; is_active: boolean;
          created_at: string; updated_at: string;
        }>>;
        Relationships: [];
      };
      provider_profiles: {
        Row: Row<{
          id: string; kind: ProviderKind; user_id: string | null; organization_id: string | null; display_name: string | null;
          bio: string | null; years_experience: number | null; languages: string[]; availability: AvailabilityStatus;
          availability_note: string | null; base_locality: string | null; base_district: string | null;
          base_latitude: number | null; base_longitude: number | null; service_radius_km: number; service_districts: string[];
          business_phone: string | null; business_email: string | null; business_address: string | null;
          business_pincode: string | null; gstin: string | null; registration_number: string | null;
          status: ProviderStatus; status_reason: string | null; submitted_at: string | null; reviewed_by: string | null;
          reviewed_at: string | null; archived_at: string | null; created_at: string; updated_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; kind: ProviderKind; user_id: string | null; organization_id: string | null; display_name: string | null;
          bio: string | null; years_experience: number | null; languages: string[]; availability: AvailabilityStatus;
          availability_note: string | null; base_locality: string | null; base_district: string | null;
          base_latitude: number | null; base_longitude: number | null; service_radius_km: number; service_districts: string[];
          business_phone: string | null; business_email: string | null; business_address: string | null;
          business_pincode: string | null; gstin: string | null; registration_number: string | null;
          status: ProviderStatus; status_reason: string | null; submitted_at: string | null; reviewed_by: string | null;
          reviewed_at: string | null; archived_at: string | null; created_at: string; updated_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; kind: ProviderKind; user_id: string | null; organization_id: string | null; display_name: string | null;
          bio: string | null; years_experience: number | null; languages: string[]; availability: AvailabilityStatus;
          availability_note: string | null; base_locality: string | null; base_district: string | null;
          base_latitude: number | null; base_longitude: number | null; service_radius_km: number; service_districts: string[];
          business_phone: string | null; business_email: string | null; business_address: string | null;
          business_pincode: string | null; gstin: string | null; registration_number: string | null;
          status: ProviderStatus; status_reason: string | null; submitted_at: string | null; reviewed_by: string | null;
          reviewed_at: string | null; archived_at: string | null; created_at: string; updated_at: string;
        }>>;
        Relationships: [];
      };
      provider_skills: {
        Row: Row<{
          id: string; provider_profile_id: string; catalogue_entity_id: string; years_experience: number; level: SkillLevel;
          notes: string | null; copied_from_skill_id: string | null; created_at: string; updated_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; provider_profile_id: string; catalogue_entity_id: string; years_experience: number; level: SkillLevel;
          notes: string | null; copied_from_skill_id: string | null; created_at: string; updated_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; provider_profile_id: string; catalogue_entity_id: string; years_experience: number; level: SkillLevel;
          notes: string | null; copied_from_skill_id: string | null; created_at: string; updated_at: string;
        }>>;
        Relationships: [];
      };
      provider_make_model_experience: {
        Row: Row<{
          id: string; provider_skill_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; years_experience: number | null; created_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; provider_skill_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; years_experience: number | null; created_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; provider_skill_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; years_experience: number | null; created_at: string;
        }>>;
        Relationships: [];
      };
      organization_invites: {
        Row: Row<{
          id: string; organization_id: string; phone: string; display_name: string | null; invited_by: string;
          created_at: string; accepted_at: string | null; accepted_user_id: string | null; revoked_at: string | null;
        }>;
        Insert: Partial<Row<{
          id: string; organization_id: string; phone: string; display_name: string | null; invited_by: string;
          created_at: string; accepted_at: string | null; accepted_user_id: string | null; revoked_at: string | null;
        }>>;
        Update: Partial<Row<{
          id: string; organization_id: string; phone: string; display_name: string | null; invited_by: string;
          created_at: string; accepted_at: string | null; accepted_user_id: string | null; revoked_at: string | null;
        }>>;
        Relationships: [];
      };
      provider_documents: {
        Row: Row<{
          id: string; provider_profile_id: string; doc_type: ProviderDocumentType; title: string; issuer: string | null;
          valid_until: string | null; storage_path: string; mime_type: string; size_bytes: number; uploaded_by: string;
          review_status: DocumentReviewStatus; review_note: string | null; reviewed_by: string | null;
          reviewed_at: string | null; created_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; provider_profile_id: string; doc_type: ProviderDocumentType; title: string; issuer: string | null;
          valid_until: string | null; storage_path: string; mime_type: string; size_bytes: number; uploaded_by: string;
          review_status: DocumentReviewStatus; review_note: string | null; reviewed_by: string | null;
          reviewed_at: string | null; created_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; provider_profile_id: string; doc_type: ProviderDocumentType; title: string; issuer: string | null;
          valid_until: string | null; storage_path: string; mime_type: string; size_bytes: number; uploaded_by: string;
          review_status: DocumentReviewStatus; review_note: string | null; reviewed_by: string | null;
          reviewed_at: string | null; created_at: string;
        }>>;
        Relationships: [];
      };
      verification_checks: {
        Row: Row<{
          id: string; provider_profile_id: string; kind: VerificationKind; passed: boolean; label: string | null;
          valid_until: string | null; document_id: string | null; note: string | null; reviewed_by: string;
          reviewed_at: string; revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
        }>;
        Insert: Partial<Row<{
          id: string; provider_profile_id: string; kind: VerificationKind; passed: boolean; label: string | null;
          valid_until: string | null; document_id: string | null; note: string | null; reviewed_by: string;
          reviewed_at: string; revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
        }>>;
        Update: Partial<Row<{
          id: string; provider_profile_id: string; kind: VerificationKind; passed: boolean; label: string | null;
          valid_until: string | null; document_id: string | null; note: string | null; reviewed_by: string;
          reviewed_at: string; revoked_at: string | null; revoked_by: string | null; revoke_reason: string | null;
        }>>;
        Relationships: [];
      };
      service_requests: {
        Row: Row<{
          id: string; reference: string; customer_id: string; factory_id: string; customer_machine_id: string | null;
          industry_id: string | null; machine_type_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; service_type: ServiceType; symptoms: string[];
          description: string; urgency: RequestUrgency; preferred_date: string | null; status: JobStatus;
          selected_provider_id: string | null; cancel_reason: string | null; created_at: string; updated_at: string; closed_at: string | null;
        }>;
        Insert: Partial<Row<{
          id: string; reference: string; customer_id: string; factory_id: string; customer_machine_id: string | null;
          industry_id: string | null; machine_type_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; service_type: ServiceType; symptoms: string[];
          description: string; urgency: RequestUrgency; preferred_date: string | null; status: JobStatus;
          selected_provider_id: string | null; cancel_reason: string | null; created_at: string; updated_at: string; closed_at: string | null;
        }>>;
        Update: Partial<Row<{
          id: string; reference: string; customer_id: string; factory_id: string; customer_machine_id: string | null;
          industry_id: string | null; machine_type_id: string; manufacturer_id: string | null; model_id: string | null;
          manufacturer_text: string | null; model_text: string | null; service_type: ServiceType; symptoms: string[];
          description: string; urgency: RequestUrgency; preferred_date: string | null; status: JobStatus;
          selected_provider_id: string | null; cancel_reason: string | null; created_at: string; updated_at: string; closed_at: string | null;
        }>>;
        Relationships: [];
      };
      job_status_events: {
        Row: Row<{
          id: number; request_id: string; from_status: JobStatus | null; to_status: JobStatus; actor_id: string | null; note: string | null; created_at: string;
        }>;
        Insert: Partial<Row<{
          id: number; request_id: string; from_status: JobStatus | null; to_status: JobStatus; actor_id: string | null; note: string | null; created_at: string;
        }>>;
        Update: Partial<Row<{
          id: number; request_id: string; from_status: JobStatus | null; to_status: JobStatus; actor_id: string | null; note: string | null; created_at: string;
        }>>;
        Relationships: [];
      };
      request_attachments: {
        Row: Row<{
          id: string; request_id: string; kind: 'photo' | 'video' | 'voice'; storage_path: string; mime_type: string;
          size_bytes: number; uploaded_by: string; created_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; request_id: string; kind: 'photo' | 'video' | 'voice'; storage_path: string; mime_type: string;
          size_bytes: number; uploaded_by: string; created_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; request_id: string; kind: 'photo' | 'video' | 'voice'; storage_path: string; mime_type: string;
          size_bytes: number; uploaded_by: string; created_at: string;
        }>>;
        Relationships: [];
      };
      match_results: {
        Row: Row<{
          id: string; request_id: string; provider_profile_id: string; rank: number; score: number; reasons: Json;
          distance_km: number | null; created_at: string;
        }>;
        Insert: Partial<Row<{
          id: string; request_id: string; provider_profile_id: string; rank: number; score: number; reasons: Json;
          distance_km: number | null; created_at: string;
        }>>;
        Update: Partial<Row<{
          id: string; request_id: string; provider_profile_id: string; rank: number; score: number; reasons: Json;
          distance_km: number | null; created_at: string;
        }>>;
        Relationships: [];
      };
      request_invitations: {
        Row: Row<{
          id: string; request_id: string; provider_profile_id: string; status: InvitationStatus; match_score: number | null;
          match_reasons: Json | null; invited_by: string; invited_at: string; responded_at: string | null;
          responded_by: string | null; decline_reason: string | null;
        }>;
        Insert: Partial<Row<{
          id: string; request_id: string; provider_profile_id: string; status: InvitationStatus; match_score: number | null;
          match_reasons: Json | null; invited_by: string; invited_at: string; responded_at: string | null;
          responded_by: string | null; decline_reason: string | null;
        }>>;
        Update: Partial<Row<{
          id: string; request_id: string; provider_profile_id: string; status: InvitationStatus; match_score: number | null;
          match_reasons: Json | null; invited_by: string; invited_at: string; responded_at: string | null;
          responded_by: string | null; decline_reason: string | null;
        }>>;
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
      company_invite_member: { Args: { p_org: string; p_phone: string; p_display_name?: string | null }; Returns: string };
      company_revoke_invite: { Args: { p_invite: string }; Returns: undefined };
      accept_company_invite: { Args: { p_invite: string }; Returns: string };
      company_remove_member: { Args: { p_member_profile: string; p_reason: string }; Returns: undefined };
      copy_company_skill_to_member: {
        Args: { p_company_skill: string; p_member_profile: string; p_years: number; p_level: SkillLevel };
        Returns: string;
      };
      register_provider_document: {
        Args: {
          p_profile: string; p_doc_type: ProviderDocumentType; p_storage_path: string; p_title: string;
          p_mime_type: string; p_size_bytes: number; p_issuer?: string | null; p_valid_until?: string | null;
        };
        Returns: string;
      };
      delete_provider_document: { Args: { p_document: string }; Returns: string };
      provider_profile_gaps: { Args: { p_profile: string }; Returns: string[] };
      submit_provider_profile: { Args: { p_profile: string }; Returns: undefined };
      record_verification_check: {
        Args: {
          p_profile: string; p_kind: VerificationKind; p_passed: boolean; p_label?: string | null;
          p_valid_until?: string | null; p_document?: string | null; p_note?: string | null;
        };
        Returns: string;
      };
      revoke_verification_check: { Args: { p_check: string; p_reason: string }; Returns: undefined };
      review_provider_document: { Args: { p_document: string; p_accept: boolean; p_note?: string | null }; Returns: undefined };
      set_provider_status: { Args: { p_profile: string; p_status: ProviderStatus; p_reason?: string | null }; Returns: undefined };
      get_provider_public: { Args: { p_profile: string }; Returns: Json };
      create_service_request: {
        Args: {
          p_factory: string; p_service_type: ServiceType; p_description: string; p_symptoms?: string[];
          p_customer_machine?: string | null; p_machine_type?: string | null; p_industry?: string | null;
          p_manufacturer_text?: string | null; p_model_text?: string | null; p_urgency?: RequestUrgency; p_preferred_date?: string | null;
        };
        Returns: string;
      };
      register_request_attachment: {
        Args: { p_request: string; p_kind: string; p_storage_path: string; p_mime_type: string; p_size_bytes: number };
        Returns: string;
      };
      match_providers: { Args: { p_request: string; p_limit?: number }; Returns: Json };
      invite_provider: { Args: { p_request: string; p_provider: string }; Returns: string };
      withdraw_invitation: { Args: { p_invitation: string }; Returns: undefined };
      respond_to_invitation: { Args: { p_invitation: string; p_accept: boolean; p_reason?: string | null }; Returns: undefined };
      select_provider: { Args: { p_request: string; p_provider: string }; Returns: undefined };
      cancel_service_request: { Args: { p_request: string; p_reason: string }; Returns: undefined };
      get_request_for_provider: { Args: { p_request: string }; Returns: Json };
      list_my_invitations: { Args: { p_include_closed?: boolean }; Returns: Json };
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
      provider_kind: ProviderKind;
      provider_status: ProviderStatus;
      skill_level: SkillLevel;
      availability_status: AvailabilityStatus;
      provider_document_type: ProviderDocumentType;
      document_review_status: DocumentReviewStatus;
      verification_kind: VerificationKind;
      job_status: JobStatus;
      service_type: ServiceType;
      request_urgency: RequestUrgency;
      invitation_status: InvitationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
