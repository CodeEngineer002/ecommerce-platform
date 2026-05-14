import { env } from "@/lib/env";

export const APP_NAME = env.NEXT_PUBLIC_APP_NAME;
export const APP_URL = env.NEXT_PUBLIC_APP_URL;

export const CURRENCY = "INR";
export const CURRENCY_LOCALE = "en-IN";

export const TAX_RATE = 0.18; // 18% GST
export const FREE_SHIPPING_THRESHOLD = 999;
export const SHIPPING_COST = 99;

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
export const CART_MAX_QUANTITY = 10;

export const ORDER_STATUSES = {
  pending: { label: "Pending", color: "yellow" },
  confirmed: { label: "Confirmed", color: "blue" },
  processing: { label: "Processing", color: "blue" },
  shipped: { label: "Shipped", color: "purple" },
  delivered: { label: "Delivered", color: "green" },
  cancelled: { label: "Cancelled", color: "red" },
  refunded: { label: "Refunded", color: "gray" },
} as const;

export const PAYMENT_PROVIDERS = {
  stripe: "Stripe",
  razorpay: "Razorpay",
  cod: "Cash on Delivery",
} as const;

export const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Price: Low to High", value: "price_asc" },
  { label: "Price: High to Low", value: "price_desc" },
  { label: "Name A-Z", value: "name_asc" },
  { label: "Top Rated", value: "rating" },
] as const;

export const IMAGE_PLACEHOLDER = "/images/placeholder.png";
export const AVATAR_PLACEHOLDER = "/images/avatar-placeholder.png";

export const ROUTES = {
  home: "/",
  products: "/products",
  product: (slug: string) => `/products/${slug}`,
  category: (slug: string) => `/categories/${slug}`,
  cart: "/cart",
  checkout: "/checkout",
  orderSuccess: (id: string) => `/orders/${id}/success`,
  orders: "/orders",
  order: (id: string) => `/orders/${id}`,
  profile: "/profile",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  wishlist: "/wishlist",
  search: "/search",
  admin: {
    dashboard: "/admin",
    products: "/admin/products",
    newProduct: "/admin/products/new",
    editProduct: (id: string) => `/admin/products/${id}/edit`,
    categories: "/admin/categories",
    orders: "/admin/orders",
    customers: "/admin/customers",
    analytics: "/admin/analytics",
    cms: "/admin/cms",
    inventory: "/admin/inventory",
    coupons: "/admin/coupons",
  },
} as const;
