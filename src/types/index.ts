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
export type CmsPage = Database["public"]["Tables"]["cms_pages"]["Row"];
export type HomepageSection = Database["public"]["Tables"]["homepage_sections"]["Row"];

// ─── Enriched / composed types ────────────────────────────────────────────────
export type ProductWithDetails = Product & {
  category: Category | null;
  images: ProductImage[];
  variants: (ProductVariant & { inventory: Inventory | null })[];
  avg_rating?: number | null;
  review_count?: number;
};

export type CartItemWithProduct = CartItem & {
  variant: ProductVariant & {
    product: Product & { images: ProductImage[] };
  };
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  payment: Payment | null;
};

// ─── App-level domain types ───────────────────────────────────────────────────
export type UserRole = Profile["role"];

export type OrderStatus = Order["status"];

export type PaymentStatus = Payment["status"];

export type PaymentProvider = Payment["provider"];

export type SectionType = HomepageSection["type"];

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
  sortBy?: "price_asc" | "price_desc" | "newest" | "name_asc" | "rating";
  page?: number;
  pageSize?: number;
}

export interface AddressPayload {
  full_name: string;
  phone?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface CheckoutPayload {
  cartItems: CartItemWithProduct[];
  shippingAddress: AddressPayload;
  billingAddress?: AddressPayload;
  couponCode?: string;
  paymentProvider: PaymentProvider;
  notes?: string;
}

export interface PriceBreakdown {
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
}

export interface CmsHeroBannerContent {
  cta_text: string;
  cta_link: string;
  image_url: string;
  badge?: string;
}

export interface CmsFeaturedProductsContent {
  limit: number;
  product_ids?: string[];
}

export interface CmsPromotionalBannerContent {
  bg_color?: string;
  cta_text: string;
  cta_link: string;
}
