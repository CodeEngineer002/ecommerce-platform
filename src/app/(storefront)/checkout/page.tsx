"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ShoppingBag } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useServerCart } from "@/features/cart/hooks/use-server-cart";
import { AddressSection } from "@/features/checkout/components/address-section";
import { useCreateOrder } from "@/features/orders/hooks/use-orders";
import { FREE_SHIPPING_THRESHOLD, ROUTES, SHIPPING_COST, TAX_RATE } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { checkoutSchema, type CheckoutFormData } from "@/lib/validators";
import { useCartStore } from "@/store/cart-store";
import { useUserStore } from "@/store/user-store";
import { countryIdToIso } from "@/domain/address/region-policy";

export default function CheckoutPage() {
  // Ensure the server cart is loaded (populates serverCart in Zustand)
  const { isLoading: cartLoading } = useServerCart();
  const { items, subtotal, serverCart } = useCartStore();
  const { user } = useUserStore();
  const { mutate: createOrder, isPending } = useCreateOrder();

  // Derive the active country ISO code from the URL segment (e.g. /us/en → "US")
  const params = useParams<{ country?: string }>();
  const activeCountryIso = params?.country ? countryIdToIso(params.country) : "IN";

  // Prefer server-authoritative pricing when available
  const sub = serverCart ? serverCart.pricing.subtotal : subtotal();
  const tax = serverCart
    ? serverCart.pricing.estimated_tax
    : Math.round(sub * TAX_RATE * 100) / 100;
  const shipping = serverCart
    ? serverCart.pricing.estimated_shipping
    : sub >= FREE_SHIPPING_THRESHOLD
      ? 0
      : SHIPPING_COST;
  const total = serverCart ? serverCart.pricing.total : sub + tax + shipping;

  const {
    register,
    handleSubmit,
    watch,
    control,
    setValue,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      useSameAddress: true,
      paymentProvider: "cod",
    },
  });

  // Pre-fill the shipping full name from the Zustand user store
  useEffect(() => {
    if (user?.full_name) {
      setValue("shippingAddress.full_name", user.full_name, { shouldValidate: false });
    }
  }, [user?.full_name, setValue]);

  // Lock country to the active storefront region (derived from URL)
  useEffect(() => {
    setValue("shippingAddress.country", activeCountryIso, { shouldValidate: false });
    setValue("billingAddress.country", activeCountryIso, { shouldValidate: false });
  }, [activeCountryIso, setValue]);

  const useSameAddress = watch("useSameAddress");

  // Show spinner while server cart loads on first visit
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

  const onSubmit = (data: CheckoutFormData) => {
    createOrder({
      cartItems: items,
      shippingAddress: data.shippingAddress,
      billingAddress: data.useSameAddress ? data.shippingAddress : data.billingAddress,
      couponCode: data.couponCode,
      paymentProvider: data.paymentProvider,
      notes: data.notes,
    });
  };

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">Checkout</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left */}
          <div className="space-y-6 lg:col-span-2">
            {/* Shipping address */}
            <Card>
              <AddressSection
                title="Shipping Address"
                prefix="shippingAddress"
                countryCode={activeCountryIso}
                control={control}
                register={register}
                errors={errors}
                setValue={setValue}
                watch={watch}
              />
            </Card>

            {/* Same billing address — Radix Checkbox needs Controller */}
            <div className="flex items-center gap-2">
              <Controller
                name="useSameAddress"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="same-address"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="same-address">Billing address same as shipping</Label>
            </div>

            {/* Billing address — shown only when different */}
            {!useSameAddress && (
              <Card>
                <AddressSection
                  title="Billing Address"
                  prefix="billingAddress"
                  countryCode={activeCountryIso}
                  control={control}
                  register={register}
                  errors={errors}
                  setValue={setValue}
                  watch={watch}
                />
              </Card>
            )}

            {/* Payment method — Radix RadioGroup needs Controller */}
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

            {/* Coupon code */}
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

          {/* Order summary */}
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
                <Button type="submit" className="w-full" size="lg" loading={isPending}>
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
