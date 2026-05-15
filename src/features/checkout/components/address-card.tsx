"use client";

import { CheckCircle2, MapPin, Pencil, Star, Trash2, TriangleAlert } from "lucide-react";

import type { CustomerAddress } from "@/domain/address/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddressCardProps {
  address: CustomerAddress;
  isSelected: boolean;
  isValidated: boolean;
  isRegionMismatch: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefaultShipping: () => void;
  onSetDefaultBilling: () => void;
}

export function AddressCard({
  address,
  isSelected,
  isValidated,
  isRegionMismatch,
  onSelect,
  onEdit,
  onDelete,
  onSetDefaultShipping,
  onSetDefaultBilling,
}: AddressCardProps) {
  const fullName = [address.first_name, address.last_name].filter(Boolean).join(" ");
  const line2Parts = [address.city, address.state, address.postal_code].filter(Boolean).join(", ");

  return (
    <div
      onClick={() => !isRegionMismatch && onSelect()}
      className={cn(
        "relative rounded-lg border p-4 transition-all",
        isRegionMismatch
          ? "cursor-not-allowed border-border bg-muted/40 opacity-60"
          : isSelected
            ? "cursor-pointer border-primary bg-primary/5 ring-2 ring-primary"
            : "cursor-pointer border-border bg-card hover:border-primary/50",
      )}
    >
      {/* Selected radio indicator */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            isSelected ? "border-primary bg-primary" : "border-muted-foreground/40",
          )}
        >
          {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
        </div>

        <div className="flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-sm">{fullName}</span>
            {address.label && (
              <Badge variant="outline" className="text-xs py-0 px-1.5">{address.label}</Badge>
            )}
            {address.is_default_shipping && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs py-0 px-1.5">
                Default Shipping
              </Badge>
            )}
            {address.is_default_billing && (
              <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs py-0 px-1.5">
                Default Billing
              </Badge>
            )}
            {isSelected && isValidated && (
              <span className="flex items-center gap-0.5 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Verified
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{address.address_line1}</p>
          {address.address_line2 && (
            <p className="text-sm text-muted-foreground">{address.address_line2}</p>
          )}
          <p className="text-sm text-muted-foreground">{line2Parts}</p>
          <p className="text-sm text-muted-foreground">{address.country_code}</p>
          {address.phone && (
            <p className="text-xs text-muted-foreground">{address.phone}</p>
          )}

          {isRegionMismatch && (
            <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
              <TriangleAlert className="h-3 w-3" />
              Not available for this store region
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isRegionMismatch && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </Button>

          {!address.is_default_shipping && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-blue-600 hover:text-blue-700"
              onClick={(e) => { e.stopPropagation(); onSetDefaultShipping(); }}
            >
              <Star className="h-3 w-3" />
              Default Shipping
            </Button>
          )}

          {!address.is_default_billing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-purple-600 hover:text-purple-700"
              onClick={(e) => { e.stopPropagation(); onSetDefaultBilling(); }}
            >
              <Star className="h-3 w-3" />
              Default Billing
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive ml-auto"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}
