"use client";

import * as React from "react";
import { MapPin, PlusCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import type { AddressInput, CustomerAddress } from "@/domain/address/types";
import {
  useAddresses,
  useArchiveAddress,
  useCreateAddress,
  useSetDefaultBilling,
  useSetDefaultShipping,
  useUpdateAddress,
} from "@/features/addresses/hooks/use-addresses";
import { Button } from "@/components/ui/button";
import { AddressCard } from "./address-card";
import { CheckoutAddressForm } from "./checkout-address-form";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CheckoutAddressSelection {
  address: CustomerAddress;
  isValidated: boolean;
}

interface CheckoutAddressPanelProps {
  /** Active storefront country ISO code (e.g. "US") */
  activeCountryIso: string;
  /** Section title */
  title: string;
  /** Currently selected address */
  selected: CustomerAddress | null;
  /** Whether selected address has been server-validated */
  isValidated: boolean;
  /** Called when user selects/changes/adds an address */
  onSelect: (address: CustomerAddress) => void;
  /** Called when selected address is deleted or changed, to reset validation */
  onInvalidate: () => void;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function AddressListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-muted/30" />
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CheckoutAddressPanel({
  activeCountryIso,
  title,
  selected,
  isValidated,
  onSelect,
  onInvalidate,
}: CheckoutAddressPanelProps) {
  const { data, isLoading } = useAddresses();
  const createMut   = useCreateAddress();
  const updateMut   = useUpdateAddress();
  const archiveMut  = useArchiveAddress();
  const setDefaultS = useSetDefaultShipping();
  const setDefaultB = useSetDefaultBilling();

  const [showForm,        setShowForm]        = React.useState(false);
  const [editingAddress,  setEditingAddress]  = React.useState<CustomerAddress | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  const allAddresses = data?.addresses ?? [];

  // Partition into matching / mismatched (not archived, already filtered in service)
  const matching   = allAddresses.filter((a) => a.country_code.toUpperCase() === activeCountryIso);
  const mismatched = allAddresses.filter((a) => a.country_code.toUpperCase() !== activeCountryIso);

  // Auto-select default shipping on first load
  const didAutoSelect = React.useRef(false);
  React.useEffect(() => {
    if (!didAutoSelect.current && !selected && matching.length > 0) {
      const def = matching.find((a) => a.is_default_shipping) ?? matching[0];
      onSelect(def);
      didAutoSelect.current = true;
    }
  }, [matching, selected, onSelect]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSelect(address: CustomerAddress) {
    if (selected?.id !== address.id) {
      onInvalidate();
      onSelect(address);
    }
  }

  function handleEdit(address: CustomerAddress) {
    setEditingAddress(address);
    setShowForm(true);
  }

  function handleDeleteConfirm(id: string) {
    archiveMut.mutate(id, {
      onSuccess: () => {
        toast.success("Address deleted");
        if (selected?.id === id) onInvalidate();
        setConfirmDeleteId(null);
      },
      onError: (err) => toast.error(err.message),
    });
  }

  function handleFormSave(input: AddressInput) {
    if (editingAddress) {
      updateMut.mutate(
        { id: editingAddress.id, patch: input },
        {
          onSuccess: (updated) => {
            toast.success("Address updated");
            if (selected?.id === updated.id) {
              onSelect(updated);
              onInvalidate();
            }
            setShowForm(false);
            setEditingAddress(null);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    } else {
      createMut.mutate(input, {
        onSuccess: (created) => {
          toast.success("Address saved");
          onSelect(created);
          onInvalidate();
          setShowForm(false);
        },
        onError: (err) => toast.error(err.message),
      });
    }
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingAddress(null);
  }

  const isMutating =
    createMut.isPending || updateMut.isPending ||
    archiveMut.isPending || setDefaultS.isPending || setDefaultB.isPending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <MapPin className="h-4 w-4 text-primary" />
          {title}
        </h2>
        {!showForm && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { setEditingAddress(null); setShowForm(true); }}
          >
            <PlusCircle className="h-4 w-4" />
            Add New
          </Button>
        )}
      </div>

      {isLoading ? (
        <AddressListSkeleton />
      ) : matching.length === 0 && !showForm ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
          <MapPin className="mx-auto mb-2 h-8 w-8 opacity-30" />
          <p>No saved addresses for this region.</p>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => setShowForm(true)}
          >
            Add an address
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {matching.map((address) => (
            <React.Fragment key={address.id}>
              {confirmDeleteId === address.id ? (
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
                  <p className="mb-3 font-medium">Delete this address?</p>
                  <p className="mb-3 text-muted-foreground">
                    {[address.first_name, address.address_line1, address.city].join(", ")}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      loading={archiveMut.isPending}
                      onClick={() => handleDeleteConfirm(address.id)}
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : editingAddress?.id === address.id && showForm ? (
                <CheckoutAddressForm
                  countryCode={activeCountryIso}
                  editingAddress={editingAddress}
                  isPending={isMutating}
                  onSubmit={handleFormSave}
                  onCancel={handleFormCancel}
                />
              ) : (
                <AddressCard
                  address={address}
                  isSelected={selected?.id === address.id}
                  isValidated={selected?.id === address.id && isValidated}
                  isRegionMismatch={false}
                  onSelect={() => handleSelect(address)}
                  onEdit={() => handleEdit(address)}
                  onDelete={() => setConfirmDeleteId(address.id)}
                  onSetDefaultShipping={() =>
                    setDefaultS.mutate(address.id, {
                      onSuccess: () => toast.success("Default shipping updated"),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                  onSetDefaultBilling={() =>
                    setDefaultB.mutate(address.id, {
                      onSuccess: () => toast.success("Default billing updated"),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Add new form (not editing an existing card) */}
      {showForm && !editingAddress && (
        <CheckoutAddressForm
          countryCode={activeCountryIso}
          editingAddress={null}
          isPending={isMutating}
          onSubmit={handleFormSave}
          onCancel={handleFormCancel}
        />
      )}

      {/* Region-mismatched addresses — shown collapsed/disabled */}
      {mismatched.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-muted-foreground select-none">
            {mismatched.length} address{mismatched.length > 1 ? "es" : ""} from other regions (unavailable)
          </summary>
          <div className="mt-2 space-y-2">
            {mismatched.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                isSelected={false}
                isValidated={false}
                isRegionMismatch
                onSelect={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                onSetDefaultShipping={() => {}}
                onSetDefaultBilling={() => {}}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
