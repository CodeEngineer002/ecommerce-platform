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
// Per-line safety cap. Stock is the real constraint; this is just a DB sanity limit.
export const CART_MAX_QUANTITY = 50;

export const ORDER_STATUSES = {
  draft:                 { label: "Draft",                  color: "gray"   },
  pending:               { label: "Pending",                color: "yellow" },
  pending_payment:       { label: "Awaiting Payment",       color: "yellow" },
  confirmed:             { label: "Confirmed",              color: "blue"   },
  processing:            { label: "Processing",             color: "blue"   },
  packed:                { label: "Packed",                 color: "blue"   },
  shipped:               { label: "Shipped",                color: "purple" },
  out_for_delivery:      { label: "Out for Delivery",       color: "purple" },
  delivered:             { label: "Delivered",              color: "green"  },
  cancelled:             { label: "Cancelled",              color: "red"    },
  failed:                { label: "Failed",                 color: "red"    },
  return_requested:      { label: "Return Requested",       color: "yellow" },
  return_approved:       { label: "Return Approved",        color: "blue"   },
  return_rejected:       { label: "Return Rejected",        color: "red"    },
  return_in_transit:     { label: "Return In Transit",      color: "purple" },
  returned:              { label: "Returned",               color: "gray"   },
  replacement_requested: { label: "Replacement Requested",  color: "yellow" },
  replacement_approved:  { label: "Replacement Approved",   color: "blue"   },
  replacement_rejected:  { label: "Replacement Rejected",   color: "red"    },
  replacement_shipped:   { label: "Replacement Shipped",    color: "purple" },
  replacement_delivered: { label: "Replacement Delivered",  color: "green"  },
  refund_requested:      { label: "Refund Requested",       color: "yellow" },
  refund_processing:     { label: "Refund Processing",      color: "blue"   },
  partially_returned:    { label: "Partially Returned",     color: "orange" },
  partially_refunded:    { label: "Partially Refunded",     color: "orange" },
  refunded:              { label: "Refunded",               color: "gray"   },

  // ── order_returns.status values ──────────────────────────────────────────
  // These are used by StatusBadge when displaying return/replacement request
  // status (separate from order-level statuses above).
  requested:                   { label: "Requested",                   color: "yellow" },
  approved:                    { label: "Approved",                    color: "blue"   },
  rejected:                    { label: "Rejected",                    color: "red"    },
  pickup_scheduled:            { label: "Pickup Scheduled",            color: "purple" },
  in_transit:                  { label: "Item Collected",              color: "purple" },
  received:                    { label: "Received at Warehouse",       color: "blue"   },
  inspected:                   { label: "Inspected",                   color: "blue"   },
  accepted:                    { label: "Accepted",                    color: "green"  },
  rejected_after_inspection:   { label: "Rejected After Inspection",   color: "red"    },
  replaced:                    { label: "Replaced",                    color: "green"  },
  closed:                      { label: "Closed",                      color: "gray"   },
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
  sale: "/sale",
  cart: "/cart",
  checkout: "/checkout",
  orderSuccess: (id: string) => `/orders/${id}/success`,
  orders: "/orders",
  order: (id: string) => `/orders/${id}`,
  orderReturn: (id: string) => `/orders/${id}/return`,
  profile: "/profile",
  addresses: "/profile/addresses",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  wishlist: "/wishlist",
  search: "/search",
  admin: {
    dashboard:        "/admin",
    products:         "/admin/products",
    newProduct:       "/admin/products/new",
    editProduct:      (id: string) => `/admin/products/${id}/edit`,
    categories:       "/admin/categories",
    orders:           "/admin/orders",
    orderExceptions:  "/admin/orders/exceptions",
    returns:          "/admin/returns",
    customers:        "/admin/customers",
    analytics:        "/admin/analytics",
    inventory:        "/admin/inventory",
    coupons:          "/admin/coupons",
    // CMS — country-first routes
    cms:              "/admin/cms",
    // Function helpers for country-first CMS navigation
    cmsLocale: (country: string, lang: string) =>
      `/admin/cms/${country}/${lang}`,
    cmsModule: (country: string, lang: string, mod: string) =>
      `/admin/cms/${country}/${lang}/${mod}`,
    // Legacy aliases — redirect to country-first URLs
    cmsHomepage:      "/admin/cms",
    cmsBlocks:        "/admin/cms",
    cmsNavigation:    "/admin/cms",
    cmsBanners:       "/admin/cms",
    cmsMedia:         "/admin/cms",
  },
} as const;
