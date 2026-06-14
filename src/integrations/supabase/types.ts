export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          organization_id: string | null
          resource: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          resource?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          resource?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_files: {
        Row: {
          document_id: string
          file_name: string
          id: string
          is_current: boolean
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          document_id: string
          file_name: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
          version?: number
        }
        Update: {
          document_id?: string
          file_name?: string
          id?: string
          is_current?: boolean
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          document_id: string
          id: string
          metadata: Json
          method: string
          paid_at: string | null
          provider_ref: string | null
          recorded_by: string | null
          share_link_id: string | null
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          document_id: string
          id?: string
          metadata?: Json
          method?: string
          paid_at?: string | null
          provider_ref?: string | null
          recorded_by?: string | null
          share_link_id?: string | null
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          document_id?: string
          id?: string
          metadata?: Json
          method?: string
          paid_at?: string | null
          provider_ref?: string | null
          recorded_by?: string | null
          share_link_id?: string | null
          status?: string
        }
        Relationships: []
      }
      document_pdf_fields: {
        Row: {
          created_at: string
          document_id: string
          font_size: number
          height: number
          id: string
          kind: Database["public"]["Enums"]["pdf_field_kind"]
          label: string | null
          page_index: number
          position: number
          required: boolean
          updated_at: string
          value: string | null
          width: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          document_id: string
          font_size?: number
          height?: number
          id?: string
          kind: Database["public"]["Enums"]["pdf_field_kind"]
          label?: string | null
          page_index?: number
          position?: number
          required?: boolean
          updated_at?: string
          value?: string | null
          width?: number
          x?: number
          y?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          font_size?: number
          height?: number
          id?: string
          kind?: Database["public"]["Enums"]["pdf_field_kind"]
          label?: string | null
          page_index?: number
          position?: number
          required?: boolean
          updated_at?: string
          value?: string | null
          width?: number
          x?: number
          y?: number
        }
        Relationships: []
      }
      document_share_links: {
        Row: {
          allow_pay: boolean
          allow_sign: boolean
          created_at: string
          created_by: string
          document_id: string
          expires_at: string | null
          id: string
          max_views: number | null
          recipient_email: string | null
          recipient_name: string | null
          revoked_at: string | null
          token: string
          view_count: number
        }
        Insert: {
          allow_pay?: boolean
          allow_sign?: boolean
          created_at?: string
          created_by: string
          document_id: string
          expires_at?: string | null
          id?: string
          max_views?: number | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Update: {
          allow_pay?: boolean
          allow_sign?: boolean
          created_at?: string
          created_by?: string
          document_id?: string
          expires_at?: string | null
          id?: string
          max_views?: number | null
          recipient_email?: string | null
          recipient_name?: string | null
          revoked_at?: string | null
          token?: string
          view_count?: number
        }
        Relationships: []
      }
      document_signature_requests: {
        Row: {
          auth_method_required: string
          created_at: string
          decline_reason: string | null
          document_id: string
          expires_at: string | null
          id: string
          invited_by: string | null
          order_index: number
          sequential: boolean
          signature_id: string | null
          signature_level: Database["public"]["Enums"]["signature_level"]
          signed_at: string | null
          signer_email: string
          signer_name: string
          status: Database["public"]["Enums"]["signature_request_status"]
          token: string
          updated_at: string
        }
        Insert: {
          auth_method_required?: string
          created_at?: string
          decline_reason?: string | null
          document_id: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          order_index?: number
          sequential?: boolean
          signature_id?: string | null
          signature_level?: Database["public"]["Enums"]["signature_level"]
          signed_at?: string | null
          signer_email: string
          signer_name: string
          status?: Database["public"]["Enums"]["signature_request_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          auth_method_required?: string
          created_at?: string
          decline_reason?: string | null
          document_id?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          order_index?: number
          sequential?: boolean
          signature_id?: string | null
          signature_level?: Database["public"]["Enums"]["signature_level"]
          signed_at?: string | null
          signer_email?: string
          signer_name?: string
          status?: Database["public"]["Enums"]["signature_request_status"]
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      document_signatures: {
        Row: {
          auth_method: string
          consent_accepted_at: string | null
          consent_text: string | null
          country: string | null
          document_id: string
          evidence: Json
          id: string
          ip: string | null
          original_pdf_hash_sha256: string | null
          pdf_hash_sha256: string | null
          pdf_storage_path: string | null
          share_link_id: string | null
          signature_image_b64: string
          signature_level: Database["public"]["Enums"]["signature_level"]
          signed_at: string
          signer_email: string | null
          signer_name: string
          timezone: string | null
          user_agent: string | null
        }
        Insert: {
          auth_method?: string
          consent_accepted_at?: string | null
          consent_text?: string | null
          country?: string | null
          document_id: string
          evidence?: Json
          id?: string
          ip?: string | null
          original_pdf_hash_sha256?: string | null
          pdf_hash_sha256?: string | null
          pdf_storage_path?: string | null
          share_link_id?: string | null
          signature_image_b64: string
          signature_level?: Database["public"]["Enums"]["signature_level"]
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          timezone?: string | null
          user_agent?: string | null
        }
        Update: {
          auth_method?: string
          consent_accepted_at?: string | null
          consent_text?: string | null
          country?: string | null
          document_id?: string
          evidence?: Json
          id?: string
          ip?: string | null
          original_pdf_hash_sha256?: string | null
          pdf_hash_sha256?: string | null
          pdf_storage_path?: string | null
          share_link_id?: string | null
          signature_image_b64?: string
          signature_level?: Database["public"]["Enums"]["signature_level"]
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          timezone?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          active: boolean
          bic: string | null
          business_vertical: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          footer_html: string | null
          header_html: string | null
          iban: string | null
          id: string
          is_default: boolean
          legal_mentions: string | null
          logo_url: string | null
          name: string
          organization_id: string
          payment_terms: string | null
          primary_color: string | null
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          active?: boolean
          bic?: string | null
          business_vertical?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          footer_html?: string | null
          header_html?: string | null
          iban?: string | null
          id?: string
          is_default?: boolean
          legal_mentions?: string | null
          logo_url?: string | null
          name: string
          organization_id: string
          payment_terms?: string | null
          primary_color?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          active?: boolean
          bic?: string | null
          business_vertical?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          footer_html?: string | null
          header_html?: string | null
          iban?: string | null
          id?: string
          is_default?: boolean
          legal_mentions?: string | null
          logo_url?: string | null
          name?: string
          organization_id?: string
          payment_terms?: string | null
          primary_color?: string | null
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      document_workflow_steps: {
        Row: {
          approval_token: string | null
          approver_email: string | null
          approver_name: string | null
          approver_role: Database["public"]["Enums"]["app_role"] | null
          approver_user_id: string | null
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          name: string
          position: number
          required: boolean
          status: Database["public"]["Enums"]["workflow_step_status"]
          workflow_id: string
        }
        Insert: {
          approval_token?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          name: string
          position: number
          required?: boolean
          status?: Database["public"]["Enums"]["workflow_step_status"]
          workflow_id: string
        }
        Update: {
          approval_token?: string | null
          approver_email?: string | null
          approver_name?: string | null
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          name?: string
          position?: number
          required?: boolean
          status?: Database["public"]["Enums"]["workflow_step_status"]
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "document_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      document_workflows: {
        Row: {
          completed_at: string | null
          current_step: number
          document_id: string
          guest_session_id: string | null
          id: string
          started_at: string
          status: Database["public"]["Enums"]["document_status"]
          template_id: string | null
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          document_id: string
          guest_session_id?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["document_status"]
          template_id?: string | null
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          document_id?: string
          guest_session_id?: string | null
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["document_status"]
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_workflows_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_workflows_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_workflows_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          amount_ht: number | null
          amount_ttc: number | null
          archived_at: string | null
          archived_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          current_workflow_id: string | null
          description: string | null
          due_date: string | null
          guest_session_id: string | null
          id: string
          issue_date: string | null
          organization_id: string
          previous_status: Database["public"]["Enums"]["document_status"] | null
          reference: string | null
          retention_until: string | null
          status: Database["public"]["Enums"]["document_status"]
          tags: string[]
          third_party_email: string | null
          third_party_name: string | null
          title: string
          type: Database["public"]["Enums"]["document_type"]
          updated_at: string
        }
        Insert: {
          amount_ht?: number | null
          amount_ttc?: number | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_workflow_id?: string | null
          description?: string | null
          due_date?: string | null
          guest_session_id?: string | null
          id?: string
          issue_date?: string | null
          organization_id: string
          previous_status?:
            | Database["public"]["Enums"]["document_status"]
            | null
          reference?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tags?: string[]
          third_party_email?: string | null
          third_party_name?: string | null
          title: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string
        }
        Update: {
          amount_ht?: number | null
          amount_ttc?: number | null
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          current_workflow_id?: string | null
          description?: string | null
          due_date?: string | null
          guest_session_id?: string | null
          id?: string
          issue_date?: string | null
          organization_id?: string
          previous_status?:
            | Database["public"]["Enums"]["document_status"]
            | null
          reference?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          tags?: string[]
          third_party_email?: string | null
          third_party_name?: string | null
          title?: string
          type?: Database["public"]["Enums"]["document_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          claimed_at: string | null
          claimed_by_user_id: string | null
          created_at: string
          email: string
          id: string
          last_seen_at: string
          magic_token: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          last_seen_at?: string
          magic_token?: string
          token_expires_at?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          last_seen_at?: string
          magic_token?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          active: boolean
          country: string
          created_at: string
          guest_session_id: string | null
          id: string
          is_guest: boolean
          is_reseller: boolean
          name: string
          plan: string
          reseller_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          country?: string
          created_at?: string
          guest_session_id?: string | null
          id?: string
          is_guest?: boolean
          is_reseller?: boolean
          name: string
          plan?: string
          reseller_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          guest_session_id?: string | null
          id?: string
          is_guest?: boolean
          is_reseller?: boolean
          name?: string
          plan?: string
          reseller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_guest_session_id_fkey"
            columns: ["guest_session_id"]
            isOneToOne: false
            referencedRelation: "guest_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_template_fields: {
        Row: {
          created_at: string
          default_value: string | null
          font_size: number
          height: number
          id: string
          kind: Database["public"]["Enums"]["pdf_field_kind"]
          label: string | null
          page_index: number
          position: number
          required: boolean
          template_id: string
          version_id: string
          width: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          font_size?: number
          height?: number
          id?: string
          kind: Database["public"]["Enums"]["pdf_field_kind"]
          label?: string | null
          page_index?: number
          position?: number
          required?: boolean
          template_id: string
          version_id: string
          width?: number
          x?: number
          y?: number
        }
        Update: {
          created_at?: string
          default_value?: string | null
          font_size?: number
          height?: number
          id?: string
          kind?: Database["public"]["Enums"]["pdf_field_kind"]
          label?: string | null
          page_index?: number
          position?: number
          required?: boolean
          template_id?: string
          version_id?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdf_template_fields_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pdf_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdf_template_fields_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "pdf_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_template_versions: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          id: string
          is_current: boolean
          notes: string | null
          page_count: number
          size_bytes: number | null
          storage_path: string
          template_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          file_name: string
          id?: string
          is_current?: boolean
          notes?: string | null
          page_count?: number
          size_bytes?: number | null
          storage_path: string
          template_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          is_current?: boolean
          notes?: string | null
          page_count?: number
          size_bytes?: number | null
          storage_path?: string
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pdf_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pdf_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_templates: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          description: string | null
          document_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          id: string
          name: string
          organization_id: string
          page_count: number
          size_bytes: number | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name: string
          id?: string
          name: string
          organization_id: string
          page_count?: number
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          description?: string | null
          document_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          id?: string
          name?: string
          organization_id?: string
          page_count?: number
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdf_templates_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "pdf_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          id: string
          lang: string
          organization_id: string | null
          signature_image_b64: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          lang?: string
          organization_id?: string | null
          signature_image_b64?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          lang?: string
          organization_id?: string | null
          signature_image_b64?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_drafts: {
        Row: {
          created_at: string
          document_id: string
          has_placement: boolean
          id: string
          locked: boolean
          page_index: number
          sig_width_pt: number
          updated_at: string
          user_id: string
          width: number
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          document_id: string
          has_placement?: boolean
          id?: string
          locked?: boolean
          page_index?: number
          sig_width_pt?: number
          updated_at?: string
          user_id: string
          width?: number
          x?: number
          y?: number
        }
        Update: {
          created_at?: string
          document_id?: string
          has_placement?: boolean
          id?: string
          locked?: boolean
          page_index?: number
          sig_width_pt?: number
          updated_at?: string
          user_id?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          mode: string
          payload: Json | null
          payment_id: string | null
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          mode: string
          payload?: Json | null
          payment_id?: string | null
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          mode?: string
          payload?: Json | null
          payment_id?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_steps: {
        Row: {
          approver_role: Database["public"]["Enums"]["app_role"] | null
          approver_user_id: string | null
          created_at: string
          id: string
          name: string
          position: number
          required: boolean
          template_id: string
        }
        Insert: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          created_at?: string
          id?: string
          name: string
          position: number
          required?: boolean
          template_id: string
        }
        Update: {
          approver_role?: Database["public"]["Enums"]["app_role"] | null
          approver_user_id?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          required?: boolean
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          active: boolean
          business_vertical: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_vertical?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_vertical?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wysiwyg_drafts: {
        Row: {
          created_at: string
          created_by: string
          document_id: string | null
          html: string
          id: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          document_id?: string | null
          html?: string
          id?: string
          organization_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document_id?: string | null
          html?: string
          id?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      audit_log_event: {
        Args: {
          _action: string
          _metadata?: Json
          _organization_id: string
          _resource: string
          _user_id: string
        }
        Returns: undefined
      }
      get_user_org: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      list_audit_logs: {
        Args: {
          p_action?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_org?: string
          p_q?: string
          p_resource?: string
          p_to?: string
          p_user?: string
        }
        Returns: {
          action: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          organization_name: string
          resource: string
          total_count: number
          user_email: string
          user_full_name: string
          user_id: string
        }[]
      }
      list_pending_signature_documents: {
        Args: {
          p_dir?: string
          p_limit?: number
          p_offset?: number
          p_org?: string
          p_q?: string
          p_sort?: string
        }
        Returns: {
          declined_signers: number
          document_id: string
          document_reference: string
          document_title: string
          document_type: string
          earliest_expires_at: string
          next_signer_email: string
          next_signer_name: string
          oldest_pending_at: string
          organization_id: string
          organization_name: string
          pending_signers: number
          signed_signers: number
          total_count: number
          total_signers: number
        }[]
      }
      pending_signatures_orgs: {
        Args: never
        Returns: {
          organization_id: string
          organization_name: string
        }[]
      }
      pending_signatures_totals: {
        Args: never
        Returns: {
          documents: number
          organizations: number
          overdue: number
          pending_signers: number
        }[]
      }
      search_documents: {
        Args: {
          p_archived?: string
          p_currencies?: string[]
          p_dir?: string
          p_from_date?: string
          p_limit?: number
          p_max_amount?: number
          p_min_amount?: number
          p_offset?: number
          p_organization?: string
          p_payment?: string
          p_q?: string
          p_signature?: string
          p_sort?: string
          p_statuses?: string[]
          p_to_date?: string
          p_types?: string[]
        }
        Returns: {
          amount_ht: number
          amount_ttc: number
          archived_at: string
          created_at: string
          currency: string
          due_date: string
          has_payment: boolean
          has_signed: boolean
          id: string
          issue_date: string
          organization_id: string
          organization_name: string
          payments_total: number
          reference: string
          retention_until: string
          signers_signed: number
          signers_total: number
          status: string
          third_party_email: string
          third_party_name: string
          title: string
          total_count: number
          type: string
          updated_at: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "super_admin" | "reseller" | "admin_client" | "manager" | "user"
      document_status:
        | "draft"
        | "pending_validation"
        | "validated"
        | "rejected"
        | "archived"
        | "sent"
        | "signed"
        | "paid"
        | "partially_paid"
        | "cancelled"
      document_type:
        | "purchase_order"
        | "quote"
        | "invoice"
        | "contract"
        | "other"
      pdf_field_kind: "text" | "date" | "checkbox" | "signature" | "initials"
      signature_level: "ses" | "aes" | "qes"
      signature_request_status: "pending" | "signed" | "declined" | "cancelled"
      workflow_step_status: "pending" | "approved" | "rejected" | "skipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "reseller", "admin_client", "manager", "user"],
      document_status: [
        "draft",
        "pending_validation",
        "validated",
        "rejected",
        "archived",
        "sent",
        "signed",
        "paid",
        "partially_paid",
        "cancelled",
      ],
      document_type: [
        "purchase_order",
        "quote",
        "invoice",
        "contract",
        "other",
      ],
      pdf_field_kind: ["text", "date", "checkbox", "signature", "initials"],
      signature_level: ["ses", "aes", "qes"],
      signature_request_status: ["pending", "signed", "declined", "cancelled"],
      workflow_step_status: ["pending", "approved", "rejected", "skipped"],
    },
  },
} as const
