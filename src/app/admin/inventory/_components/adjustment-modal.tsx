"use client";

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup } from "@/components/ui/radio-group";
import { useStockAdjustment } from "@/features/admin/hooks/use-admin-inventory";
import {
  computeNewQuantity,
  ADJUSTMENT_REASON_LABELS,
  type AdjustmentOperation,
  type AdjustmentReason,
} from "@/features/admin/services/admin-inventory.service";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdjustmentTarget {
  variantId: string;
  sku: string | null;
  productName: string;
  variantLabel: string; // e.g. "Black / XL"
  currentQuantity: number;
  reserved: number;
}

interface Props {
  target: AdjustmentTarget | null;
  onClose: () => void;
}

const OPERATIONS: { value: AdjustmentOperation; label: string; description: string }[] = [
  { value: "increase", label: "Increase", description: "Add to existing stock" },
  { value: "decrease", label: "Decrease", description: "Remove from existing stock" },
  { value: "set", label: "Set Exact", description: "Override to specific quantity" },
];

const REASONS = Object.entries(ADJUSTMENT_REASON_LABELS) as [AdjustmentReason, string][];

// ── Component ─────────────────────────────────────────────────────────────────

export function AdjustmentModal({ target, onClose }: Props) {
  const [operation, setOperation] = useState<AdjustmentOperation>("increase");
  const [inputQty, setInputQty] = useState<number>(1);
  const [reason, setReason] = useState<AdjustmentReason>("new_inventory_received");
  const [note, setNote] = useState("");

  const { mutate: adjust, isPending } = useStockAdjustment();

  // Reset form when a new target is opened
  useEffect(() => {
    if (target) {
      setOperation("increase");
      setInputQty(1);
      setReason("new_inventory_received");
      setNote("");
    }
  }, [target?.variantId]);

  if (!target) return null;

  const newQty = computeNewQuantity(operation, target.currentQuantity, inputQty);
  const delta = newQty - target.currentQuantity;
  const isValid = inputQty > 0 && (operation !== "decrease" || inputQty <= target.currentQuantity);

  const inputLabel =
    operation === "increase"
      ? "Quantity to add"
      : operation === "decrease"
      ? "Quantity to remove"
      : "New quantity";

  function handleSubmit() {
    if (!target || !isValid) return;
    adjust(
      { variantId: target.variantId, operation, quantity: inputQty, reason, note: note || undefined },
      { onSuccess: () => { onClose(); } },
    );
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock</DialogTitle>
          <DialogDescription>
            {target.productName} — {target.variantLabel}
            {target.sku && (
              <code className="ml-2 rounded bg-muted px-1 py-0.5 text-xs font-mono">
                {target.sku}
              </code>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Current stock info */}
        <div className="flex gap-6 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">In Stock</p>
            <p className="text-lg font-semibold tabular-nums">{target.currentQuantity}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reserved</p>
            <p className="text-lg font-semibold tabular-nums text-muted-foreground">{target.reserved}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Available</p>
            <p className={cn(
              "text-lg font-semibold tabular-nums",
              target.currentQuantity - target.reserved === 0
                ? "text-red-600"
                : target.currentQuantity - target.reserved <= 5
                ? "text-amber-600"
                : "text-green-600",
            )}>
              {target.currentQuantity - target.reserved}
            </p>
          </div>
        </div>

        {/* Operation selector */}
        <div className="space-y-2">
          <Label>Operation</Label>
          <RadioGroup
            value={operation}
            onValueChange={(v) => setOperation(v as AdjustmentOperation)}
            className="grid grid-cols-3 gap-2"
          >
            {OPERATIONS.map((op) => (
              <label
                key={op.value}
                className={cn(
                  "flex cursor-pointer flex-col items-center rounded-md border p-3 text-center text-xs transition-colors",
                  operation === op.value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:border-primary/50",
                )}
              >
                <input
                  type="radio"
                  name="operation"
                  value={op.value}
                  checked={operation === op.value}
                  onChange={() => setOperation(op.value)}
                  className="sr-only"
                />
                <span className="font-medium">{op.label}</span>
                <span className="mt-0.5 text-muted-foreground">{op.description}</span>
              </label>
            ))}
          </RadioGroup>
        </div>

        {/* Quantity input */}
        <div className="space-y-1.5">
          <Label htmlFor="adj-qty">{inputLabel}</Label>
          <Input
            id="adj-qty"
            type="number"
            min={1}
            max={operation === "decrease" ? target.currentQuantity : undefined}
            value={inputQty}
            onChange={(e) => setInputQty(Math.max(1, Number(e.target.value)))}
            className="w-32 tabular-nums"
          />
          {operation === "decrease" && inputQty > target.currentQuantity && (
            <p className="text-xs text-red-600">Cannot remove more than current stock ({target.currentQuantity})</p>
          )}
        </div>

        {/* Preview */}
        {isValid && (
          <div className={cn(
            "rounded-md border px-4 py-2.5 text-sm",
            delta > 0
              ? "border-green-200 bg-green-50 text-green-800"
              : delta < 0
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-border bg-muted/30",
          )}>
            Stock will change:{" "}
            <span className="font-semibold tabular-nums">{target.currentQuantity}</span>
            {" → "}
            <span className="font-bold tabular-nums">{newQty}</span>
            {delta !== 0 && (
              <span className="ml-2 font-medium">
                ({delta > 0 ? "+" : ""}{delta})
              </span>
            )}
          </div>
        )}

        {/* Reason */}
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as AdjustmentReason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label htmlFor="adj-note">
            Note <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="adj-note"
            placeholder="e.g. Received PO-2026-0517, 40 units Olive colour"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="resize-none text-sm"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isPending}>
            {isPending ? "Saving…" : "Apply Adjustment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
