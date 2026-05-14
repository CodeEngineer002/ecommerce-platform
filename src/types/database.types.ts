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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      address_country_rules: {
        Row: {
          allows_free_text_city: boolean
          allows_free_text_state: boolean
          city_label: string
          city_required: boolean
          country_id: string
          metadata: Json
          phone_required: boolean
          postal_code_example: string | null
          postal_code_label: string
          postal_code_regex: string | null
          postal_code_required: boolean
          rtl_layout: boolean
          state_label: string
          state_required: boolean
        }
        Insert: {
          allows_free_text_city?: boolean
          allows_free_text_state?: boolean
          city_label?: string
          city_required?: boolean
          country_id: string
          metadata?: Json
          phone_required?: boolean
          postal_code_example?: string | null
          postal_code_label?: string
          postal_code_regex?: string | null
          postal_code_required?: boolean
          rtl_layout?: boolean
          state_label?: string
          state_required?: boolean
        }
        Update: {
          allows_free_text_city?: boolean
          allows_free_text_state?: boolean
          city_label?: string
          city_required?: boolean
          country_id?: string
          metadata?: Json
          phone_required?: boolean
          postal_code_example?: string | null
          postal_code_label?: string
          postal_code_regex?: string | null
          postal_code_required?: boolean
          rtl_layout?: boolean
          state_label?: string
          state_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "address_country_rules_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: true
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          country: string
          created_at: string
          full_name: string
          id: string
          is_default: boolean
          label: string | null
          phone: string | null
          postal_code: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          country?: string
          created_at?: string
          full_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone?: string | null
          postal_code: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          country?: string
          created_at?: string
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          phone?: string | null
          postal_code?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_action_logs: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_order_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_internal: boolean
          order_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_internal?: boolean
          order_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_order_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_region_scopes: {
        Row: {
          country_id: string
          granted_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          country_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          country_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_region_scopes_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      administrative_regions: {
        Row: {
          code: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          code: string
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          type: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          type?: string
        }
        Relationships: []
      }
      brand_localizations: {
        Row: {
          brand_id: string
          created_at: string
          description: string | null
          id: string
          locale_id: string
          name: string
          seo_desc: string | null
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id: string
          name: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id?: string
          name?: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_localizations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_localizations_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      cart_events: {
        Row: {
          actor_id: string | null
          cart_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_id?: string | null
          cart_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_id?: string | null
          cart_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "cart_events_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          id: string
          quantity: number
          unit_price_snapshot: number | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          added_at?: string
          cart_id: string
          id?: string
          quantity: number
          unit_price_snapshot?: number | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          added_at?: string
          cart_id?: string
          id?: string
          quantity?: number
          unit_price_snapshot?: number | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          abandoned_at: string | null
          converted_to_order_id: string | null
          country_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency_code: string | null
          expires_at: string
          id: string
          merged_from: string | null
          metadata: Json
          session_id: string | null
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          abandoned_at?: string | null
          converted_to_order_id?: string | null
          country_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency_code?: string | null
          expires_at?: string
          id?: string
          merged_from?: string | null
          metadata?: Json
          session_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          abandoned_at?: string | null
          converted_to_order_id?: string | null
          country_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency_code?: string | null
          expires_at?: string
          id?: string
          merged_from?: string | null
          metadata?: Json
          session_id?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_converted_to_order_id_fkey"
            columns: ["converted_to_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_merged_from_fkey"
            columns: ["merged_from"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          parent_id: string | null
          seo_desc: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          parent_id?: string | null
          seo_desc?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          parent_id?: string | null
          seo_desc?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      category_localizations: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          locale_id: string
          name: string
          seo_desc: string | null
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id: string
          name: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id?: string
          name?: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_localizations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_localizations_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_session_items: {
        Row: {
          checkout_session_id: string
          created_at: string
          discount_amount: number
          id: string
          product_name: string
          quantity: number
          sku: string | null
          snapshot: Json | null
          tax_amount: number
          total: number
          unit_price: number
          variant_id: string
          variant_name: string | null
        }
        Insert: {
          checkout_session_id: string
          created_at?: string
          discount_amount?: number
          id?: string
          product_name: string
          quantity: number
          sku?: string | null
          snapshot?: Json | null
          tax_amount?: number
          total: number
          unit_price: number
          variant_id: string
          variant_name?: string | null
        }
        Update: {
          checkout_session_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          product_name?: string
          quantity?: number
          sku?: string | null
          snapshot?: Json | null
          tax_amount?: number
          total?: number
          unit_price?: number
          variant_id?: string
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_session_items_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_session_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          billing_address: Json | null
          cart_id: string | null
          completed_at: string | null
          country_id: string | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          currency_code: string | null
          discount: number | null
          expires_at: string
          id: string
          idempotency_key: string | null
          locale_id: string | null
          notes: string | null
          order_id: string | null
          payment_provider_ref: string | null
          session_token: string
          shipping: number | null
          shipping_address: Json | null
          status: string
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_address?: Json | null
          cart_id?: string | null
          completed_at?: string | null
          country_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency_code?: string | null
          discount?: number | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          locale_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_provider_ref?: string | null
          session_token?: string
          shipping?: number | null
          shipping_address?: Json | null
          status?: string
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_address?: Json | null
          cart_id?: string | null
          completed_at?: string | null
          country_id?: string | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          currency_code?: string | null
          discount?: number | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          locale_id?: string | null
          notes?: string | null
          order_id?: string | null
          payment_provider_ref?: string | null
          session_token?: string
          shipping?: number | null
          shipping_address?: Json | null
          status?: string
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          administrative_region_code: string
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          normalized_name: string
        }
        Insert: {
          administrative_region_code: string
          country_code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          normalized_name?: string
        }
        Update: {
          administrative_region_code?: string
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          normalized_name?: string
        }
        Relationships: []
      }
      cms_banners: {
        Row: {
          background_color: string | null
          created_at: string
          cta_open_new_tab: boolean
          cta_text: string | null
          cta_url: string | null
          handle: string
          id: string
          image_url: string | null
          is_active: boolean
          locale_id: string
          sort_order: number
          subtitle: string | null
          text_color: string | null
          title: string | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          background_color?: string | null
          created_at?: string
          cta_open_new_tab?: boolean
          cta_text?: string | null
          cta_url?: string | null
          handle: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          locale_id: string
          sort_order?: number
          subtitle?: string | null
          text_color?: string | null
          title?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          background_color?: string | null
          created_at?: string
          cta_open_new_tab?: boolean
          cta_text?: string | null
          cta_url?: string | null
          handle?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          locale_id?: string
          sort_order?: number
          subtitle?: string | null
          text_color?: string | null
          title?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_banners_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_block_versions: {
        Row: {
          block_id: string
          content: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          id: string
          status: string
          version_number: number
        }
        Insert: {
          block_id: string
          content?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          version_number: number
        }
        Update: {
          block_id?: string
          content?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_block_versions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "cms_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_blocks: {
        Row: {
          content: string | null
          content_json: Json | null
          created_at: string
          created_by: string | null
          handle: string
          id: string
          is_active: boolean
          locale_id: string
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          handle: string
          id?: string
          is_active?: boolean
          locale_id: string
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          content_json?: Json | null
          created_at?: string
          created_by?: string | null
          handle?: string
          id?: string
          is_active?: boolean
          locale_id?: string
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_blocks_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_navigation_items: {
        Row: {
          collection_id: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          menu_id: string
          page_id: string | null
          parent_id: string | null
          sort_order: number
          target: string | null
          url: string | null
        }
        Insert: {
          collection_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label: string
          menu_id: string
          page_id?: string | null
          parent_id?: string | null
          sort_order?: number
          target?: string | null
          url?: string | null
        }
        Update: {
          collection_id?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          menu_id?: string
          page_id?: string | null
          parent_id?: string | null
          sort_order?: number
          target?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cms_navigation_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "cms_navigation_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_items_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "localized_cms_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cms_navigation_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cms_navigation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_navigation_menus: {
        Row: {
          created_at: string
          handle: string
          id: string
          is_active: boolean
          locale_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          is_active?: boolean
          locale_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          is_active?: boolean
          locale_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cms_navigation_menus_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_page_versions: {
        Row: {
          cms_page_id: string
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          scheduled_for: string | null
          seo_desc: string | null
          seo_title: string | null
          status: string
          title: string
          version_number: number
        }
        Insert: {
          cms_page_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          seo_desc?: string | null
          seo_title?: string | null
          status?: string
          title: string
          version_number: number
        }
        Update: {
          cms_page_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          scheduled_for?: string | null
          seo_desc?: string | null
          seo_title?: string | null
          status?: string
          title?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "cms_page_versions_cms_page_id_fkey"
            columns: ["cms_page_id"]
            isOneToOne: false
            referencedRelation: "localized_cms_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      cms_pages: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          seo_desc: string | null
          seo_title: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          seo_desc?: string | null
          seo_title?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          seo_desc?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      collection_localizations: {
        Row: {
          collection_id: string
          created_at: string
          description: string | null
          id: string
          locale_id: string
          name: string
          seo_desc: string | null
          seo_title: string | null
          updated_at: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id: string
          name: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          description?: string | null
          id?: string
          locale_id?: string
          name?: string
          seo_desc?: string | null
          seo_title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_localizations_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_localizations_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          added_at: string
          collection_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          added_at?: string
          collection_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          added_at?: string
          collection_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          condition_match: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          rules: Json | null
          slug: string
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          condition_match?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          rules?: Json | null
          slug: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          condition_match?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          rules?: Json | null
          slug?: string
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      countries: {
        Row: {
          created_at: string
          currency_code: string
          default_language_id: string
          fallback_language_id: string
          id: string
          is_active: boolean
          iso_alpha2: string
          iso_alpha3: string
          name: string
          native_name: string
          sort_order: number
          timezone: string
        }
        Insert: {
          created_at?: string
          currency_code: string
          default_language_id: string
          fallback_language_id: string
          id: string
          is_active?: boolean
          iso_alpha2: string
          iso_alpha3: string
          name: string
          native_name: string
          sort_order?: number
          timezone: string
        }
        Update: {
          created_at?: string
          currency_code?: string
          default_language_id?: string
          fallback_language_id?: string
          id?: string
          is_active?: boolean
          iso_alpha2?: string
          iso_alpha3?: string
          name?: string
          native_name?: string
          sort_order?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_default_language_id_fkey"
            columns: ["default_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "countries_fallback_language_id_fkey"
            columns: ["fallback_language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          id: string
          order_id: string | null
          used_at: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          id?: string
          order_id?: string | null
          used_at?: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          id?: string
          order_id?: string | null
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_order_value: number | null
          type: string
          usage_limit: number | null
          used_count: number
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number | null
          type: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_order_value?: number | null
          type?: string
          usage_limit?: number | null
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: []
      }
      currencies: {
        Row: {
          decimal_places: number
          id: string
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          decimal_places?: number
          id: string
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          decimal_places?: number
          id?: string
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          archived_at: string | null
          city: string
          company: string | null
          country_code: string
          country_id: string | null
          created_at: string
          delivery_instructions: string | null
          email: string | null
          first_name: string
          id: string
          is_default_billing: boolean
          is_default_shipping: boolean
          label: string | null
          last_name: string
          phone: string | null
          postal_code: string
          region_code: string | null
          state: string
          updated_at: string
          user_id: string
          validation_metadata: Json
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          archived_at?: string | null
          city: string
          company?: string | null
          country_code: string
          country_id?: string | null
          created_at?: string
          delivery_instructions?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          last_name?: string
          phone?: string | null
          postal_code?: string
          region_code?: string | null
          state?: string
          updated_at?: string
          user_id: string
          validation_metadata?: Json
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          archived_at?: string | null
          city?: string
          company?: string | null
          country_code?: string
          country_id?: string | null
          created_at?: string
          delivery_instructions?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_default_billing?: boolean
          is_default_shipping?: boolean
          label?: string | null
          last_name?: string
          phone?: string | null
          postal_code?: string
          region_code?: string | null
          state?: string
          updated_at?: string
          user_id?: string
          validation_metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_items: {
        Row: {
          created_at: string
          fulfillment_id: string
          id: string
          order_item_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          fulfillment_id: string
          id?: string
          order_item_id: string
          quantity: number
        }
        Update: {
          created_at?: string
          fulfillment_id?: string
          id?: string
          order_item_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_items_fulfillment_id_fkey"
            columns: ["fulfillment_id"]
            isOneToOne: false
            referencedRelation: "order_fulfillments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_sections: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          subtitle: string | null
          title: string | null
          type: Database["public"]["Enums"]["section_type"]
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          id: string
          key: string
          response_body: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          response_body?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          response_body?: Json | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          quantity: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          reserved?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          reserved?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          id: string
          max_quantity: number | null
          quantity: number
          reorder_point: number
          reserved: number
          updated_at: string
          variant_id: string
          warehouse_id: string
        }
        Insert: {
          id?: string
          max_quantity?: number | null
          quantity?: number
          reorder_point?: number
          reserved?: number
          updated_at?: string
          variant_id: string
          warehouse_id: string
        }
        Update: {
          id?: string
          max_quantity?: number | null
          quantity?: number
          reorder_point?: number
          reserved?: number
          updated_at?: string
          variant_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_quantity: number | null
          note: string | null
          previous_quantity: number | null
          quantity: number
          reference_id: string | null
          source_id: string | null
          source_type: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_quantity?: number | null
          note?: string | null
          previous_quantity?: number | null
          quantity: number
          reference_id?: string | null
          source_id?: string | null
          source_type?: string | null
          type: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_quantity?: number | null
          note?: string | null
          previous_quantity?: number | null
          quantity?: number
          reference_id?: string | null
          source_id?: string | null
          source_type?: string | null
          type?: Database["public"]["Enums"]["inventory_movement_type"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          created_at: string
          direction: string
          id: string
          is_active: boolean
          name: string
          native_name: string
        }
        Insert: {
          created_at?: string
          direction?: string
          id: string
          is_active?: boolean
          name: string
          native_name: string
        }
        Update: {
          created_at?: string
          direction?: string
          id?: string
          is_active?: boolean
          name?: string
          native_name?: string
        }
        Relationships: []
      }
      locales: {
        Row: {
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          language_id: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id: string
          is_active?: boolean
          is_default?: boolean
          language_id: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          language_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locales_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locales_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
        ]
      }
      localized_cms_pages: {
        Row: {
          content: string | null
          country_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          language_id: string
          locale_id: string
          seo_desc: string | null
          seo_title: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          country_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_id: string
          locale_id: string
          seo_desc?: string | null
          seo_title?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          country_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          language_id?: string
          locale_id?: string
          seo_desc?: string | null
          seo_title?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "localized_cms_pages_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localized_cms_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localized_cms_pages_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localized_cms_pages_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      localized_homepage_sections: {
        Row: {
          content: Json | null
          country_id: string
          created_at: string
          id: string
          is_active: boolean
          language_id: string
          locale_id: string
          sort_order: number
          subtitle: string | null
          title: string | null
          type: Database["public"]["Enums"]["section_type"]
          updated_at: string
        }
        Insert: {
          content?: Json | null
          country_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          language_id: string
          locale_id: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Update: {
          content?: Json | null
          country_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          language_id?: string
          locale_id?: string
          sort_order?: number
          subtitle?: string | null
          title?: string | null
          type?: Database["public"]["Enums"]["section_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "localized_homepage_sections_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localized_homepage_sections_language_id_fkey"
            columns: ["language_id"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localized_homepage_sections_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      localized_seo: {
        Row: {
          canonical_path: string | null
          created_at: string
          description: string | null
          entity_id: string
          entity_type: string
          id: string
          locale_id: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          canonical_path?: string | null
          created_at?: string
          description?: string | null
          entity_id: string
          entity_type: string
          id?: string
          locale_id: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          canonical_path?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          locale_id?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "localized_seo_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          file_size: number
          filename: string
          folder_id: string | null
          height: number | null
          id: string
          metadata: Json | null
          mime_type: string
          original_name: string
          tags: string[] | null
          thumbnail_url: string | null
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_size: number
          filename: string
          folder_id?: string | null
          height?: number | null
          id?: string
          metadata?: Json | null
          mime_type: string
          original_name: string
          tags?: string[] | null
          thumbnail_url?: string | null
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_size?: number
          filename?: string
          folder_id?: string | null
          height?: number | null
          id?: string
          metadata?: Json | null
          mime_type?: string
          original_name?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      media_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "media_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_address_snapshots: {
        Row: {
          address_line1: string
          address_line2: string | null
          address_type: string
          city: string
          company: string | null
          country_code: string
          country_name: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          order_id: string
          phone: string | null
          postal_code: string
          region_code: string | null
          source_address_id: string | null
          state: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          address_type: string
          city: string
          company?: string | null
          country_code: string
          country_name?: string
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string
          order_id: string
          phone?: string | null
          postal_code?: string
          region_code?: string | null
          source_address_id?: string | null
          state?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          address_type?: string
          city?: string
          company?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          order_id?: string
          phone?: string | null
          postal_code?: string
          region_code?: string | null
          source_address_id?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_address_snapshots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_address_snapshots_source_address_id_fkey"
            columns: ["source_address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_type: string | null
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json
          order_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string | null
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fulfillments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          estimated_delivery: string | null
          id: string
          notes: string | null
          order_id: string
          packed_at: string | null
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          order_id: string
          packed_at?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          packed_at?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          discount_amount: number
          id: string
          order_id: string
          product_name: string
          quantity: number
          sku: string | null
          snapshot: Json | null
          tax_amount: number
          total: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          discount_amount?: number
          id?: string
          order_id: string
          product_name: string
          quantity: number
          sku?: string | null
          snapshot?: Json | null
          tax_amount?: number
          total: number
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          discount_amount?: number
          id?: string
          order_id?: string
          product_name?: string
          quantity?: number
          sku?: string | null
          snapshot?: Json | null
          tax_amount?: number
          total?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_return_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          reason: string | null
          return_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          reason?: string | null
          return_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          reason?: string | null
          return_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "order_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      order_returns: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_refund_amount: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_refund_amount?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_refund_amount?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          order_id: string
          reason: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id: string
          reason?: string | null
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          order_id?: string
          reason?: string | null
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          coupon_code: string | null
          coupon_id: string | null
          created_at: string
          discount: number
          fulfillment_status: Database["public"]["Enums"]["fulfillment_status"]
          id: string
          notes: string | null
          order_number: string
          shipping: number
          shipping_address: Json
          shipping_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_address?: Json | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          discount?: number
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          notes?: string | null
          order_number: string
          shipping?: number
          shipping_address: Json
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_address?: Json | null
          coupon_code?: string | null
          coupon_id?: string | null
          created_at?: string
          discount?: number
          fulfillment_status?: Database["public"]["Enums"]["fulfillment_status"]
          id?: string
          notes?: string | null
          order_number?: string
          shipping?: number
          shipping_address?: Json
          shipping_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          event_type: string
          id: string
          order_id: string
          payload: Json | null
          payment_id: string
          provider: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          event_type: string
          id?: string
          order_id: string
          payload?: Json | null
          payment_id: string
          provider: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string
          payload?: Json | null
          payment_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id: string | null
          provider_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id: string
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_order_id?: string | null
          provider_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          code: string
          created_at: string
          description: string | null
          id: string
          resource: string
        }
        Insert: {
          action: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          resource: string
        }
        Update: {
          action?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          resource?: string
        }
        Relationships: []
      }
      price_lists: {
        Row: {
          code: string
          country_id: string | null
          created_at: string
          currency_code: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          type: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          country_id?: string | null
          created_at?: string
          currency_code: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          country_id?: string | null
          created_at?: string
          currency_code?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          type?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_lists_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_lists_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attribute_values: {
        Row: {
          attribute_id: string
          created_at: string
          id: string
          product_id: string
          value: string
        }
        Insert: {
          attribute_id: string
          created_at?: string
          id?: string
          product_id: string
          value: string
        }
        Update: {
          attribute_id?: string
          created_at?: string
          id?: string
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attribute_values_attribute_id_fkey"
            columns: ["attribute_id"]
            isOneToOne: false
            referencedRelation: "product_attributes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attribute_values_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          attribute_type: string
          created_at: string
          display_name: string
          id: string
          is_filterable: boolean
          is_searchable: boolean
          name: string
          sort_order: number
          unit: string | null
        }
        Insert: {
          attribute_type?: string
          created_at?: string
          display_name: string
          id?: string
          is_filterable?: boolean
          is_searchable?: boolean
          name: string
          sort_order?: number
          unit?: string | null
        }
        Update: {
          attribute_type?: string
          created_at?: string
          display_name?: string
          id?: string
          is_filterable?: boolean
          is_searchable?: boolean
          name?: string
          sort_order?: number
          unit?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          is_primary: boolean
          product_id: string
          sort_order: number
        }
        Insert: {
          category_id: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_localizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          locale_id: string
          name: string
          product_id: string
          seo_desc: string | null
          seo_image_url: string | null
          seo_title: string | null
          short_desc: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          locale_id: string
          name: string
          product_id: string
          seo_desc?: string | null
          seo_image_url?: string | null
          seo_title?: string | null
          short_desc?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          locale_id?: string
          name?: string
          product_id?: string
          seo_desc?: string | null
          seo_image_url?: string | null
          seo_title?: string | null
          short_desc?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_localizations_locale_id_fkey"
            columns: ["locale_id"]
            isOneToOne: false
            referencedRelation: "locales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_localizations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          created_at: string
          display_value: string
          hex_color: string | null
          id: string
          is_active: boolean
          product_option_id: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          display_value: string
          hex_color?: string | null
          id?: string
          is_active?: boolean
          product_option_id: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          display_value?: string
          hex_color?: string | null
          id?: string
          is_active?: boolean
          product_option_id?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_product_option_id_fkey"
            columns: ["product_option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          display_name: string
          display_type: string
          id: string
          name: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          display_name: string
          display_type?: string
          id?: string
          name: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          display_name?: string
          display_type?: string
          id?: string
          name?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          amount: number
          compare_at: number | null
          cost_price: number | null
          created_at: string
          id: string
          price_list_id: string
          product_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          amount: number
          compare_at?: number | null
          cost_price?: number | null
          created_at?: string
          id?: string
          price_list_id: string
          product_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          amount?: number
          compare_at?: number | null
          cost_price?: number | null
          created_at?: string
          id?: string
          price_list_id?: string
          product_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          options: Json
          price: number | null
          product_id: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          options?: Json
          price?: number | null
          product_id: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          options?: Json
          price?: number | null
          product_id?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          base_price: number
          brand_id: string | null
          category_id: string | null
          compare_price: number | null
          cost_price: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_digital: boolean
          is_featured: boolean
          meta_image: string | null
          name: string
          seo_desc: string | null
          seo_title: string | null
          short_desc: string | null
          sku: string | null
          slug: string
          tags: string[] | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          barcode?: string | null
          base_price: number
          brand_id?: string | null
          category_id?: string | null
          compare_price?: number | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_digital?: boolean
          is_featured?: boolean
          meta_image?: string | null
          name: string
          seo_desc?: string | null
          seo_title?: string | null
          short_desc?: string | null
          sku?: string | null
          slug: string
          tags?: string[] | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          barcode?: string | null
          base_price?: number
          brand_id?: string | null
          category_id?: string | null
          compare_price?: number | null
          cost_price?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_digital?: boolean
          is_featured?: boolean
          meta_image?: string | null
          name?: string
          seo_desc?: string | null
          seo_title?: string | null
          short_desc?: string | null
          sku?: string | null
          slug?: string
          tags?: string[] | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          customer_tier: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          customer_tier?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          customer_tier?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      refund_items: {
        Row: {
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          reason: string | null
          refund_amount: number
          refund_request_id: string
          tax_amount: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          reason?: string | null
          refund_amount: number
          refund_request_id: string
          tax_amount?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          reason?: string | null
          refund_amount?: number
          refund_request_id?: string
          tax_amount?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_request_id_fkey"
            columns: ["refund_request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_line_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          refund_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          refund_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_line_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_line_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          admin_notes: string | null
          completed_at: string | null
          created_at: string
          currency_code: string | null
          gateway_refund_id: string | null
          id: string
          order_id: string
          payment_id: string | null
          reason: string
          return_request_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          gateway_refund_id?: string | null
          id?: string
          order_id: string
          payment_id?: string | null
          reason: string
          return_request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          gateway_refund_id?: string | null
          id?: string
          order_id?: string
          payment_id?: string | null
          reason?: string
          return_request_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failed_reason: string | null
          id: string
          metadata: Json
          order_id: string
          payment_id: string | null
          processed_at: string | null
          processed_by: string | null
          provider_refund_id: string | null
          reason: string | null
          refund_type: string
          return_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failed_reason?: string | null
          id?: string
          metadata?: Json
          order_id: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          refund_type?: string
          return_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failed_reason?: string | null
          id?: string
          metadata?: Json
          order_id?: string
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          provider_refund_id?: string | null
          reason?: string | null
          refund_type?: string
          return_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "order_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      region_configs: {
        Row: {
          country_id: string
          created_at: string
          currency_code: string
          date_format: string
          default_shipping_cost: number | null
          free_shipping_threshold: number | null
          id: string
          number_format: string
          tax_inclusive: boolean
          tax_label: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          currency_code: string
          date_format?: string
          default_shipping_cost?: number | null
          free_shipping_threshold?: number | null
          id?: string
          number_format?: string
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          currency_code?: string
          date_format?: string
          default_shipping_cost?: number | null
          free_shipping_threshold?: number | null
          id?: string
          number_format?: string
          tax_inclusive?: boolean
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "region_configs_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: true
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      replacement_items: {
        Row: {
          created_at: string
          id: string
          new_variant_id: string | null
          order_item_id: string
          quantity: number
          replacement_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_variant_id?: string | null
          order_item_id: string
          quantity: number
          replacement_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_variant_id?: string | null
          order_item_id?: string
          quantity?: number
          replacement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacement_items_new_variant_id_fkey"
            columns: ["new_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacement_items_replacement_id_fkey"
            columns: ["replacement_id"]
            isOneToOne: false
            referencedRelation: "replacements"
            referencedColumns: ["id"]
          },
        ]
      }
      replacements: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          processed_by: string | null
          reason: string | null
          return_id: string | null
          shipped_at: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          processed_by?: string | null
          reason?: string | null
          return_id?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          processed_by?: string | null
          reason?: string | null
          return_id?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "replacements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replacements_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "order_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          order_item_id: string
          quantity: number
          reason: string | null
          refund_amount: number | null
          restock: boolean
          return_request_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id: string
          quantity: number
          reason?: string | null
          refund_amount?: number | null
          restock?: boolean
          return_request_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          order_item_id?: string
          quantity?: number
          reason?: string | null
          refund_amount?: number | null
          restock?: boolean
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      return_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          reason: string
          return_window_expires_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          reason: string
          return_window_expires_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          reason?: string
          return_window_expires_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_helpful?: boolean
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          created_at: string
          helpful_count: number
          id: string
          is_approved: boolean
          is_verified: boolean
          media_urls: string[] | null
          not_helpful_count: number
          order_item_id: string | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified?: boolean
          media_urls?: string[] | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          helpful_count?: number
          id?: string
          is_approved?: boolean
          is_verified?: boolean
          media_urls?: string[] | null
          not_helpful_count?: number
          order_item_id?: string | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
        }
        Insert: {
          permission_id: string
          role_id: string
        }
        Update: {
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      shipment_tracking: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          estimated_delivery: string | null
          events: Json
          id: string
          order_id: string
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          events?: Json
          id?: string
          order_id: string
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          estimated_delivery?: string | null
          events?: Json
          id?: string
          order_id?: string
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_tracking_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_methods: {
        Row: {
          carrier: string | null
          code: string
          created_at: string
          description: string | null
          estimated_days_max: number | null
          estimated_days_min: number | null
          id: string
          is_active: boolean
          is_taxable: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          code: string
          created_at?: string
          description?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          code?: string
          created_at?: string
          description?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_active?: boolean
          is_taxable?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipping_zone_methods: {
        Row: {
          currency_code: string | null
          free_above_amount: number | null
          id: string
          is_active: boolean
          max_order_amount: number | null
          max_weight_kg: number | null
          method_id: string
          min_order_amount: number | null
          min_weight_kg: number | null
          price: number
          zone_id: string
        }
        Insert: {
          currency_code?: string | null
          free_above_amount?: number | null
          id?: string
          is_active?: boolean
          max_order_amount?: number | null
          max_weight_kg?: number | null
          method_id: string
          min_order_amount?: number | null
          min_weight_kg?: number | null
          price?: number
          zone_id: string
        }
        Update: {
          currency_code?: string | null
          free_above_amount?: number | null
          id?: string
          is_active?: boolean
          max_order_amount?: number | null
          max_weight_kg?: number | null
          method_id?: string
          min_order_amount?: number | null
          min_weight_kg?: number | null
          price?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zone_methods_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_zone_methods_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "shipping_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_zone_methods_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          country_ids: string[]
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          country_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          country_ids?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_option_values: {
        Row: {
          option_value_id: string
          variant_id: string
        }
        Insert: {
          option_value_id: string
          variant_id: string
        }
        Update: {
          option_value_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_option_values_option_value_id_fkey"
            columns: ["option_value_id"]
            isOneToOne: false
            referencedRelation: "product_option_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_option_values_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      variant_prices: {
        Row: {
          amount: number
          compare_at: number | null
          cost_price: number | null
          created_at: string
          id: string
          price_list_id: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          variant_id: string
        }
        Insert: {
          amount: number
          compare_at?: number | null
          cost_price?: number | null
          created_at?: string
          id?: string
          price_list_id: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          variant_id: string
        }
        Update: {
          amount?: number
          compare_at?: number | null
          cost_price?: number | null
          created_at?: string
          id?: string
          price_list_id?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_prices_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_prices_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: Json | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          country_id: string | null
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlists: {
        Row: {
          added_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_return: {
        Args: { p_admin_id: string; p_note?: string; p_return_id: string }
        Returns: undefined
      }
      available_inventory: { Args: { p_variant_id: string }; Returns: number }
      cancel_order: {
        Args: {
          p_actor_type?: string
          p_order_id: string
          p_reason?: string
          p_user_id: string
        }
        Returns: undefined
      }
      commit_inventory_for_order: {
        Args: { p_actor_id?: string; p_order_id: string }
        Returns: undefined
      }
      confirm_inventory_sale: {
        Args: { p_quantity: number; p_variant_id: string }
        Returns: undefined
      }
      create_fulfillment: {
        Args: {
          p_admin_id: string
          p_carrier?: string
          p_estimated_delivery?: string
          p_notes?: string
          p_order_id: string
          p_tracking_number?: string
          p_tracking_url?: string
        }
        Returns: string
      }
      create_order_atomic: {
        Args: {
          p_billing_address: Json
          p_cart_items: Json
          p_coupon_code: string
          p_coupon_id: string
          p_discount: number
          p_notes: string
          p_shipping: number
          p_shipping_address: Json
          p_subtotal: number
          p_tax: number
          p_total: number
          p_user_id: string
        }
        Returns: string
      }
      expire_abandoned_carts: { Args: never; Returns: undefined }
      generate_order_number: { Args: never; Returns: string }
      get_or_create_user_cart: {
        Args: { p_country_id?: string; p_currency?: string; p_user_id: string }
        Returns: string
      }
      has_permission: { Args: { p_permission_code: string }; Returns: boolean }
      increment_coupon_usage: {
        Args: { p_coupon_id: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_content_manager: { Args: never; Returns: boolean }
      merge_guest_cart: {
        Args: {
          p_guest_cart_id: string
          p_max_qty?: number
          p_user_cart_id: string
        }
        Returns: undefined
      }
      product_avg_rating: { Args: { p_product_id: string }; Returns: number }
      record_inventory_movement: {
        Args: {
          p_actor_id: string
          p_new_qty: number
          p_note: string
          p_previous_qty: number
          p_quantity: number
          p_source_id: string
          p_source_type: string
          p_type: Database["public"]["Enums"]["inventory_movement_type"]
          p_variant_id: string
        }
        Returns: undefined
      }
      record_refund: {
        Args: {
          p_admin_id: string
          p_amount: number
          p_order_id: string
          p_payment_id: string
          p_provider_refund_id?: string
          p_reason?: string
          p_refund_type: string
          p_return_id?: string
        }
        Returns: string
      }
      reject_return: {
        Args: { p_admin_id: string; p_reason: string; p_return_id: string }
        Returns: undefined
      }
      release_inventory: {
        Args: { p_quantity: number; p_variant_id: string }
        Returns: undefined
      }
      release_inventory_for_order: {
        Args: { p_actor_id?: string; p_order_id: string }
        Returns: undefined
      }
      request_return: {
        Args: {
          p_items: Json
          p_order_id: string
          p_reason: string
          p_user_id: string
        }
        Returns: string
      }
      reserve_inventory: {
        Args: { p_quantity: number; p_variant_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_fulfillment_tracking: {
        Args: {
          p_admin_id: string
          p_carrier?: string
          p_estimated_delivery?: string
          p_fulfillment_id: string
          p_status?: string
          p_tracking_number?: string
          p_tracking_url?: string
        }
        Returns: undefined
      }
      update_order_status: {
        Args: {
          p_changed_by: string
          p_new_status: Database["public"]["Enums"]["order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      cart_status:
        | "active"
        | "abandoned"
        | "expired"
        | "merged"
        | "converted"
        | "deleted"
      fulfillment_status:
        | "unfulfilled"
        | "processing"
        | "partially_fulfilled"
        | "fulfilled"
        | "shipped"
        | "delivered"
        | "failed"
      inventory_movement_type:
        | "purchase"
        | "sale"
        | "return"
        | "adjustment"
        | "transfer"
      order_status:
        | "draft"
        | "pending"
        | "pending_payment"
        | "confirmed"
        | "processing"
        | "shipped"
        | "delivered"
        | "partially_returned"
        | "cancelled"
        | "refunded"
        | "partially_refunded"
        | "packed"
        | "out_for_delivery"
        | "failed"
        | "return_requested"
        | "return_approved"
        | "return_rejected"
        | "return_in_transit"
        | "returned"
        | "replacement_requested"
        | "replacement_approved"
        | "replacement_rejected"
        | "replacement_shipped"
        | "replacement_delivered"
        | "refund_requested"
        | "refund_processing"
      payment_provider: "stripe" | "razorpay" | "cod"
      payment_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "refunded"
        | "cancelled"
      section_type:
        | "hero_banner"
        | "featured_products"
        | "promotional_banner"
        | "category_grid"
        | "testimonials"
        | "newsletter"
      user_role: "customer" | "admin" | "super_admin"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cart_status: [
        "active",
        "abandoned",
        "expired",
        "merged",
        "converted",
        "deleted",
      ],
      fulfillment_status: [
        "unfulfilled",
        "processing",
        "partially_fulfilled",
        "fulfilled",
        "shipped",
        "delivered",
        "failed",
      ],
      inventory_movement_type: [
        "purchase",
        "sale",
        "return",
        "adjustment",
        "transfer",
      ],
      order_status: [
        "draft",
        "pending",
        "pending_payment",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "partially_returned",
        "cancelled",
        "refunded",
        "partially_refunded",
        "packed",
        "out_for_delivery",
        "failed",
        "return_requested",
        "return_approved",
        "return_rejected",
        "return_in_transit",
        "returned",
        "replacement_requested",
        "replacement_approved",
        "replacement_rejected",
        "replacement_shipped",
        "replacement_delivered",
        "refund_requested",
        "refund_processing",
      ],
      payment_provider: ["stripe", "razorpay", "cod"],
      payment_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "refunded",
        "cancelled",
      ],
      section_type: [
        "hero_banner",
        "featured_products",
        "promotional_banner",
        "category_grid",
        "testimonials",
        "newsletter",
      ],
      user_role: ["customer", "admin", "super_admin"],
    },
  },
} as const
