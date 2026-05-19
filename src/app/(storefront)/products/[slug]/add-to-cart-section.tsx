"use client";

import { Loader2, ShoppingCart } from "lucide-react";
import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";

import { QuantitySelector } from "@/components/ecommerce/quantity-selector";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAddCartItem } from "@/features/cart/hooks/use-cart-mutations";
import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";
import type { ProductWithDetails } from "@/types";

interface Props {
  product: ProductWithDetails;
  /** Controlled: the resolved variant ID (null = no size selected yet) */
  selectedVariantId?: string | null;
  /**
   * When true, renders a flat variant picker inside this component.
   * Used by products that don't use the color+size model (ProductDetailClient
   * handles color+size via VariantSelector; this flag enables legacy behavior).
   */
  showVariantSelector?: boolean;
  /** Only used when showVariantSelector=true */
  onVariantChange?: (variantId: string) => void;
  /** Notifies the parent when the add-to-cart mutation starts / settles */
  onLoadingChange?: (isLoading: boolean) => void;
}

export function AddToCartSection({
  product,
  selectedVariantId: controlledVariantId,
  showVariantSelector = false,
  onVariantChange,
  onLoadingChange,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [localVariantId, setLocalVariantId] = useState(product.variants[0]?.id ?? null);

  const selectedVariantId =
    controlledVariantId !== undefined ? controlledVariantId : localVariantId;

  const setSelectedVariantId = (id: string) => {
    setLocalVariantId(id);
    onVariantChange?.(id);
  };

  const { openCart, serverCart } = useCartStore();
  const { mutate: addCartItem, isPending: isAddingToCart } = useAddCartItem();
  const { toggleItem, hasItem } = useWishlistStore();

  // Defer wishlist reads until after hydration — Zustand persist loads
  // localStorage synchronously on the client, so SSR always sees `false`.
  // Without this guard the aria-label / className differ between server and
  // first client render, triggering a React hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isWishlisted = mounted && hasItem(product.id);

  // Notify parent (ProductDetailClient) so it can show the full-column overlay
  useEffect(() => {
    onLoadingChange?.(isAddingToCart);
  }, [isAddingToCart, onLoadingChange]);

  const activeVariants = product.variants.filter((v) => v.is_active);
  const selectedVariant = activeVariants.find((v) => v.id === selectedVariantId);

  // Prefer inventory_levels (source of truth per migration 00017); fallback to legacy inventory
  const availableStock = (() => {
    if (!selectedVariant) return 0;
    const levels = (selectedVariant as typeof selectedVariant & { inventory_levels?: { quantity: number; reserved: number }[] }).inventory_levels;
    if (levels && levels.length > 0) {
      return levels.reduce((sum, l) => sum + Math.max(0, l.quantity - l.reserved), 0);
    }
    return Math.max(0, (selectedVariant.inventory?.quantity ?? 0) - (selectedVariant.inventory?.reserved ?? 0));
  })();

  // How many of this variant the user already has in their cart.
  // ADDITIVE behavior: PDP max = stock - already-in-cart, so user can't overshoot.
  const alreadyInCart = selectedVariantId
    ? (serverCart?.items.find((i) => i.variant_id === selectedVariantId)?.quantity ?? 0)
    : 0;
  const maxAddable = Math.max(0, availableStock - alreadyInCart);

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    const opts = selectedVariant.options as Record<string, string> | null;
    const variantLabel = opts ? Object.values(opts).join(" / ") : selectedVariant.name;

    addCartItem(
      {
        variantId: selectedVariant.id,
        quantity,
        optimisticItem: {
          id: `${selectedVariant.id}-${Date.now()}`,
          cart_id: "",
          variant_id: selectedVariant.id,
          quantity,
          unit_price_snapshot: null,
          added_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          variant: { ...selectedVariant, product: { ...product } },
        },
      },
      {
        onSuccess: (cart) => {
          openCart();
          // Show accurate feedback using add_result from server
          const result = cart.add_result;
          if (result) {
            if (result.was_new_item) {
              toast.success(`${variantLabel} added to cart!`);
            } else if (result.was_capped) {
              toast(
                `Qty capped at ${result.final_quantity} (stock limit). ${variantLabel} updated in cart.`,
                { icon: "⚠️" },
              );
            } else {
              toast.success(
                `Added ${result.added_quantity} more. Cart now has ${result.final_quantity}× ${variantLabel}.`,
              );
            }
          } else {
            toast.success(`${variantLabel} added to cart!`);
          }
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // Determine add-to-cart button label
  let buttonLabel: React.ReactNode;
  if (isAddingToCart) {
    buttonLabel = <><Loader2 className="h-5 w-5 animate-spin" />Adding…</>;
  } else if (!selectedVariantId) {
    buttonLabel = "Select a Size";
  } else if (availableStock === 0) {
    buttonLabel = "Out of Stock";
  } else if (maxAddable === 0 && alreadyInCart > 0) {
    buttonLabel = "Max Qty in Cart";
  } else {
    buttonLabel = <><ShoppingCart className="h-5 w-5" />Add to Cart</>;
  }

  const isDisabled =
    !selectedVariantId || availableStock === 0 || isAddingToCart ||
    (maxAddable === 0 && alreadyInCart > 0);

  return (
    <div className="space-y-4">
      {/* Flat variant selector — only rendered for non-color+size products */}
      {showVariantSelector && activeVariants.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Variant</p>
          <div className="flex flex-wrap gap-2">
            {activeVariants.map((variant) => (
              <button
                key={variant.id}
                onClick={() => setSelectedVariantId(variant.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm transition-colors",
                  variant.id === selectedVariantId
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "hover:border-primary/50"
                )}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantity — max is stock minus what's already in cart (additive-aware) */}
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium">Quantity</p>
        <QuantitySelector
          value={quantity}
          onChange={setQuantity}
          max={maxAddable > 0 ? maxAddable : availableStock}
          disabled={availableStock === 0 || !selectedVariantId || maxAddable === 0}
        />
        {alreadyInCart > 0 && availableStock > 0 && (
          <span className="text-xs text-muted-foreground">
            ({alreadyInCart} already in cart)
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          size="lg"
          className="flex-1 gap-2"
          onClick={handleAddToCart}
          disabled={isDisabled}
        >
          {buttonLabel}
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={() => toggleItem(product)}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart
            className={cn("h-5 w-5", isWishlisted ? "fill-red-500 text-red-500" : "")}
          />
        </Button>
      </div>
    </div>
  );
}
