// ─────────────────────────────────────────────────────────────────────────────
// TYPE-SAFE TRANSLATION SYSTEM
// Lazy-loads JSON message bundles by language. Compatible with react-intl /
// next-intl message format. Can be swapped for next-intl in Phase 7 with
// zero changes to message files.
// ─────────────────────────────────────────────────────────────────────────────

import type { LanguageCode } from './config';

// ── Message shape ─────────────────────────────────────────────────────────────

export interface Messages {
  nav: {
    shop: string;
    electronics: string;
    fashion: string;
    sale: string;
    cart: string;
    wishlist: string;
    search: string;
    account: string;
    signIn: string;
    signOut: string;
    backToStore: string;
  };
  product: {
    addToCart: string;
    outOfStock: string;
    inStock: string;
    lowStock: string;
    viewDetails: string;
    reviews: string;
    noReviews: string;
    price: string;
    originalPrice: string;
    discount: string;
  };
  cart: {
    title: string;
    empty: string;
    emptyHint: string;
    subtotal: string;
    tax: string;
    shipping: string;
    freeShipping: string;
    total: string;
    checkout: string;
    continueShopping: string;
    remove: string;
    quantity: string;
  };
  checkout: {
    title: string;
    shippingAddress: string;
    billingAddress: string;
    paymentMethod: string;
    placeOrder: string;
    orderSummary: string;
    couponCode: string;
    applyCoupon: string;
  };
  order: {
    title: string;
    myOrders: string;
    orderNumber: string;
    placedOn: string;
    status: {
      draft: string;
      pending: string;
      pending_payment: string;
      confirmed: string;
      processing: string;
      shipped: string;
      delivered: string;
      cancelled: string;
      partially_returned: string;
      partially_refunded: string;
      refunded: string;
    };
  };
  auth: {
    signIn: string;
    signUp: string;
    signOut: string;
    email: string;
    password: string;
    forgotPassword: string;
    resetPassword: string;
    noAccount: string;
    hasAccount: string;
    fullName: string;
  };
  common: {
    loading: string;
    error: string;
    tryAgain: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    back: string;
    next: string;
    previous: string;
    search: string;
    noResults: string;
    seeAll: string;
    close: string;
    confirm: string;
    yes: string;
    no: string;
  };
  home: {
    heroCta: string;
    shopByCategory: string;
    trending: string;
    newArrivals: string;
    freeShipping: string;
    freeShippingDesc: string;
    securePayment: string;
    securePaymentDesc: string;
    fastDelivery: string;
    fastDeliveryDesc: string;
    topQuality: string;
    topQualityDesc: string;
  };
}

// ── Lazy loader ───────────────────────────────────────────────────────────────

const cache = new Map<LanguageCode, Messages>();

export async function loadMessages(lang: LanguageCode): Promise<Messages> {
  if (cache.has(lang)) return cache.get(lang)!;

  const messages = (await import(`../../../messages/${lang}.json`)) as { default: Messages };
  cache.set(lang, messages.default);
  return messages.default;
}

// ── Simple translator (server + client) ───────────────────────────────────────

type DeepKeyOf<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? DeepKeyOf<T[K], `${Prefix}${K}.`>
          : `${Prefix}${K}`
        : never;
    }[keyof T]
  : never;

export type MessageKey = DeepKeyOf<Messages>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj) as string ?? path;
}

export function createTranslator(messages: Messages) {
  return function t(key: MessageKey): string {
    return getNestedValue(messages as unknown as Record<string, unknown>, key);
  };
}
