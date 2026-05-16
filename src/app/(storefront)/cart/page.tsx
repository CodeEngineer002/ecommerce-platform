"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { PriceDisplay } from "@/components/ecommerce/price-display";
import { QuantitySelector } from "@/components/ecommerce/quantity-selector";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useRemoveCartItem, useUpdateCartQuantity } from "@/features/cart/hooks/use-cart-mutations";
import { FREE_SHIPPING_THRESHOLD, ROUTES, SHIPPING_COST } from "@/lib/constants";
import { useFormatPrice } from "@/hooks/use-format-price";
import { useCartStore } from "@/store/cart-store";

export default function CartPage() {
  const { items, subtotal } = useCartStore();
  const { mutate: removeItem } = useRemoveCartItem();
  const { mutate: updateQuantity } = useUpdateCartQuantity();
  const fmt = useFormatPrice();
  const sub = subtotal();
  const shipping = sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = sub + shipping;

  if (items.length === 0) {
    return (
      <div className="container py-16">
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add some products and come back!"
          action={{ label: "Continue Shopping", href: ROUTES.products }}
        />
      </div>
    );
  }

  return (
    <div className="container py-8">
      <h1 className="mb-8 text-2xl font-bold">Shopping Cart ({items.reduce((s, i) => s + i.quantity, 0)} items)</h1>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <ul className="divide-y rounded-lg border">
            {items.map((item) => {
              const product = item.variant.product;
              const price = item.variant.price ?? product.base_price;
              const image = product.images[0];

              return (
                <li key={item.variant_id} className="flex gap-4 p-4">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
                    {image && (
                      <Image src={image.url} alt={product.name} fill className="object-cover" sizes="80px" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <Link href={ROUTES.product(product.slug)} className="font-medium hover:text-primary">
                      {product.name}
                    </Link>
                    {item.variant.name !== "Default" && (
                      <p className="text-xs text-muted-foreground">{item.variant.name}</p>
                    )}
                    <PriceDisplay price={price} size="sm" />
                    <div className="flex items-center gap-4 pt-1">
                      <QuantitySelector
                        value={item.quantity}
                        onChange={(q) => updateQuantity({ variantId: item.variant_id, quantity: q })}
                      />
                      <p className="text-sm font-semibold">{fmt(price * item.quantity)}</p>
                      <button
                        onClick={() => removeItem({ variantId: item.variant_id })}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Summary */}
        <div className="h-fit rounded-lg border p-6">
          <h2 className="mb-4 font-semibold">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{fmt(sub)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className={shipping === 0 ? "text-green-600" : ""}>
                {shipping === 0 ? "FREE" : fmt(shipping)}
              </span>
            </div>
            {shipping > 0 && (
              <p className="text-xs text-muted-foreground">
                Add {fmt(FREE_SHIPPING_THRESHOLD - sub)} more for free shipping
              </p>
            )}
          </div>
          <Separator className="my-4" />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{fmt(total)}</span>
          </div>
          <Button className="mt-6 w-full" size="lg" asChild>
            <Link href={ROUTES.checkout}>Proceed to Checkout</Link>
          </Button>
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link href={ROUTES.products}>Continue Shopping</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
