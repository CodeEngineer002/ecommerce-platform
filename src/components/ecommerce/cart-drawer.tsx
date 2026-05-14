"use client";

import { ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FREE_SHIPPING_THRESHOLD, ROUTES, SHIPPING_COST } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";

import { QuantitySelector } from "./quantity-selector";

export function CartDrawer() {
  const { isOpen, closeCart, items, removeItem, updateQuantity, subtotal } = useCartStore();
  const sub = subtotal();
  const shipping = sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = sub + shipping;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Shopping Cart ({items.reduce((s, i) => s + i.quantity, 0)})
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Add some products to get started"
              action={{ label: "Continue Shopping", href: ROUTES.products }}
            />
          </div>
        ) : (
          <>
            {/* Items */}
            <div className="flex-1 overflow-y-auto py-4">
              <ul className="divide-y">
                {items.map((item) => {
                  const product = item.variant.product;
                  const price = item.variant.price ?? product.base_price;
                  const image = product.images[0];

                  return (
                    <li key={item.variant_id} className="flex gap-3 py-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {image && (
                          <Image
                            src={image.url}
                            alt={product.name}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <Link
                          href={ROUTES.product(product.slug)}
                          onClick={closeCart}
                          className="line-clamp-2 text-sm font-medium hover:text-primary"
                        >
                          {product.name}
                        </Link>
                        {item.variant.name !== "Default" && (
                          <p className="text-xs text-muted-foreground">{item.variant.name}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <QuantitySelector
                            value={item.quantity}
                            onChange={(q) => updateQuantity(item.variant_id, q)}
                          />
                          <div className="text-right">
                            <p className="text-sm font-semibold">{formatPrice(price * item.quantity)}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-muted-foreground">{formatPrice(price)} each</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.variant_id)}
                        className="self-start text-muted-foreground hover:text-destructive"
                        aria-label="Remove item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Summary */}
            <div className="space-y-3 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatPrice(sub)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Shipping</span>
                <span>{shipping === 0 ? "FREE" : formatPrice(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-muted-foreground">
                  Add {formatPrice(FREE_SHIPPING_THRESHOLD - sub)} more for free shipping
                </p>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
              <Button asChild className="w-full" size="lg" onClick={closeCart}>
                <Link href={ROUTES.checkout}>Proceed to Checkout</Link>
              </Button>
              <Button variant="outline" className="w-full" onClick={closeCart}>
                Continue Shopping
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
