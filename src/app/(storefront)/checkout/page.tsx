"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
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
import { useCreateOrder } from "@/features/orders/hooks/use-orders";
import { ROUTES } from "@/lib/constants";
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
  const serverCart = useCartStore((s) => s.serverCart);
  const items      = useCartStore((s) => s.items);
  const serverCartId = useCartStore((s) => s.serverCartId);
  const { user } = useUserStore();
  const { mutate: createOrder, isPending } = useCreateOrder();
  // Sync guard — prevents a second tap/click from firing a second mutation
  // before React re-renders with isPending=true (async state timing gap).
  const submittingRef = useRef(false);
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
    formState: { errors },
  } = useForm<CheckoutExtrasData>({
    resolver: zodResolver(checkoutExtrasSchema),
    defaultValues: {
      useSameAddress: true,
      paymentProvider: "cod",
    },
  });

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

    createOrder(
      {
        cartItems:        items,
        shippingAddress:  toAddressPayload(selectedShipping),
        billingAddress:   toAddressPayload(billingAddress!),
        couponCode:       data.couponCode,
        paymentProvider:  data.paymentProvider,
        notes:            data.notes,
        cartId:           serverCartId ?? serverCart?.id ?? undefined,
      },
      {
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
  const itemCount = serverCart?.item_count ?? items.length;

  if (itemCount === 0 && !cartLoading) {
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">Checkout</h1>
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
                <Controller
                  name="paymentProvider"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="cod" id="cod" />
                        <Label htmlFor="cod">Cash on Delivery</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="stripe" id="stripe" />
                        <Label htmlFor="stripe">Credit / Debit Card (Stripe)</Label>
                      </div>
                    </RadioGroup>
                  )}
                />
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
    </div>
  );
}
