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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      hub_gmail_connections: {
        Row: {
          user_id: string
          email: string
          google_sub: string
          refresh_token_encrypted: string
          connected_at: string
        }
        Insert: {
          user_id: string
          email: string
          google_sub: string
          refresh_token_encrypted: string
          connected_at?: string
        }
        Update: {
          user_id?: string
          email?: string
          google_sub?: string
          refresh_token_encrypted?: string
          connected_at?: string
        }
        Relationships: []
      }
      hub_gmail_oauth_states: {
        Row: {
          user_id: string
          state_hash: string
          verifier_encrypted: string
          nonce: string
          selection: Json
          expires_at: string
        }
        Insert: {
          user_id: string
          state_hash: string
          verifier_encrypted: string
          nonce: string
          selection: Json
          expires_at: string
        }
        Update: {
          user_id?: string
          state_hash?: string
          verifier_encrypted?: string
          nonce?: string
          selection?: Json
          expires_at?: string
        }
        Relationships: []
      }
      hub_gmail_sends: {
        Row: {
          request_id: string
          user_id: string
          payload_hash: string
          status: string
          provider_message_id: string | null
          created_at: string
        }
        Insert: {
          request_id: string
          user_id: string
          payload_hash: string
          status: string
          provider_message_id?: string | null
          created_at?: string
        }
        Update: {
          request_id?: string
          user_id?: string
          payload_hash?: string
          status?: string
          provider_message_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      coaching_events: {
        Row: {
          action_note: string | null
          categoria_key: string
          categoria_label: string
          closed_at: string | null
          created_at: string
          deal_id: string
          deal_name: string | null
          event_key: string
          evidencia: string | null
          id: string
          meeting_date: string | null
          meeting_type: string | null
          owner_id: string | null
          stage: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_note?: string | null
          categoria_key: string
          categoria_label: string
          closed_at?: string | null
          created_at?: string
          deal_id: string
          deal_name?: string | null
          event_key: string
          evidencia?: string | null
          id?: string
          meeting_date?: string | null
          meeting_type?: string | null
          owner_id?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_note?: string | null
          categoria_key?: string
          categoria_label?: string
          closed_at?: string | null
          created_at?: string
          deal_id?: string
          deal_name?: string | null
          event_key?: string
          evidencia?: string | null
          id?: string
          meeting_date?: string | null
          meeting_type?: string | null
          owner_id?: string | null
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      mcp_grants: {
        Row: {
          authorization_id: string
          client_id: string
          created_at: string
          expires_at: string
          id: string
          mfa_verified_at: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          authorization_id: string
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          mfa_verified_at?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          authorization_id?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          mfa_verified_at?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      mfa_trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      report_cache: {
        Row: {
          build_ms: number
          created_at: string
          generated_at: string
          key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          build_ms?: number
          created_at?: string
          generated_at?: string
          key: string
          payload: Json
          updated_at?: string
        }
        Update: {
          build_ms?: number
          created_at?: string
          generated_at?: string
          key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      sales_notification_repositories: {
        Row: {
          payload: Json
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          payload?: Json
          revision?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          payload?: Json
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hub_claim_gmail_send: {
        Args: { p_user_id: string; p_request_id: string; p_payload_hash: string }
        Returns: string
      }

      has_active_mcp_grant: { Args: { _client_id: string }; Returns: boolean }
      save_sales_notifications: {
        Args: { p_payload: Json; p_revision: number; p_user: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
