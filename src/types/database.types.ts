export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          phone: string | null;
          role: "customer" | "admin" | "super_admin";
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          phone?: string | null;
          role?: "customer" | "admin" | "super_admin";
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          parent_id: string | null;
          sort_order: number;
          is_active: boolean;
          seo_title: string | null;
          seo_desc: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          description?: string | null;
          image_url?: string | null;
          parent_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          seo_title?: string | null;
          seo_desc?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      products: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          short_desc: string | null;
          category_id: string | null;
          base_price: number;
          compare_price: number | null;
          cost_price: number | null;
          sku: string | null;
          barcode: string | null;
          is_active: boolean;
          is_featured: boolean;
          is_digital: boolean;
          weight: number | null;
          tags: string[];
          seo_title: string | null;
          seo_desc: string | null;
          meta_image: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          slug: string;
          base_price: number;
          description?: string | null;
          short_desc?: string | null;
          category_id?: string | null;
          compare_price?: number | null;
          cost_price?: number | null;
          sku?: string | null;
          barcode?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          is_digital?: boolean;
          weight?: number | null;
          tags?: string[];
          seo_title?: string | null;
          seo_desc?: string | null;
          meta_image?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          sku: string | null;
          price: number | null;
          options: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          name: string;
          sku?: string | null;
          price?: number | null;
          options?: Json;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["product_variants"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          url: string;
          alt_text: string | null;
          sort_order: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          product_id: string;
          url: string;
          alt_text?: string | null;
          sort_order?: number;
          is_primary?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["product_images"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      inventory: {
        Row: {
          id: string;
          variant_id: string;
          quantity: number;
          reserved: number;
          updated_at: string;
        };
        Insert: {
          variant_id: string;
          quantity?: number;
          reserved?: number;
        };
        Update: Partial<Database["public"]["Tables"]["inventory"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: true;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      inventory_movements: {
        Row: {
          id: string;
          variant_id: string;
          type: "purchase" | "sale" | "return" | "adjustment" | "transfer";
          quantity: number;
          previous_quantity: number | null;
          new_quantity: number | null;
          source_type: string | null;
          source_id: string | null;
          reference_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          variant_id: string;
          type: "purchase" | "sale" | "return" | "adjustment" | "transfer";
          quantity: number;
          previous_quantity?: number | null;
          new_quantity?: number | null;
          source_type?: string | null;
          source_id?: string | null;
          reference_id?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["inventory_movements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "inventory_movements_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          full_name: string;
          phone: string | null;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          postal_code: string;
          country: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          full_name: string;
          address_line1: string;
          city: string;
          state: string;
          postal_code: string;
          country: string;
          label?: string | null;
          phone?: string | null;
          address_line2?: string | null;
          is_default?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["addresses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "addresses_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      carts: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string | null;
          session_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["carts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          variant_id: string;
          quantity: number;
          added_at: string;
        };
        Insert: {
          cart_id: string;
          variant_id: string;
          quantity: number;
        };
        Update: Partial<Database["public"]["Tables"]["cart_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      wishlists: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          added_at: string;
        };
        Insert: {
          user_id: string;
          product_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["wishlists"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "wishlists_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlists_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          description: string | null;
          type: "percentage" | "fixed";
          value: number;
          min_order_value: number | null;
          max_discount: number | null;
          usage_limit: number | null;
          used_count: number;
          is_active: boolean;
          valid_from: string;
          valid_until: string | null;
          created_at: string;
        };
        Insert: {
          code: string;
          type: "percentage" | "fixed";
          value: number;
          valid_from: string;
          description?: string | null;
          min_order_value?: number | null;
          max_discount?: number | null;
          usage_limit?: number | null;
          is_active?: boolean;
          valid_until?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["coupons"]["Insert"]>;
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          status: "draft" | "pending" | "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "partially_returned" | "partially_refunded" | "refunded";
          fulfillment_status: "unfulfilled" | "processing" | "partially_fulfilled" | "fulfilled" | "shipped" | "delivered" | "failed";
          shipping_method: string | null;
          subtotal: number;
          tax: number;
          shipping: number;
          discount: number;
          total: number;
          coupon_id: string | null;
          coupon_code: string | null;
          shipping_address: Json;
          billing_address: Json | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_number: string;
          subtotal: number;
          tax: number;
          shipping: number;
          discount: number;
          total: number;
          shipping_address: Json;
          user_id?: string | null;
          status?: "draft" | "pending" | "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "partially_returned" | "partially_refunded" | "refunded";
          fulfillment_status?: "unfulfilled" | "processing" | "partially_fulfilled" | "fulfilled" | "shipped" | "delivered" | "failed";
          shipping_method?: string | null;
          coupon_id?: string | null;
          coupon_code?: string | null;
          billing_address?: Json | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_coupon_id_fkey";
            columns: ["coupon_id"];
            isOneToOne: false;
            referencedRelation: "coupons";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          variant_id: string | null;
          product_name: string;
          variant_name: string | null;
          sku: string | null;
          quantity: number;
          unit_price: number;
          total: number;
          snapshot: Json | null;
        };
        Insert: {
          order_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          total: number;
          variant_id?: string | null;
          variant_name?: string | null;
          sku?: string | null;
          snapshot?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          provider: "stripe" | "razorpay" | "cod";
          provider_payment_id: string | null;
          provider_order_id: string | null;
          status: "pending" | "processing" | "succeeded" | "failed" | "refunded" | "cancelled";
          amount: number;
          currency: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          provider: "stripe" | "razorpay" | "cod";
          amount: number;
          currency: string;
          status?: "pending" | "processing" | "succeeded" | "failed" | "refunded" | "cancelled";
          provider_payment_id?: string | null;
          provider_order_id?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      reviews: {
        Row: {
          id: string;
          product_id: string;
          user_id: string;
          rating: number;
          title: string | null;
          body: string | null;
          is_verified: boolean;
          is_approved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          product_id: string;
          user_id: string;
          rating: number;
          title?: string | null;
          body?: string | null;
          is_verified?: boolean;
          is_approved?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cms_pages: {
        Row: {
          id: string;
          title: string;
          slug: string;
          content: string | null;
          seo_title: string | null;
          seo_desc: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          slug: string;
          content?: string | null;
          seo_title?: string | null;
          seo_desc?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["cms_pages"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "cms_pages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      homepage_sections: {
        Row: {
          id: string;
          type:
            | "hero_banner"
            | "featured_products"
            | "promotional_banner"
            | "category_grid"
            | "testimonials"
            | "newsletter";
          title: string | null;
          subtitle: string | null;
          content: Json;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          type:
            | "hero_banner"
            | "featured_products"
            | "promotional_banner"
            | "category_grid"
            | "testimonials"
            | "newsletter";
          content: Json;
          title?: string | null;
          subtitle?: string | null;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["homepage_sections"]["Insert"]>;
        Relationships: [];
      };
      order_status_history: {
        Row: {
          id: string;
          order_id: string;
          from_status: "draft" | "pending" | "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "partially_returned" | "partially_refunded" | "refunded" | null;
          to_status: "draft" | "pending" | "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "partially_returned" | "partially_refunded" | "refunded";
          changed_by: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          order_id: string;
          to_status: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
          from_status?: "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded" | null;
          changed_by?: string | null;
          reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["order_status_history"]["Insert"]>;
        Relationships: [];
      };
      coupon_usage: {
        Row: {
          id: string;
          coupon_id: string;
          user_id: string;
          order_id: string | null;
          used_at: string;
        };
        Insert: {
          coupon_id: string;
          user_id: string;
          order_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["coupon_usage"]["Insert"]>;
        Relationships: [];
      };
      idempotency_keys: {
        Row: {
          id: string;
          key: string;
          response_body: Json | null;
          created_at: string;
        };
        Insert: {
          key: string;
          response_body?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["idempotency_keys"]["Insert"]>;
        Relationships: [];
      };
      return_requests: {
        Row: {
          id: string;
          order_id: string;
          user_id: string;
          status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
          reason: string;
          notes: string | null;
          admin_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          return_window_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          user_id: string;
          reason: string;
          status?: "pending" | "approved" | "rejected" | "completed" | "cancelled";
          notes?: string | null;
          admin_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          return_window_expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["return_requests"]["Insert"]>;
        Relationships: [];
      };
      return_items: {
        Row: {
          id: string;
          return_request_id: string;
          order_item_id: string;
          quantity: number;
          reason: string | null;
          condition: "new" | "good" | "damaged" | "defective" | null;
          restock: boolean;
          refund_amount: number | null;
          created_at: string;
        };
        Insert: {
          return_request_id: string;
          order_item_id: string;
          quantity: number;
          reason?: string | null;
          condition?: "new" | "good" | "damaged" | "defective" | null;
          restock?: boolean;
          refund_amount?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["return_items"]["Insert"]>;
        Relationships: [];
      };
      payment_events: {
        Row: {
          id: string;
          payment_id: string;
          order_id: string;
          event_type: string;
          provider: string;
          amount: number | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          payment_id: string;
          order_id: string;
          event_type: string;
          provider: string;
          amount?: number | null;
          payload?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["payment_events"]["Insert"]>;
        Relationships: [];
      };
      shipment_tracking: {
        Row: {
          id: string;
          order_id: string;
          carrier: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          status: string;
          estimated_delivery: string | null;
          delivered_at: string | null;
          events: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          order_id: string;
          carrier?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          status?: string;
          estimated_delivery?: string | null;
          delivered_at?: string | null;
          events?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["shipment_tracking"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      generate_order_number: {
        Args: Record<never, never>;
        Returns: string;
      };
      reserve_inventory: {
        Args: { p_variant_id: string; p_quantity: number };
        Returns: undefined;
      };
      release_inventory: {
        Args: { p_variant_id: string; p_quantity: number };
        Returns: undefined;
      };
      confirm_inventory_sale: {
        Args: { p_variant_id: string; p_quantity: number };
        Returns: undefined;
      };
      increment_coupon_usage: {
        Args: { p_coupon_id: string };
        Returns: undefined;
      };
      available_inventory: {
        Args: { p_variant_id: string };
        Returns: number;
      };
      create_order_atomic: {
        Args: {
          p_user_id: string;
          p_cart_items: Json;
          p_subtotal: number;
          p_tax: number;
          p_shipping: number;
          p_discount: number;
          p_total: number;
          p_coupon_id: string | null;
          p_coupon_code: string | null;
          p_shipping_address: Json;
          p_billing_address: Json;
          p_notes: string | null;
        };
        Returns: string;
      };
      update_order_status: {
        Args: {
          p_order_id: string;
          p_new_status: "draft" | "pending" | "pending_payment" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "partially_returned" | "partially_refunded" | "refunded";
          p_changed_by: string | null;
          p_reason?: string | null;
        };
        Returns: undefined;
      };
      release_inventory_for_order: {
        Args: { p_order_id: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      commit_inventory_for_order: {
        Args: { p_order_id: string; p_actor_id?: string | null };
        Returns: undefined;
      };
      record_inventory_movement: {
        Args: {
          p_variant_id: string;
          p_type: string;
          p_quantity: number;
          p_previous_qty: number;
          p_new_qty: number;
          p_source_type: string;
          p_source_id: string | null;
          p_note: string | null;
          p_actor_id: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
