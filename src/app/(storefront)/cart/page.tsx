"use client";

import { AlertTriangle, ShoppingBag, Trash2 } from "lucide-react";
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
import type { CartItemDetail, CartWarning } from "@/domain/cart/types";
import type { CartItemWithProduct } from "@/types";

export default function CartPage() {
  const { items, serverCart, subtotal } = useCartStore();
  const { mutate: removeItem } = useRemoveCartItem();
  const { mutate: updateQuantity } = useUpdateCartQuantity();
  const fmt = useFormatPrice();

  // serverCart is authoritative; items is the guest/cold-start fallback.
  const totalQty = serverCart
    ? serverCart.item_count
    : items.reduce((s, i) => s + i.quantity, 0);
  const isEmpty = totalQty === 0;

  // P2-1: Use server-authoritative pricing when available — avoids hardcoded
  // FREE_SHIPPING_THRESHOLD / SHIPPING_COST mismatch with actual server values.
  const sub      = serverCart ? serverCart.pricing.subtotal          : subtotal();
  const shipping = serverCart ? serverCart.pricing.estimated_shipping : (sub >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST);
  const tax      = serverCart ? serverCart.pricing.estimated_tax     : 0;
  const total    = serverCart ? serverCart.pricing.total             : (sub + shipping);
  const taxLabel = serverCart?.pricing.tax_label ?? null;

  // How much more to add for free shipping (null when server handles it or already free)
  const freeShippingGap = !serverCart && shipping > 0 ? FREE_SHIPPING_THRESHOLD - sub : null;

  if (isEmpty) {
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
      <h1 className="mb-8 text-2xl font-bold">Shopping Cart ({totalQty} items)</h1>

      {/* P2-4: Cart warnings banner */}
      {serverCart && serverCart.warnings.length > 0 && (
        <CartWarningsBanner warnings={serverCart.warnings} fmt={fmt} />
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <div className="lg:col-span-2">
          <ul className="divide-y rounded-lg border">
            {serverCart
              ? serverCart.items.map((item) => (
                  <ServerCartItem
                    key={item.variant_id}
                    item={item}
                    fmt={fmt}
                    onRemove={(vid) => removeItem({ variantId: vid })}
                    onQtyChange={(vid, q) => updateQuantity({ variantId: vid, quantity: q })}
                  />
                ))
              : items.map((item) => (
                  <LegacyCartItem
                    key={item.variant_id}
                    item={item}
                    fmt={fmt}
                    onRemove={(vid) => removeItem({ variantId: vid })}
                    onQtyChange={(vid, q) => updateQuantity({ variantId: vid, quantity: q })}
                  />
                ))}
          </ul>
        </div>

        {/* Summary — P2-1: serverCart.pricing authoritative */}
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
            {freeShippingGap !== null && freeShippingGap > 0 && (
              <p className="text-xs text-muted-foreground">
                Add {fmt(freeShippingGap)} more for free shipping
              </p>
            )}
            {tax > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{taxLabel ?? "Tax"}</span>
                <span>{fmt(tax)}</span>
              </div>
            )}
            {serverCart?.pricing.discount != null && serverCart.pricing.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>-{fmt(serverCart.pricing.discount)}</span>
              </div>
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

// ── Cart warnings banner (P2-4) ───────────────────────────────────────────────

function cartWarningMessage(w: CartWarning, fmt: (n: number) => string): { text: string; isError: boolean } {
  switch (w.type) {
    case "PRICE_CHANGED":
      return {
        text: `Price for "${w.product_name}" changed from ${fmt(w.old_price)} to ${fmt(w.new_price)}.`,
        isError: false,
      };
    case "LOW_STOCK":
      return {
        text: `Only ${w.available} left in stock for "${w.product_name}".`,
        isError: false,
      };
    case "ITEM_UNAVAILABLE":
      return {
        text: `"${w.product_name}" is no longer available and has been removed from your cart.`,
        isError: true,
      };
    case "QUANTITY_ADJUSTED":
      return {
        text: `Quantity for "${w.product_name}" adjusted from ${w.old_qty} to ${w.new_qty} due to stock limits.`,
        isError: false,
      };
    case "COUPON_REMOVED":
      return { text: `Coupon removed: ${w.reason}`, isError: false };
    case "CART_EXPIRED":
      return { text: "Your cart has expired. Please add items again.", isError: true };
    default:
      return { text: "Your cart has an issue — please review before checkout.", isError: false };
  }
}

interface WarningsBannerProps {
  warnings: CartWarning[];
  fmt: (n: number) => string;
}

function CartWarningsBanner({ warnings, fmt }: WarningsBannerProps) {
  if (warnings.length === 0) return null;
  return (
    <div className="mb-6 space-y-2">
      {warnings.map((w, i) => {
        const { text, isError } = cartWarningMessage(w, fmt);
        return (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              isError
                ? "border-destructive/30 bg-destructive/10 text-destructive"
                : "border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300"
            }`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Server cart item (authoritative — CartItemDetail) ─────────────────────────

interface ServerItemProps {
  item: CartItemDetail;
  fmt: (n: number) => string;
  onRemove: (variantId: string) => void;
  onQtyChange: (variantId: string, qty: number) => void;
}

function ServerCartItem({ item, fmt, onRemove, onQtyChange }: ServerItemProps) {
  return (
    <li className="flex gap-4 p-4">
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
        {item.image_url && (
          <Image src={item.image_url} alt={item.product_name} fill className="object-cover" sizes="80px" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-medium">{item.product_name}</p>
        {item.variant_name && item.variant_name !== "Default" && (
          <p className="text-xs text-muted-foreground">{item.variant_name}</p>
        )}
        {item.price_changed && (
          <p className="text-xs text-amber-600">Price updated since you added this item</p>
        )}
        {item.low_stock && item.available_stock > 0 && (
          <p className="text-xs text-amber-600">Only {item.available_stock} left in stock</p>
        )}
        {!item.is_available && (
          <p className="text-xs text-destructive">This item is no longer available</p>
        )}
        <PriceDisplay price={item.current_unit_price} size="sm" />
        <div className="flex items-center gap-4 pt-1">
          <QuantitySelector
            value={item.quantity}
            max={item.available_stock}
            onChange={(q) => onQtyChange(item.variant_id, q)}
          />
          <p className="text-sm font-semibold">{fmt(item.current_unit_price * item.quantity)}</p>
          <button
            onClick={() => onRemove(item.variant_id)}
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Legacy cart item (guest / cold-start fallback — CartItemWithProduct) ──────

interface LegacyItemProps {
  item: CartItemWithProduct;
  fmt: (n: number) => string;
  onRemove: (variantId: string) => void;
  onQtyChange: (variantId: string, qty: number) => void;
}

function LegacyCartItem({ item, fmt, onRemove, onQtyChange }: LegacyItemProps) {
  const product = item.variant.product;
  const price = item.variant.price ?? product.base_price;
  const image = product.images[0];

  return (
    <li className="flex gap-4 p-4">
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
            onChange={(q) => onQtyChange(item.variant_id, q)}
          />
          <p className="text-sm font-semibold">{fmt(price * item.quantity)}</p>
          <button
            onClick={() => onRemove(item.variant_id)}
            className="ml-auto text-muted-foreground hover:text-destructive"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
