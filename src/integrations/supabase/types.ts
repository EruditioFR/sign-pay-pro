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
      document_signatures: {
        Row: {
          document_id: string
          id: string
          ip: string | null
          pdf_hash_sha256: string | null
          pdf_storage_path: string | null
          share_link_id: string | null
          signature_image_b64: string
          signed_at: string
          signer_email: string | null
          signer_name: string
          user_agent: string | null
        }
        Insert: {
          document_id: string
          id?: string
          ip?: string | null
          pdf_hash_sha256?: string | null
          pdf_storage_path?: string | null
          share_link_id?: string | null
          signature_image_b64: string
          signed_at?: string
          signer_email?: string | null
          signer_name: string
          user_agent?: string | null
        }
        Update: {
          document_id?: string
          id?: string
          ip?: string | null
          pdf_hash_sha256?: string | null
          pdf_storage_path?: string | null
          share_link_id?: string | null
          signature_image_b64?: string
          signed_at?: string
          signer_email?: string | null
          signer_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          active: boolean
          bic: string | null
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
          id: string
          started_at: string
          status: Database["public"]["Enums"]["document_status"]
          template_id: string | null
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          document_id: string
          id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["document_status"]
          template_id?: string | null
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          document_id?: string
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
          created_at: string
          created_by: string
          currency: string
          current_workflow_id: string | null
          description: string | null
          due_date: string | null
          id: string
          issue_date: string | null
          organization_id: string
          reference: string | null
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
          created_at?: string
          created_by: string
          currency?: string
          current_workflow_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          organization_id: string
          reference?: string | null
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
          created_at?: string
          created_by?: string
          currency?: string
          current_workflow_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string | null
          organization_id?: string
          reference?: string | null
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
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active: boolean
          country: string
          created_at: string
          id: string
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
          id?: string
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
          id?: string
          is_reseller?: boolean
          name?: string
          plan?: string
          reseller_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"] | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"] | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      document_type:
        | "purchase_order"
        | "quote"
        | "invoice"
        | "contract"
        | "other"
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
      ],
      document_type: [
        "purchase_order",
        "quote",
        "invoice",
        "contract",
        "other",
      ],
      workflow_step_status: ["pending", "approved", "rejected", "skipped"],
    },
  },
} as const
