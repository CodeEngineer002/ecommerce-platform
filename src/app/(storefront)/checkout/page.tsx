"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
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
import { useServerCart } from "@/features/cart/hooks/use-server-cart";
import { CheckoutAddressPanel } from "@/features/checkout/components/checkout-address-panel";
import { useCreateOrder } from "@/features/orders/hooks/use-orders";
import { FREE_SHIPPING_THRESHOLD, ROUTES, SHIPPING_COST, TAX_RATE } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const { isLoading: cartLoading } = useServerCart();
  const { items, subtotal, serverCart } = useCartStore();
  const { user } = useUserStore();
  const { mutate: createOrder, isPending } = useCreateOrder();

  const params = useParams<{ country?: string }>();
  const activeCountryIso = params?.country ? countryIdToIso(params.country) : "IN";

  // Pricing
  const sub = serverCart ? serverCart.pricing.subtotal : subtotal();
  const tax = serverCart
    ? serverCart.pricing.estimated_tax
    : Math.round(sub * TAX_RATE * 100) / 100;
  const shipping = serverCart
    ? serverCart.pricing.estimated_shipping
    : sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = serverCart ? serverCart.pricing.total : sub + tax + shipping;

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

  // Payment/extras form (kept minimal — no address fields)
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

  // ── Validate selected address server-side ───────────────────────────────

  const validateShipping = useCallback(async () => {
    if (!selectedShipping) return;
    setShippingValidating(true);
    setShippingErrors(null);
    const result = await validateSavedAddress(selectedShipping, activeCountryIso.toLowerCase());
    setShippingValidating(false);
    setShippingValidated(result.valid);
    if (!result.valid) setShippingErrors(result.errors ?? null);
  }, [selectedShipping, activeCountryIso]);

  const validateBilling = useCallback(async () => {
    if (!selectedBilling) return;
    setBillingValidating(true);
    setBillingErrors(null);
    const result = await validateSavedAddress(selectedBilling, activeCountryIso.toLowerCase());
    setBillingValidating(false);
    setBillingValidated(result.valid);
    if (!result.valid) setBillingErrors(result.errors ?? null);
  }, [selectedBilling, activeCountryIso]);

  // ── Place Order ─────────────────────────────────────────────────────────

  async function handlePlaceOrder(data: CheckoutExtrasData) {
    if (!selectedShipping) {
      toast.error("Please select a shipping address");
      return;
    }

    // Validate shipping
    if (!shippingValidated) {
      const result = await validateSavedAddress(selectedShipping, activeCountryIso.toLowerCase());
      if (!result.valid) {
        setShippingErrors(result.errors ?? null);
        setShippingValidated(false);
        toast.error("Shipping address validation failed. Please check the address.");
        return;
      }
      setShippingValidated(true);
      setShippingErrors(null);
    }

    // Validate billing if separate
    const billingAddress = billingSameAsShipping ? selectedShipping : selectedBilling;
    if (!billingSameAsShipping) {
      if (!selectedBilling) {
        toast.error("Please select a billing address");
        return;
      }
      if (!billingValidated) {
        const result = await validateSavedAddress(selectedBilling, activeCountryIso.toLowerCase());
        if (!result.valid) {
          setBillingErrors(result.errors ?? null);
          setBillingValidated(false);
          toast.error("Billing address validation failed. Please check the address.");
          return;
        }
        setBillingValidated(true);
        setBillingErrors(null);
      }
    }

    // Build address payloads from saved CustomerAddress
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

    createOrder({
      cartItems:        items,
      shippingAddress:  toAddressPayload(selectedShipping),
      billingAddress:   toAddressPayload(billingAddress!),
      couponCode:       data.couponCode,
      paymentProvider:  data.paymentProvider,
      notes:            data.notes,
    });
  }

  // ── Blocked reason ──────────────────────────────────────────────────────

  function getBlockReason(): string | null {
    if (!selectedShipping) return "Select a shipping address to continue";
    if (shippingValidating) return "Validating shipping address…";
    if (shippingErrors) return "Shipping address has validation errors";
    if (!billingSameAsShipping && !selectedBilling) return "Select a billing address to continue";
    if (billingValidating) return "Validating billing address…";
    if (billingErrors) return "Billing address has validation errors";
    return null;
  }

  const blockReason = getBlockReason();
  const isBlocked   = !!blockReason || isPending;

  // ── Loading / empty states ───────────────────────────────────────────────

  if (cartLoading && !serverCart) {
    return (
      <div className="container flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0 && !serverCart?.item_count) {
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

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">Checkout</h1>
      <form onSubmit={handleSubmit(handlePlaceOrder)}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Shipping address panel */}
            <Card className="p-6">
              <CheckoutAddressPanel
                activeCountryIso={activeCountryIso}
                title="Shipping Address"
                selected={selectedShipping}
                isValidated={shippingValidated}
                onSelect={(addr) => {
                  setSelectedShipping(addr);
                  setShippingValidated(false);
                  setShippingErrors(null);
                }}
                onInvalidate={() => {
                  setShippingValidated(false);
                  setShippingErrors(null);
                }}
              />

              {/* Validate button (shown when address is selected but not yet validated) */}
              {selectedShipping && !shippingValidated && !shippingValidating && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={validateShipping}
                >
                  Verify Address
                </Button>
              )}
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

            {/* Billing — same as shipping */}
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

            {/* Billing address panel — only when different */}
            {!billingSameAsShipping && (
              <Card className="p-6">
                <CheckoutAddressPanel
                  activeCountryIso={activeCountryIso}
                  title="Billing Address"
                  selected={selectedBilling}
                  isValidated={billingValidated}
                  onSelect={(addr) => {
                    setSelectedBilling(addr);
                    setBillingValidated(false);
                    setBillingErrors(null);
                  }}
                  onInvalidate={() => {
                    setBillingValidated(false);
                    setBillingErrors(null);
                  }}
                />

                {selectedBilling && !billingValidated && !billingValidating && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={validateBilling}
                  >
                    Verify Billing Address
                  </Button>
                )}
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
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="razorpay" id="razorpay" />
                        <Label htmlFor="razorpay">Razorpay (UPI / Cards / Wallets)</Label>
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

          {/* ── Right column — Order summary ─────────────────────────────── */}
          <div className="h-fit space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="divide-y text-sm">
                  {items.map((item) => (
                    <li key={item.variant_id} className="flex items-center gap-3 py-2">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                        {item.variant.product.images[0] && (
                          <Image
                            src={item.variant.product.images[0].url}
                            alt={item.variant.product.name}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        )}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="truncate font-medium">{item.variant.product.name}</p>
                        {item.variant.name !== "Default" && (
                          <p className="truncate text-xs text-muted-foreground">{item.variant.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <span>
                        {formatPrice((item.variant.price ?? item.variant.product.base_price) * item.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatPrice(sub)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax (18% GST)</span>
                    <span>{formatPrice(tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{shipping === 0 ? "FREE" : formatPrice(shipping)}</span>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(total)}</span>
                </div>

                {/* Block reason */}
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
                  loading={isPending || shippingValidating || billingValidating}
                  disabled={isBlocked}
                >
                  Place Order
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
