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
import { FREE_SHIPPING_THRESHOLD, CART_MAX_QUANTITY, ROUTES, SHIPPING_COST } from "@/lib/constants";
import { useFormatPrice } from "@/hooks/use-format-price";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useNavLoadingStore } from "@/store/nav-loading-store";
import type { CartItemDetail } from "@/domain/cart/types";
import type { CartItemWithProduct } from "@/types";

import { QuantitySelector } from "./quantity-selector";

/**
 * CartDrawer renders items from serverCart.items (CartItemDetail) when the
 * server cart is available — this is the source of truth after any mutation.
 *
 * Falls back to the legacy `items` (CartItemWithProduct) only during cold
 * start, before the server cart has been fetched (useCartHydration path).
 *
 * This eliminates the split-brain between Zustand `items` and `serverCart`
 * that caused stale quantities after Add-to-Cart.
 */
export function CartDrawer() {
  const { isOpen, closeCart, items: legacyItems, serverCart } = useCartStore();

  const displayCount = serverCart?.item_count ?? legacyItems.reduce((s, i) => s + i.quantity, 0);
  const isEmpty = displayCount === 0;

  const { mutate: removeItem } = useRemoveCartItem();
  const { mutate: updateQuantity } = useUpdateCartQuantity();
  const fmt = useFormatPrice();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const startNavOverlay = useNavLoadingStore((s) => s.startNav);

  // Per-row pending state — prevents double-clicks and gives visual feedback
  const [pendingVariants, setPendingVariants] = useState<Set<string>>(new Set());
  const markPending = useCallback((id: string) => {
    setPendingVariants((prev) => new Set(prev).add(id));
  }, []);
  const unmarkPending = useCallback((id: string) => {
    setPendingVariants((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleRemove = useCallback(
    (variantId: string) => {
      if (pendingVariants.has(variantId)) return;
      markPending(variantId);
      removeItem({ variantId }, { onSettled: () => unmarkPending(variantId) });
    },
    [pendingVariants, markPending, unmarkPending, removeItem],
  );

  const handleQtyChange = useCallback(
    (variantId: string, quantity: number) => {
      if (pendingVariants.has(variantId)) return;
      markPending(variantId);
      updateQuantity({ variantId, quantity }, { onSettled: () => unmarkPending(variantId) });
    },
    [pendingVariants, markPending, unmarkPending, updateQuantity],
  );

  // Pricing from server cart when available; fallback to legacy computation
  const sub = serverCart
    ? serverCart.pricing.subtotal
    : legacyItems.reduce((s, i) => {
        const price = i.variant.price ?? i.variant.product.base_price;
        return s + price * i.quantity;
      }, 0);
  const shipping = sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = sub + shipping;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Shopping Cart ({displayCount})</SheetTitle>
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
            <div className="flex-1 overflow-y-auto py-4">
              <ul className="divide-y">
                {serverCart
                  ? serverCart.items.map((item) => (
                      <CartDrawerServerItem
                        key={item.variant_id}
                        item={item}
                        isPending={pendingVariants.has(item.variant_id)}
                        fmt={fmt}
                        onRemove={handleRemove}
                        onQtyChange={handleQtyChange}
                      />
                    ))
                  : legacyItems.map((item) => (
                      <CartDrawerLegacyItem
                        key={item.variant_id}
                        item={item}
                        isPending={pendingVariants.has(item.variant_id)}
                        fmt={fmt}
                        onRemove={handleRemove}
                        onQtyChange={handleQtyChange}
                      />
                    ))}
              </ul>
            </div>

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

// ── Server cart item (source of truth) ────────────────────────────────────────

interface ServerItemProps {
  item: CartItemDetail;
  isPending: boolean;
  fmt: (n: number) => string;
  onRemove: (variantId: string) => void;
  onQtyChange: (variantId: string, qty: number) => void;
}

function CartDrawerServerItem({ item, isPending, fmt, onRemove, onQtyChange }: ServerItemProps) {
  return (
    <li
      className={cn(
        "flex gap-3 py-4 transition-opacity duration-150",
        isPending && "pointer-events-none opacity-50",
      )}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
        {item.image_url && (
          <Image
            src={item.image_url}
            alt={item.product_name}
            fill
            className="object-cover"
            sizes="64px"
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <span className="line-clamp-2 text-sm font-medium">{item.product_name}</span>
        {item.variant_name && (
          <p className="text-xs text-muted-foreground">{item.variant_name}</p>
        )}
        {item.low_stock && item.available_stock > 0 && (
          <p className="text-xs text-amber-600">Only {item.available_stock} left</p>
        )}
        <div className="flex items-center justify-between">
          <QuantitySelector
            value={item.quantity}
            max={Math.min(item.available_stock, CART_MAX_QUANTITY)}
            onChange={(q) => onQtyChange(item.variant_id, q)}
            disabled={isPending}
          />
          <div className="text-right">
            <p className="text-sm font-semibold">{fmt(item.current_unit_price * item.quantity)}</p>
            {item.quantity > 1 && (
              <p className="text-xs text-muted-foreground">{fmt(item.current_unit_price)} each</p>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={() => onRemove(item.variant_id)}
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
}

// ── Legacy item (cold-start fallback only) ─────────────────────────────────────

interface LegacyItemProps {
  item: CartItemWithProduct;
  isPending: boolean;
  fmt: (n: number) => string;
  onRemove: (variantId: string) => void;
  onQtyChange: (variantId: string, qty: number) => void;
}

function CartDrawerLegacyItem({ item, isPending, fmt, onRemove, onQtyChange }: LegacyItemProps) {
  const product = item.variant.product;
  const price = item.variant.price ?? product.base_price;
  const variantColor = (item.variant.options as { color?: string } | null)?.color;
  const image = variantColor
    ? (product.images.find((img) =>
        img.alt_text?.toLowerCase().includes(variantColor.toLowerCase()),
      ) ?? product.images[0])
    : product.images[0];

  return (
    <li
      className={cn(
        "flex gap-3 py-4 transition-opacity duration-150",
        isPending && "pointer-events-none opacity-50",
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
            onChange={(q) => onQtyChange(item.variant_id, q)}
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
        onClick={() => onRemove(item.variant_id)}
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
}
