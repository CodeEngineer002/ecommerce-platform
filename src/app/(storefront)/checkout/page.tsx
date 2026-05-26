"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, PackageCheck, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";

import type { CustomerAddress } from "@/domain/address/types";
import { FormField } from "@/components/common/form-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useServerCart } from "@/features/cart/hooks/use-server-cart";
import { CheckoutAddressPanel } from "@/features/checkout/components/checkout-address-panel";
import { StripePaymentForm } from "@/features/checkout/components/stripe-payment-form";
import { useCreateOrder } from "@/features/orders/hooks/use-orders";
import { ROUTES } from "@/lib/constants";
import {
  checkCodEligibility,
  getCurrencyForCountry,
  resolveServiceability,
} from "@/lib/i18n/region-config";
import { useFormatPrice } from "@/hooks/use-format-price";
import { checkoutExtrasSchema, type CheckoutExtrasData } from "@/lib/validators";
import { useCartStore } from "@/store/cart-store";
import { useUserStore } from "@/store/user-store";
import { countryIdToIso } from "@/domain/address/region-policy";

// ── Address validation helper ─────────────────────────────────────────────────

async function validateSavedAddress(
  address: CustomerAddress,
  countryHeader: string,
): Promise<{ valid: boolean; errors?: Record<string, string[]> }> {
  const fullName = [address.first_name, address.last_name].filter(Boolean).join(" ");
  const res = await fetch("/api/address/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-country": countryHeader,
    },
    body: JSON.stringify({
      full_name:     fullName,
      phone:         address.phone,
      address_line1: address.address_line1,
      address_line2: address.address_line2,
      country_code:  address.country_code,
      region_code:   null,
      city:          address.city,
      postal_code:   address.postal_code,
    }),
  });
  if (res.ok) return { valid: true };
  const body = (await res.json()) as { error?: { fields?: Record<string, string[]> } };
  return { valid: false, errors: body.error?.fields };
}

// ── Checkout skeleton ─────────────────────────────────────────────────────────

function CheckoutSkeleton() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-8 h-8 w-40" />
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-28 w-full rounded-lg" />
          </Card>
          <Card className="p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </Card>
        </div>
        <div className="h-fit space-y-4">
          <Card className="p-6 space-y-3">
            <Skeleton className="h-5 w-32" />
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { isLoading: cartLoading } = useServerCart();
  const serverCart   = useCartStore((s) => s.serverCart);
  const items        = useCartStore((s) => s.items);
  const serverCartId = useCartStore((s) => s.serverCartId);

  // ── Authoritative cart payload for order creation ─────────────────────────
  // serverCart is the canonical source of truth (any device, any session).
  // items (legacy Zustand) is a fallback for guest/pre-hydration scenarios only.
  // NEVER trust items when serverCart is populated — items can be stale/empty
  // on a new device or fresh browser session where localStorage was cleared.
  const cartItemsPayload = useMemo(() => {
    if (serverCart?.items.length) {
      return serverCart.items.map((i) => ({
        variant_id: i.variant_id,
        quantity:   i.quantity,
      }));
    }
    // Guest fallback: enriched legacy items (populated by useCartHydration when !serverCart)
    return items.map((i) => ({
      variant_id: i.variant_id,
      quantity:   i.quantity,
    }));
  }, [serverCart, items]);
  const { user } = useUserStore();
  const { mutate: createOrder, isPending, data: orderResult } = useCreateOrder();
  // Sync guard — prevents a second tap/click from firing a second mutation
  // before React re-renders with isPending=true (async state timing gap).
  const submittingRef = useRef(false);
  // Stable idempotency key — generated once per checkout component mount.
  // The same key is reused on every retry/re-render so the server can detect
  // duplicates and return the cached order instead of creating a second one.
  // A new key is produced on page refresh (component remount) which correctly
  // represents a fresh order intent.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  // Stays true from the moment we submit until navigation away (or on error).
  // Prevents the "Your cart is empty" flash that occurs when the cart is
  // cleared server-side before the success-page navigation completes.
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const fmt = useFormatPrice();

  const params = useParams<{ country?: string }>();
  // Prefer the country from serverCart (set by middleware/cart-service) as it
  // is always correct. Fall back to URL param, then "us" as last resort.
  const activeCountryIso = serverCart?.country_id
    ? countryIdToIso(serverCart.country_id)
    : params?.country
      ? countryIdToIso(params.country)
      : "US";

  // Pricing — always from serverCart when available (server-authoritative)
  const pricing = serverCart?.pricing;

  // Address selection state
  const [selectedShipping, setSelectedShipping] = useState<CustomerAddress | null>(null);
  const [shippingValidated, setShippingValidated] = useState(false);
  const [shippingValidating, setShippingValidating] = useState(false);
  const [shippingErrors, setShippingErrors] = useState<Record<string, string[]> | null>(null);

  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [selectedBilling, setSelectedBilling] = useState<CustomerAddress | null>(null);
  const [billingValidated, setBillingValidated] = useState(false);
  const [billingValidating, setBillingValidating] = useState(false);
  const [billingErrors, setBillingErrors] = useState<Record<string, string[]> | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutExtrasData>({
    resolver: zodResolver(checkoutExtrasSchema),
    defaultValues: {
      useSameAddress: true,
      paymentProvider: "cod",
    },
  });

  // ── P0-1: COD eligibility (region + amount cap) ───────────────────────────
  // Eligibility is recomputed whenever the active country or pricing changes.
  // The server is the source of truth (api/orders/create re-checks), but we
  // drive the UI here so customers see the right options instead of failing
  // at submit time.
  // Defer pincode + serviceability eligibility derivation till after the
  // serviceability state is declared below. We just stash the amount-based
  // eligibility here; the combined `codAvailable` is computed lower.
  const codEligibility = checkCodEligibility(activeCountryIso, pricing?.total ?? 0);
  const selectedPayment = watch("paymentProvider");

  // ── P0-2: pincode serviceability state ────────────────────────────────────
  // Recomputed whenever the shipping address changes. The server re-checks
  // at order placement (api/orders/create) but this surfaces the result
  // BEFORE the user fills out coupons/notes/etc.
  const [serviceability, setServiceability] = useState<{
    checking:        boolean;
    found:           boolean;
    is_deliverable:  boolean;
    cod_enabled:     boolean;
    pincode:         string | null;
  }>({ checking: false, found: false, is_deliverable: true, cod_enabled: true, pincode: null });

  // Pincode-level COD gate. `serviceability.cod_enabled` is already
  // policy-resolved (resolveServiceability handled strict/permissive/off),
  // so we just need to honour it once the customer has actually picked an
  // address. Before that, default to permissive.
  const codBlockedByPincode =
    serviceability.pincode !== null && !serviceability.cod_enabled;

  // Single derived flag the UI cares about: COD is available iff amount-cap
  // passes AND pincode allows it.
  const codAvailable = codEligibility.ok && !codBlockedByPincode;

  // Pre-narrowed reason so the JSX doesn't have to discriminate the union.
  const codUnavailableReason: "disabled" | "over_limit" | "pincode" | null =
    codEligibility.ok === false
      ? codEligibility.reason
      : codBlockedByPincode
        ? "pincode"
        : null;
  const codMaxAmount =
    codEligibility.ok === false ? codEligibility.maxAmount : null;

  // If the customer had COD selected but it just became unavailable (amount
  // crossed cap, pincode changed, etc.), force-switch to stripe so submit
  // isn't a dead end.
  useEffect(() => {
    if (selectedPayment === "cod" && !codAvailable) {
      setValue("paymentProvider", "stripe");
    }
  }, [codAvailable, selectedPayment, setValue]);

  // ── Per-country payment methods (admin-configurable) ──────────────────────
  // Fetched from /api/payment-methods?country=… Returns only enabled rows.
  // Drives which radios render + their labels. If a method is missing from
  // this list, it's not available in the current country at all.
  interface PaymentMethodOption {
    method:      string;
    label:       string;
    description: string | null;
    sort_order:  number;
  }
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/payment-methods?country=${encodeURIComponent(activeCountryIso)}`,
        );
        const json = await res.json() as {
          data?: { methods: PaymentMethodOption[] };
        };
        if (!cancelled) setPaymentMethods(json.data?.methods ?? []);
      } catch {
        // Lookup failure — fall back to a hardcoded list so checkout still
        // works. Server re-checks at order placement.
        if (!cancelled) {
          setPaymentMethods([
            { method: "stripe", label: "Credit / Debit Card", description: null, sort_order: 10 },
          ]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [activeCountryIso]);

  // Auto-switch away from disabled methods (when the country no longer
  // enables what was selected).
  const codInCountry    = paymentMethods.some((m) => m.method === "cod");
  const stripeInCountry = paymentMethods.some((m) => m.method === "stripe");
  useEffect(() => {
    if (selectedPayment === "cod"    && !codInCountry)    setValue("paymentProvider", "stripe");
    if (selectedPayment === "stripe" && !stripeInCountry && codInCountry) setValue("paymentProvider", "cod");
  }, [codInCountry, stripeInCountry, selectedPayment, setValue]);

  // ── Auto-validate on address select ───────────────────────────────────────
  // Validates immediately when the user picks a saved address,
  // eliminating the extra manual "Verify Address" click.

  const handleShippingSelect = useCallback(async (addr: CustomerAddress) => {
    setSelectedShipping(addr);
    setShippingValidated(false);
    setShippingErrors(null);
    setShippingValidating(true);
    const result = await validateSavedAddress(addr, activeCountryIso.toLowerCase());
    setShippingValidating(false);
    setShippingValidated(result.valid);
    if (!result.valid) setShippingErrors(result.errors ?? null);

    // Kick off serviceability lookup in parallel — non-blocking on the
    // address-validation flow but used by the COD radio + submit guard.
    // resolveServiceability() applies the country's pincodeEnforcement
    // policy on top of the raw lookup so the UI matches the server gate
    // exactly (no surprises at submit time).
    setServiceability((s) => ({ ...s, checking: true, pincode: addr.postal_code }));
    try {
      const qs  = new URLSearchParams({ country: addr.country_code, pincode: addr.postal_code });
      const res = await fetch(`/api/serviceability/check?${qs}`);
      const json = await res.json() as {
        data?: { found: boolean; is_deliverable: boolean; cod_enabled: boolean };
      };
      const raw = json.data ?? null;
      const resolved = resolveServiceability(addr.country_code, raw);
      setServiceability({
        checking:       false,
        found:          raw?.found ?? false,
        is_deliverable: resolved.is_deliverable,
        cod_enabled:    resolved.cod_enabled,
        pincode:        addr.postal_code,
      });
    } catch {
      // Network / lookup outage — apply policy with no row found. Permissive
      // and off policies will allow through; strict will block. Either way
      // the server re-checks at order placement.
      const resolved = resolveServiceability(addr.country_code, null);
      setServiceability({
        checking:       false,
        found:          false,
        is_deliverable: resolved.is_deliverable,
        cod_enabled:    resolved.cod_enabled,
        pincode:        addr.postal_code,
      });
    }
  }, [activeCountryIso]);

  const handleBillingSelect = useCallback(async (addr: CustomerAddress) => {
    setSelectedBilling(addr);
    setBillingValidated(false);
    setBillingErrors(null);
    setBillingValidating(true);
    const result = await validateSavedAddress(addr, activeCountryIso.toLowerCase());
    setBillingValidating(false);
    setBillingValidated(result.valid);
    if (!result.valid) setBillingErrors(result.errors ?? null);
  }, [activeCountryIso]);

  // ── Place Order ────────────────────────────────────────────────────────────

  async function handlePlaceOrder(data: CheckoutExtrasData) {
    // Synchronous double-submit guard (React isPending has an async re-render gap)
    if (submittingRef.current) return;
    submittingRef.current = true;

    if (!selectedShipping) {
      toast.error("Please select a shipping address");
      submittingRef.current = false;
      return;
    }
    if (!shippingValidated) {
      toast.error("Shipping address is still being verified — please wait");
      submittingRef.current = false;
      return;
    }
    if (shippingErrors) {
      toast.error("Shipping address has validation errors");
      submittingRef.current = false;
      return;
    }

    const billingAddress = billingSameAsShipping ? selectedShipping : selectedBilling;
    if (!billingSameAsShipping) {
      if (!selectedBilling) {
        toast.error("Please select a billing address");
        submittingRef.current = false;
        return;
      }
      if (!billingValidated || billingErrors) {
        toast.error("Billing address has validation errors");
        submittingRef.current = false;
        return;
      }
    }

    function toAddressPayload(addr: CustomerAddress) {
      return {
        full_name:     [addr.first_name, addr.last_name].filter(Boolean).join(" "),
        phone:         addr.phone ?? undefined,
        address_line1: addr.address_line1,
        address_line2: addr.address_line2 ?? undefined,
        city:          addr.city,
        state:         addr.state,
        region_code:   addr.state ?? "",
        postal_code:   addr.postal_code,
        country:       addr.country_code,
      };
    }

    // Safety guard — should never happen if the UI gate works, but prevents
    // sending an empty cartItems array to the API on edge-case state races.
    if (cartItemsPayload.length === 0) {
      toast.error("Your cart appears empty. Please add items and try again.");
      submittingRef.current = false;
      return;
    }

    // P2-6: Validate cart server-side before placing order.
    // This catches stale items, out-of-stock variants, and expired carts
    // before we charge the customer.
    const cartId = serverCartId ?? serverCart?.id;
    if (cartId) {
      try {
        const validateRes = await fetch(`/api/cart/${cartId}/validate`);
        if (!validateRes.ok) {
          const err = await validateRes.json().catch(() => ({})) as { error?: string };
          toast.error(err.error ?? "Cart validation failed. Please review your cart and try again.");
          submittingRef.current = false;
          return;
        }
        const { data: cartSummary } = await validateRes.json() as { data: { warnings?: Array<{ type: string }> } };
        const blockingWarningTypes = ["ITEM_UNAVAILABLE", "CART_EXPIRED"];
        const blockingWarnings = cartSummary?.warnings?.filter((w) => blockingWarningTypes.includes(w.type)) ?? [];
        if (blockingWarnings.length > 0) {
          toast.error("Some cart items are unavailable. Please review your cart before placing the order.");
          submittingRef.current = false;
          return;
        }
      } catch {
        // Validation is a best-effort guard — network failure should not block checkout
        console.warn("[checkout] cart validate request failed — proceeding");
      }
    }

    setIsPlacingOrder(true);
    createOrder(
      {
        cartItems:        cartItemsPayload,
        shippingAddress:  toAddressPayload(selectedShipping),
        billingAddress:   toAddressPayload(billingAddress!),
        // MISSING-2 fix: prefer explicit form input; fall back to coupon applied
        // on the cart page so the discount is never silently dropped.
        couponCode:       data.couponCode || serverCart?.coupon_code || undefined,
        paymentProvider:  data.paymentProvider,
        notes:            data.notes,
        cartId:           serverCartId ?? serverCart?.id ?? undefined,
        // Stable key for server-side deduplication — same on retries,
        // different on each new component mount (fresh checkout intent).
        idempotencyKey:   idempotencyKeyRef.current,
      },
      {
        onError:   () => { setIsPlacingOrder(false); submittingRef.current = false; },
        onSettled: () => { submittingRef.current = false; },
      },
    );
  }

  // ── Block reason ──────────────────────────────────────────────────────────

  function getBlockReason(): string | null {
    if (!selectedShipping) return "Select a shipping address to continue";
    if (shippingValidating) return "Verifying shipping address…";
    if (shippingErrors) return "Shipping address has validation errors";
    if (!shippingValidated) return "Waiting for address verification…";
    if (serviceability.checking) return "Checking delivery availability for your pincode…";
    if (serviceability.pincode !== null && !serviceability.is_deliverable) {
      return `We don't deliver to pincode ${serviceability.pincode} yet. Choose a different shipping address.`;
    }
    if (!billingSameAsShipping && !selectedBilling) return "Select a billing address to continue";
    if (billingValidating) return "Verifying billing address…";
    if (billingErrors) return "Billing address has validation errors";
    return null;
  }

  const blockReason = getBlockReason();
  const isBlocked   = !!blockReason || isPending;

  // ── Loading / empty states ─────────────────────────────────────────────────
  // Show skeleton while cart is loading — never a blank page.

  if (cartLoading && !serverCart) {
    return <CheckoutSkeleton />;
  }

  const cartItems = serverCart?.items ?? [];
  // Use cartItemsPayload.length as the canonical item count check —
  // serverCart?.item_count is authoritative; items.length is the legacy fallback.
  const itemCount = serverCart?.item_count ?? cartItemsPayload.length;

  if (itemCount === 0 && !cartLoading && !isPlacingOrder) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          action={{ label: "Go Shopping", href: ROUTES.products }}
        />
      </div>
    );
  }

  // ── Stripe Payment Step ────────────────────────────────────────────────────
  // Once the order is created and the server returns a clientSecret, hide
  // the checkout form and show the Stripe Payment Element instead.

  if (orderResult?.clientSecret) {
    return (
      <div className="container py-8">
        <h1 className="mb-8 text-2xl font-bold">Complete Payment</h1>
        <div className="mx-auto max-w-lg">
          <StripePaymentForm
            clientSecret={orderResult.clientSecret}
            orderId={orderResult.orderId}
            totalInSmallestUnit={Math.round((pricing?.total ?? 0) * 100)}
            currency={getCurrencyForCountry(activeCountryIso)}
          />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">Checkout</h1>

      {/* P2-4: Cart warnings at top of checkout */}
      {serverCart && serverCart.warnings.length > 0 && (
        <div className="mb-6 space-y-2">
          {serverCart.warnings.map((w, i) => {
            const isError = w.type === "ITEM_UNAVAILABLE" || w.type === "CART_EXPIRED";
            const text =
              w.type === "PRICE_CHANGED"
                ? `Price for "${w.product_name}" has changed.`
                : w.type === "LOW_STOCK"
                  ? `Limited stock: only ${w.available} left for "${w.product_name}".`
                  : w.type === "ITEM_UNAVAILABLE"
                    ? `"${w.product_name}" is no longer available.`
                    : w.type === "QUANTITY_ADJUSTED"
                      ? `Quantity for "${w.product_name}" adjusted to ${w.new_qty}.`
                      : w.type === "COUPON_REMOVED"
                        ? `Coupon removed: ${w.reason}`
                        : "Your cart has expired. Please add items again.";
            return (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
                  isError
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
                }`}
              >
                <span>{text}</span>
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handleSubmit(handlePlaceOrder)}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── Left column ────────────────────────────────────────────── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Shipping address */}
            <Card className="p-6">
              <CheckoutAddressPanel
                activeCountryIso={activeCountryIso}
                title="Shipping Address"
                selected={selectedShipping}
                isValidated={shippingValidated}
                onSelect={handleShippingSelect}
                onInvalidate={() => {
                  setShippingValidated(false);
                  setShippingErrors(null);
                }}
              />

              {shippingValidating && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Verifying address…
                </p>
              )}
              {shippingErrors && (
                <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-destructive">
                    <AlertCircle className="h-4 w-4" /> Address validation failed
                  </p>
                  <ul className="mt-1 ml-5 list-disc text-destructive/80 space-y-0.5">
                    {Object.values(shippingErrors).flat().map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Billing same as shipping checkbox */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="same-address"
                checked={billingSameAsShipping}
                onCheckedChange={(v) => {
                  setBillingSameAsShipping(!!v);
                  if (v) {
                    setBillingErrors(null);
                    setBillingValidated(false);
                  }
                }}
              />
              <Label htmlFor="same-address">Billing address same as shipping</Label>
            </div>

            {/* Separate billing address */}
            {!billingSameAsShipping && (
              <Card className="p-6">
                <CheckoutAddressPanel
                  activeCountryIso={activeCountryIso}
                  title="Billing Address"
                  selected={selectedBilling}
                  isValidated={billingValidated}
                  onSelect={handleBillingSelect}
                  onInvalidate={() => {
                    setBillingValidated(false);
                    setBillingErrors(null);
                  }}
                />

                {billingValidating && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying address…
                  </p>
                )}
                {billingErrors && (
                  <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-destructive">
                      <AlertCircle className="h-4 w-4" /> Billing address validation failed
                    </p>
                    <ul className="mt-1 ml-5 list-disc text-destructive/80 space-y-0.5">
                      {Object.values(billingErrors).flat().map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* Payment method */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No payment methods are configured for your region. Please
                    contact support.
                  </p>
                ) : (
                  <Controller
                    name="paymentProvider"
                    control={control}
                    render={({ field }) => (
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2">
                        {paymentMethods.map((m) => {
                          // For COD specifically, apply the layered guardrails
                          // (amount cap, pincode block). Non-COD methods aren't
                          // gated beyond the country-level enable flag.
                          const isCod    = m.method === "cod";
                          const disabled = isCod && !codAvailable;
                          return (
                            <div key={m.method}>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem
                                  value={m.method}
                                  id={m.method}
                                  disabled={disabled}
                                />
                                <Label
                                  htmlFor={m.method}
                                  className={disabled ? "text-muted-foreground" : undefined}
                                >
                                  {m.label}
                                </Label>
                              </div>
                              {m.description && !disabled && (
                                <p className="mt-1 ml-6 text-xs text-muted-foreground">
                                  {m.description}
                                </p>
                              )}
                              {isCod && codUnavailableReason === "over_limit" && (
                                <p className="mt-1 ml-6 text-xs text-muted-foreground">
                                  Over the COD limit of {fmt(codMaxAmount ?? 0)} for this
                                  region — please choose a prepaid method below.
                                </p>
                              )}
                              {isCod && codUnavailableReason === "disabled" && (
                                <p className="mt-1 ml-6 text-xs text-muted-foreground">
                                  Cash on Delivery is not available in this region.
                                </p>
                              )}
                              {isCod && codUnavailableReason === "pincode" && (
                                <p className="mt-1 ml-6 text-xs text-muted-foreground">
                                  Cash on Delivery is not available at pincode {serviceability.pincode}
                                  {" "}— please choose a prepaid method below.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </RadioGroup>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            {/* Coupon */}
            <FormField
              label="Coupon Code"
              placeholder="WELCOME10"
              {...register("couponCode")}
            />

            {/* Notes */}
            <FormField
              as="textarea"
              label="Order Notes (optional)"
              placeholder="Special instructions for delivery..."
              {...register("notes")}
            />
          </div>

          {/* ── Right column — Order summary ─────────────────────────── */}
          <div className="h-fit space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items — rendered from serverCart for authoritative prices */}
                <ul className="divide-y text-sm">
                  {cartItems.map((item) => (
                    <li key={item.variant_id} className="flex items-center gap-3 py-2">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                        {item.image_url && (
                          <Image
                            src={item.image_url}
                            alt={item.product_name}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        )}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="truncate font-medium">{item.product_name}</p>
                        {item.variant_name !== "Default" && (
                          <p className="truncate text-xs text-muted-foreground">{item.variant_name}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        {item.price_changed && (
                          <p className="text-xs text-amber-600">Price updated</p>
                        )}
                      </div>
                      <span>{fmt(item.current_unit_price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
                <Separator />
                {pricing ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{fmt(pricing.subtotal)}</span>
                    </div>
                    {pricing.discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount</span>
                        <span>−{fmt(pricing.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {pricing.tax_label
                          ? `${pricing.tax_label} (${parseFloat((pricing.tax_rate * 100).toFixed(2))}%)`
                          : "Tax"}
                      </span>
                      <span>{fmt(pricing.estimated_tax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span>{pricing.estimated_shipping === 0 ? "FREE" : fmt(pricing.estimated_shipping)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  {pricing ? (
                    <span>{fmt(pricing.total)}</span>
                  ) : (
                    <Skeleton className="h-4 w-20" />
                  )}
                </div>

                {blockReason && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    {blockReason}
                  </p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={isPending}
                  disabled={isBlocked}
                >
                  {isPending ? "Creating your order…" : "Place Order"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>

      {/* ── Order placing overlay ─────────────────────────────────────────── */}
      {isPlacingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-5 rounded-2xl border bg-background p-10 shadow-2xl">
            <div className="relative flex h-20 w-20 items-center justify-center">
              {/* Spinning ring */}
              <span className="absolute inset-0 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
              <PackageCheck className="h-9 w-9 text-primary" />
            </div>
            <div className="space-y-1.5 text-center">
              <p className="text-lg font-semibold">Placing your order…</p>
              <p className="text-sm text-muted-foreground">
                Please wait while we confirm your order. Don&apos;t close this page.
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-bounce rounded-full bg-primary"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
