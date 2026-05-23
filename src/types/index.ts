import type { Database } from "./database.types";

// ─── Row aliases ───────────────────────────────────────────────────────────────
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];
export type Inventory = Database["public"]["Tables"]["inventory"]["Row"];
export type Address = Database["public"]["Tables"]["addresses"]["Row"];
export type Cart = Database["public"]["Tables"]["carts"]["Row"];
export type CartItem = Database["public"]["Tables"]["cart_items"]["Row"];
export type Wishlist = Database["public"]["Tables"]["wishlists"]["Row"];
export type Coupon = Database["public"]["Tables"]["coupons"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Review = Database["public"]["Tables"]["reviews"]["Row"];
// ─── Localized CMS types ───────────────────────────────────────────────────────
export type LocalizedCmsPage = Database["public"]["Tables"]["localized_cms_pages"]["Row"];
export type LocalizedHomepageSection = Database["public"]["Tables"]["localized_homepage_sections"]["Row"];
export type CmsBlock = Database["public"]["Tables"]["cms_blocks"]["Row"];
export type CmsPageVersion = Database["public"]["Tables"]["cms_page_versions"]["Row"];
export type CmsNavigationMenu = Database["public"]["Tables"]["cms_navigation_menus"]["Row"];
export type CmsNavigationItem = Database["public"]["Tables"]["cms_navigation_items"]["Row"];
export type CmsBanner = Database["public"]["Tables"]["cms_banners"]["Row"];
export type MediaAsset = Database["public"]["Tables"]["media_assets"]["Row"];
export type MediaFolder = Database["public"]["Tables"]["media_folders"]["Row"];

// ─── Enriched variant type with identifier model fields (ADR-008) ─────────────
/**
 * Variant enriched with the full identifier model.
 * These fields are added by migration 00025 and may be null for
 * products created before that migration was applied.
 */
export type ProductVariantWithIdentifiers = ProductVariant & {
  /** Standardized color abbreviation — BLK, BEI, OLV, NVY, CHR, etc. */
  color_code: string | null;
  /** Standardized size code — XS, S, M, L, XL, XXL, etc. */
  size_code: string | null;
  /** GTIN/EAN/UPC barcode for this specific variant */
  barcode: string | null;
  /** Supplier's own reference code for this variant — used for ERP reconciliation */
  supplier_sku: string | null;
  /** True if this is the canonical default variant shown on the PDP */
  is_default: boolean;
};

/**
 * Inventory level row from inventory_levels table (multi-warehouse, migration 00017).
 * Used in admin contexts. Do NOT use the legacy inventory table.
 */
export type InventoryLevel = {
  quantity: number;
  reserved: number;
};

// ─── Enriched / composed types ────────────────────────────────────────────────
export type ProductWithDetails = Product & {
  /** product_code: human/business-readable product identifier (ADR-008, migration 00025) */
  product_code?: string | null;
  category: Category | null;
  images: ProductImage[];
  variants: (ProductVariantWithIdentifiers & {
    /** Legacy inventory table — retained for backward compat only; prefer inventory_levels */
    inventory?: Inventory | null;
    /** Source of truth (migration 00017 / CLAUDE.md Step 1). Array: one row per warehouse. */
    inventory_levels?: InventoryLevel[] | null;
  })[];
  avg_rating?: number | null;
  review_count?: number;
};

export type CartItemWithProduct = CartItem & {
  variant: ProductVariant & {
    product: Product & { images: ProductImage[] };
  };
};

// ─── Admin-specific types ─────────────────────────────────────────────────────

/** Flat inventory row for admin inventory table display */
export interface AdminInventoryRow {
  variantId: string;
  productName: string;
  productCode: string | null;
  sku: string | null;
  variantName: string;
  color: string | null;
  colorCode: string | null;
  size: string | null;
  sizeCode: string | null;
  quantity: number;
  reserved: number;
  available: number;
}

/** Order item snapshot shape — captures all identifiers at purchase time (ADR-002) */
export interface OrderItemSnapshot {
  variant_id: string;
  product_id: string | null;
  product_code: string | null;
  sku: string | null;
  color: string | null;
  size: string | null;
  price_at_purchase: number;
}

export type OrderWithItems = Order & {
  items: OrderItem[];
  payment: Payment | null;
};

// ─── App-level domain types ───────────────────────────────────────────────────
export type UserRole = Profile["role"];

export type OrderStatus = Order["status"];

export type PaymentStatus = Payment["status"];

export type PaymentProvider = Payment["provider"];

export type SectionType = Database["public"]["Enums"]["section_type"];

export interface PaginatedResult<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ProductFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  search?: string;
  isFeatured?: boolean;
  /** When true, only return products that have at least one variant with a compare_at price set */
  onSale?: boolean;
  sortBy?: "price_asc" | "price_desc" | "newest" | "name_asc" | "rating";
  page?: number;
  pageSize?: number;
  countryId?: string; // filter by country availability (empty array = all countries)
}

export interface AddressPayload {
  full_name: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  region_code: string;
  postal_code: string;
  country: string;
}

export interface CheckoutPayload {
  /**
   * Minimum the server needs — variant_id + quantity. The server re-fetches
   * everything else (price, name, stock) atomically inside create_order_atomic
   * so client-sent product info is ignored anyway. Was previously typed as
   * CartItemWithProduct[] which over-specified the contract.
   */
  cartItems: Array<{ variant_id: string; quantity: number }>;
  shippingAddress: AddressPayload;
  billingAddress?: AddressPayload;
  couponCode?: string;
  paymentProvider: PaymentProvider;
  notes?: string;
  /** The specific cart being checked out. Used by the API to convert exactly
   *  this cart, preventing stale-cart and duplicate-order issues. */
  cartId?: string;
  /**
   * Client-generated UUID sent as the `Idempotency-Key` HTTP header.
   * The server deduplicates requests with the same key so network retries
   * and accidental double-submits never create a second order.
   * Generated once per checkout component mount (useRef in checkout page).
   * Stripped from the request body — only sent as a header.
   */
  idempotencyKey?: string;
}

export interface PriceBreakdown {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

