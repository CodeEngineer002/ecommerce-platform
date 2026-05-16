"use client";

import { Loader2, ShoppingBag, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState, useCallback } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRemoveCartItem, useUpdateCartQuantity } from "@/features/cart/hooks/use-cart-mutations";
import { FREE_SHIPPING_THRESHOLD, ROUTES, SHIPPING_COST } from "@/lib/constants";
import { useFormatPrice } from "@/hooks/use-format-price";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useNavLoadingStore } from "@/store/nav-loading-store";

import { QuantitySelector } from "./quantity-selector";

export function CartDrawer() {
  const { isOpen, closeCart, items, subtotal, serverCart } = useCartStore();
  // Badge and drawer must agree on count — both read from serverCart.item_count
  // when available. Legacy `items` lags behind on first mount (useCartHydration
  // is skipped once serverCart is set), causing the split-brain badge "2" / drawer "(0)" bug.
  const displayCount = serverCart?.item_count ?? items.reduce((s, i) => s + i.quantity, 0);
  const isEmpty = displayCount === 0;
  const { mutate: removeItem } = useRemoveCartItem();
  const { mutate: updateQuantity } = useUpdateCartQuantity();
  const fmt = useFormatPrice();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const startNavOverlay = useNavLoadingStore((s) => s.start);
  // Track which variant IDs have a pending remove or quantity-update API call.
  // Prevents double-clicks and gives per-row visual feedback.
  const [pendingVariants, setPendingVariants] = useState<Set<string>>(new Set());

  const markPending = useCallback((variantId: string) => {
    setPendingVariants((prev) => new Set(prev).add(variantId));
  }, []);
  const unmarkPending = useCallback((variantId: string) => {
    setPendingVariants((prev) => {
      const next = new Set(prev);
      next.delete(variantId);
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (variantId: string) => {
      if (pendingVariants.has(variantId)) return; // already in-flight
      markPending(variantId);
      removeItem(
        { variantId },
        { onSettled: () => unmarkPending(variantId) },
      );
    },
    [pendingVariants, markPending, unmarkPending, removeItem],
  );

  const handleQtyChange = useCallback(
    (variantId: string, quantity: number) => {
      if (pendingVariants.has(variantId)) return;
      markPending(variantId);
      updateQuantity(
        { variantId, quantity },
        { onSettled: () => unmarkPending(variantId) },
      );
    },
    [pendingVariants, markPending, unmarkPending, updateQuantity],
  );

  const sub = subtotal();
  const shipping = sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = sub + shipping;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Shopping Cart ({displayCount})
          </SheetTitle>
          <SheetDescription className="sr-only">
            Review and manage items in your shopping cart
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
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
                  const isPending = pendingVariants.has(item.variant_id);

                  return (
                    <li
                      key={item.variant_id}
                      className={cn(
                        "flex gap-3 py-4 transition-opacity duration-150",
                        isPending && "opacity-50 pointer-events-none",
                      )}
                    >
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
                            onChange={(q) => handleQtyChange(item.variant_id, q)}
                            disabled={isPending}
                          />
                          <div className="text-right">
                            <p className="text-sm font-semibold">{fmt(price * item.quantity)}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-muted-foreground">{fmt(price)} each</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemove(item.variant_id)}
                        disabled={isPending}
                        className="self-start text-muted-foreground hover:text-destructive disabled:cursor-not-allowed"
                        aria-label="Remove item"
                      >
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
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
                <span>{fmt(sub)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Shipping</span>
                <span>{shipping === 0 ? "FREE" : fmt(shipping)}</span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-muted-foreground">
                  Add {fmt(FREE_SHIPPING_THRESHOLD - sub)} more for free shipping
                </p>
              )}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{fmt(total)}</span>
              </div>
              <Button
                className="w-full gap-2"
                size="lg"
                disabled={isNavigating}
                onClick={() => {
                  startNavOverlay();
                  startNavigation(() => {
                    closeCart();
                    router.push(ROUTES.checkout);
                  });
                }}
              >
                {isNavigating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  "Proceed to Checkout"
                )}
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
