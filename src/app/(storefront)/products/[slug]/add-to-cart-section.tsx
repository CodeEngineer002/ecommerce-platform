"use client";

import { Loader2, ShoppingCart } from "lucide-react";
import { Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { QuantitySelector } from "@/components/ecommerce/quantity-selector";
import { Button } from "@/components/ui/button";
import { useAddCartItem } from "@/features/cart/hooks/use-cart-mutations";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import { useWishlistStore } from "@/store/wishlist-store";
import type { ProductWithDetails } from "@/types";

interface Props {
  product: ProductWithDetails;
  /** Controlled: current variant ID, owned by ProductDetailClient */
  selectedVariantId?: string | null;
  /** Controlled: called when user clicks a variant button */
  onVariantChange?: (variantId: string) => void;
}

export function AddToCartSection({ product, selectedVariantId: controlledVariantId, onVariantChange }: Props) {
  const [quantity, setQuantity] = useState(1);
  // Support both controlled (from ProductDetailClient) and standalone usage.
  const [localVariantId, setLocalVariantId] = useState(
    product.variants[0]?.id ?? null
  );
  const selectedVariantId = controlledVariantId !== undefined ? controlledVariantId : localVariantId;
  const setSelectedVariantId = (id: string) => {
    setLocalVariantId(id);
    onVariantChange?.(id);
  };
  const { openCart } = useCartStore();
  const { mutate: addCartItem, isPending: isAddingToCart } = useAddCartItem();
  const { toggleItem, hasItem } = useWishlistStore();
  const isWishlisted = hasItem(product.id);

  const activeVariants = product.variants.filter((v) => v.is_active);
  const selectedVariant = activeVariants.find((v) => v.id === selectedVariantId);
  const availableStock =
    (selectedVariant?.inventory?.quantity ?? 0) -
    (selectedVariant?.inventory?.reserved ?? 0);

  const handleAddToCart = () => {
    if (!selectedVariant) return;
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
        onSuccess: () => {
          openCart();
          toast.success("Added to cart!");
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Variant selector */}
      {activeVariants.length > 1 && (
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

      {/* Quantity */}
      <div className="flex items-center gap-4">
        <p className="text-sm font-medium">Quantity</p>
        <QuantitySelector
          value={quantity}
          onChange={setQuantity}
          max={Math.min(availableStock, 10)}
          disabled={availableStock === 0}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          size="lg"
          className="flex-1 gap-2"
          onClick={handleAddToCart}
          disabled={availableStock === 0 || !selectedVariant || isAddingToCart}
        >
          {isAddingToCart ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Adding…
            </>
          ) : availableStock === 0 ? (
            "Out of Stock"
          ) : (
            <>
              <ShoppingCart className="h-5 w-5" />
              Add to Cart
            </>
          )}
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
