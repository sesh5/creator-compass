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
      benchmark_snapshots: {
        Row: {
          comparison_json: Json | null
          created_at: string
          id: string
          project_id: string
          target_channel_id: string
          target_videos_json: Json | null
          user_id: string
          user_videos_json: Json | null
          week_start: string
        }
        Insert: {
          comparison_json?: Json | null
          created_at?: string
          id?: string
          project_id: string
          target_channel_id: string
          target_videos_json?: Json | null
          user_id: string
          user_videos_json?: Json | null
          week_start: string
        }
        Update: {
          comparison_json?: Json | null
          created_at?: string
          id?: string
          project_id?: string
          target_channel_id?: string
          target_videos_json?: Json | null
          user_id?: string
          user_videos_json?: Json | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_targets: {
        Row: {
          added_at: string
          channel_id: string
          channel_name: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          channel_id: string
          channel_name: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          channel_id?: string
          channel_name?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_targets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cached_research: {
        Row: {
          channel_id: string
          channel_name: string | null
          fetched_at: string
          id: string
          outlier_videos_json: Json | null
          subscriber_count: number | null
          teardown_json: Json | null
        }
        Insert: {
          channel_id: string
          channel_name?: string | null
          fetched_at?: string
          id?: string
          outlier_videos_json?: Json | null
          subscriber_count?: number | null
          teardown_json?: Json | null
        }
        Update: {
          channel_id?: string
          channel_name?: string | null
          fetched_at?: string
          id?: string
          outlier_videos_json?: Json | null
          subscriber_count?: number | null
          teardown_json?: Json | null
        }
        Relationships: []
      }
      concept_outcomes: {
        Row: {
          concept_index: number
          concept_snapshot: Json
          content_plan_id: string | null
          created_at: string
          id: string
          marked_made_at: string | null
          measured_at: string | null
          niche_keywords: string[] | null
          outlier_score: number | null
          project_id: string
          status: string
          subs_gained: number | null
          updated_at: string
          user_id: string
          video_id: string | null
          video_url: string | null
          views: number | null
        }
        Insert: {
          concept_index: number
          concept_snapshot: Json
          content_plan_id?: string | null
          created_at?: string
          id?: string
          marked_made_at?: string | null
          measured_at?: string | null
          niche_keywords?: string[] | null
          outlier_score?: number | null
          project_id: string
          status?: string
          subs_gained?: number | null
          updated_at?: string
          user_id: string
          video_id?: string | null
          video_url?: string | null
          views?: number | null
        }
        Update: {
          concept_index?: number
          concept_snapshot?: Json
          content_plan_id?: string | null
          created_at?: string
          id?: string
          marked_made_at?: string | null
          measured_at?: string | null
          niche_keywords?: string[] | null
          outlier_score?: number | null
          project_id?: string
          status?: string
          subs_gained?: number | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
          video_url?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "concept_outcomes_content_plan_id_fkey"
            columns: ["content_plan_id"]
            isOneToOne: false
            referencedRelation: "content_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_outcomes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_plans: {
        Row: {
          concepts_json: Json
          created_at: string
          id: string
          project_id: string
          source_competitors: string[] | null
          user_id: string
        }
        Insert: {
          concepts_json: Json
          created_at?: string
          id?: string
          project_id: string
          source_competitors?: string[] | null
          user_id: string
        }
        Update: {
          concepts_json?: Json
          created_at?: string
          id?: string
          project_id?: string
          source_competitors?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_project_id: string | null
          channel_id: string | null
          channel_title: string | null
          channel_url: string | null
          created_at: string
          email: string | null
          goal: string | null
          id: string
          niche_keywords: string[] | null
          onboarded: boolean
          subscriber_count: number | null
          updated_at: string
        }
        Insert: {
          active_project_id?: string | null
          channel_id?: string | null
          channel_title?: string | null
          channel_url?: string | null
          created_at?: string
          email?: string | null
          goal?: string | null
          id: string
          niche_keywords?: string[] | null
          onboarded?: boolean
          subscriber_count?: number | null
          updated_at?: string
        }
        Update: {
          active_project_id?: string | null
          channel_id?: string | null
          channel_title?: string | null
          channel_url?: string | null
          created_at?: string
          email?: string | null
          goal?: string | null
          id?: string
          niche_keywords?: string[] | null
          onboarded?: boolean
          subscriber_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_project_id_fkey"
            columns: ["active_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          channel_id: string | null
          channel_title: string | null
          channel_url: string | null
          created_at: string
          goal: string
          id: string
          is_default: boolean
          name: string
          niche_keywords: string[]
          subscriber_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          channel_title?: string | null
          channel_url?: string | null
          created_at?: string
          goal?: string
          id?: string
          is_default?: boolean
          name: string
          niche_keywords?: string[]
          subscriber_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          channel_title?: string | null
          channel_url?: string | null
          created_at?: string
          goal?: string
          id?: string
          is_default?: boolean
          name?: string
          niche_keywords?: string[]
          subscriber_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teardown_chats: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          role: string
          sources_json: Json | null
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          sources_json?: Json | null
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          sources_json?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      title_lab_runs: {
        Row: {
          created_at: string
          id: string
          input_title: string
          project_id: string
          suggestions_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_title: string
          project_id: string
          suggestions_json: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_title?: string
          project_id?: string
          suggestions_json?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "title_lab_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          added_at: string
          channel_name: string
          competitor_channel_id: string
          id: string
          niche_tag: string | null
          project_id: string
          subscriber_count: number | null
          thumbnail_url: string | null
          user_id: string
          why_watch: string | null
        }
        Insert: {
          added_at?: string
          channel_name: string
          competitor_channel_id: string
          id?: string
          niche_tag?: string | null
          project_id: string
          subscriber_count?: number | null
          thumbnail_url?: string | null
          user_id: string
          why_watch?: string | null
        }
        Update: {
          added_at?: string
          channel_name?: string
          competitor_channel_id?: string
          id?: string
          niche_tag?: string | null
          project_id?: string
          subscriber_count?: number | null
          thumbnail_url?: string | null
          user_id?: string
          why_watch?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      youtube_api_cache: {
        Row: {
          cache_key: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          cache_key: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
