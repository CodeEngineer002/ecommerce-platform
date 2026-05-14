"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import { PlusCircle, Pencil, Trash2, Star, MapPin } from "lucide-react";

import type { AddressCountryRules, AddressInput, CustomerAddress } from "@/domain/address/types";
import {
  useArchiveAddress,
  useCreateAddress,
  useSetDefaultBilling,
  useSetDefaultShipping,
  useUpdateAddress,
} from "@/features/addresses/hooks/use-addresses";
import { queryKeys } from "@/lib/query-keys";
import { useUserStore } from "@/store/user-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddressForm } from "./address-form";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialAddresses: CustomerAddress[];
  countryRules: AddressCountryRules[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddressBook({ initialAddresses, countryRules }: Props) {
  const queryClient = useQueryClient();
  const userId = useUserStore((s) => s.user?.id) ?? "";

  const [addresses, setAddresses] = useState<CustomerAddress[]>(initialAddresses);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<CustomerAddress | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.addresses.list(userId) });

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMut = useCreateAddress();
  const updateMut = useUpdateAddress();
  const archiveMut = useArchiveAddress();
  const setDefaultShippingMut = useSetDefaultShipping();
  const setDefaultBillingMut = useSetDefaultBilling();

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCreate(input: AddressInput) {
    createMut.mutate(input, {
      onSuccess: (newAddr) => {
        setAddresses((prev) => [...prev, newAddr]);
        setShowForm(false);
        toast.success("Address saved");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function handleUpdate(input: AddressInput) {
    if (!editingAddress) return;
    updateMut.mutate(
      { id: editingAddress.id, patch: input },
      {
        onSuccess: (updated) => {
          setAddresses((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a)),
          );
          setEditingAddress(null);
          toast.success("Address updated");
          invalidate();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  function handleArchive(id: string) {
    archiveMut.mutate(id, {
      onSuccess: () => {
        setAddresses((prev) => prev.filter((a) => a.id !== id));
        setConfirmArchiveId(null);
        toast.success("Address removed");
        invalidate();
      },
      onError: (err) => {
        setConfirmArchiveId(null);
        toast.error(err.message);
      },
    });
  }

  function handleSetDefaultShipping(id: string) {
    setDefaultShippingMut.mutate(id, {
      onSuccess: (updated) => {
        setAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            is_default_shipping: a.id === updated.id,
          })),
        );
        toast.success("Default shipping address updated");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function handleSetDefaultBilling(id: string) {
    setDefaultBillingMut.mutate(id, {
      onSuccess: (updated) => {
        setAddresses((prev) =>
          prev.map((a) => ({
            ...a,
            is_default_billing: a.id === updated.id,
          })),
        );
        toast.success("Default billing address updated");
        invalidate();
      },
      onError: (err) => toast.error(err.message),
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Address list */}
      {addresses.length === 0 && !showForm && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              You haven&apos;t saved any addresses yet.
            </p>
            <Button onClick={() => setShowForm(true)} size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Address
            </Button>
          </CardContent>
        </Card>
      )}

      {addresses.map((addr) => (
        <Card key={addr.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base">
                {addr.label ?? "Address"}
              </CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {addr.is_default_shipping && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="mr-1 h-3 w-3" />
                    Default Shipping
                  </Badge>
                )}
                {addr.is_default_billing && (
                  <Badge variant="outline" className="text-xs">
                    <Star className="mr-1 h-3 w-3" />
                    Default Billing
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <address className="not-italic text-sm leading-relaxed text-foreground">
              <strong>
                {addr.first_name} {addr.last_name}
              </strong>
              {addr.company && <>, {addr.company}</>}
              <br />
              {addr.address_line1}
              {addr.address_line2 && <>, {addr.address_line2}</>}
              <br />
              {addr.city}
              {addr.state ? `, ${addr.state}` : ""} {addr.postal_code}
              <br />
              {addr.country_code}
              {addr.phone && (
                <>
                  <br />
                  {addr.phone}
                </>
              )}
            </address>

            {addr.delivery_instructions && (
              <p className="mt-2 text-xs text-muted-foreground italic">
                &ldquo;{addr.delivery_instructions}&rdquo;
              </p>
            )}

            {/* Actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingAddress(addr);
                  setShowForm(false);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>

              {!addr.is_default_shipping && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setDefaultShippingMut.isPending}
                  onClick={() => handleSetDefaultShipping(addr.id)}
                >
                  Set Default Shipping
                </Button>
              )}

              {!addr.is_default_billing && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setDefaultBillingMut.isPending}
                  onClick={() => handleSetDefaultBilling(addr.id)}
                >
                  Set Default Billing
                </Button>
              )}

              {/* Archive confirmation */}
              {confirmArchiveId === addr.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Remove this address?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={archiveMut.isPending}
                    onClick={() => handleArchive(addr.id)}
                  >
                    Confirm
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmArchiveId(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmArchiveId(addr.id)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>

            {/* Inline edit form */}
            {editingAddress?.id === addr.id && (
              <div className="mt-4 border-t pt-4">
                <AddressForm
                  defaultValues={addressToInput(addr)}
                  countryRules={countryRules}
                  isPending={updateMut.isPending}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingAddress(null)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Add new address */}
      {addresses.length > 0 && !showForm && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setEditingAddress(null);
            setShowForm(true);
          }}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Add New Address
        </Button>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Address</CardTitle>
          </CardHeader>
          <CardContent>
            <AddressForm
              countryRules={countryRules}
              isPending={createMut.isPending}
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function addressToInput(addr: CustomerAddress): Partial<AddressInput> {
  return {
    first_name:            addr.first_name,
    last_name:             addr.last_name,
    company:               addr.company ?? undefined,
    phone:                 addr.phone ?? undefined,
    email:                 addr.email ?? undefined,
    address_line1:         addr.address_line1,
    address_line2:         addr.address_line2 ?? undefined,
    city:                  addr.city,
    state:                 addr.state,
    postal_code:           addr.postal_code,
    country_code:          addr.country_code,
    country_id:            addr.country_id ?? undefined,
    label:                 addr.label ?? undefined,
    delivery_instructions: addr.delivery_instructions ?? undefined,
    is_default_shipping:   addr.is_default_shipping,
    is_default_billing:    addr.is_default_billing,
  };
}
