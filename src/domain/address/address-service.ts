/**
 * Address domain — address book service
 *
 * All DB operations use the service-role client (bypasses RLS).
 * Ownership is enforced at the service layer.
 *
 * server-only: this module MUST NOT be imported in client components.
 */

import "server-only";

import type {
  AddressCountryRules,
  AddressInput,
  AddressSnapshotInput,
  CustomerAddress,
  NormalizedAddress,
  OrderAddressSnapshot,
} from "./types";
import {
  AddressArchivedError,
  AddressNotFoundError,
  AddressOwnershipError,
  CannotArchiveDefaultAddressError,
  InvalidAddressError,
} from "./errors";
import {
  addressFieldErrorsToRecord,
  normalizeAddress,
  validateAddressForCountry,
} from "./validation";
import { assertShippingCountrySupported } from "./region-policy";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// ── Internal helpers ─────────────────────────────────────────────────────────

async function getDb() {
  return createServiceClient();
}

function assertOwnership(address: CustomerAddress, userId: string): void {
  if (address.user_id !== userId) throw new AddressOwnershipError();
}

function assertNotArchived(address: CustomerAddress): void {
  if (address.archived_at !== null) throw new AddressArchivedError();
}

// ── Country rules cache (in-process, per cold-start) ─────────────────────────

const rulesCache = new Map<string, AddressCountryRules>();

export async function getCountryRules(
  countryId: string,
): Promise<AddressCountryRules | null> {
  const id = countryId.toLowerCase();
  if (rulesCache.has(id)) return rulesCache.get(id)!;

  const db = await getDb();
  const { data, error } = await db
    .from("address_country_rules")
    .select("*")
    .eq("country_id", id)
    .single();

  if (error || !data) return null;

  const rules = data as unknown as AddressCountryRules;
  rulesCache.set(id, rules);
  return rules;
}

export async function getAllCountryRules(): Promise<AddressCountryRules[]> {
  const db = await getDb();
  const { data, error } = await db
    .from("address_country_rules")
    .select("*")
    .order("country_id");

  if (error) {
    logger.error("[AddressService] Failed to load country rules", error);
    return [];
  }
  return (data ?? []) as unknown as AddressCountryRules[];
}

// ── Validate + normalize ──────────────────────────────────────────────────────

async function validateAndNormalize(
  input: AddressInput,
): Promise<NormalizedAddress> {
  // Resolve country_id from country_code if not supplied
  const enriched: AddressInput = {
    ...input,
    country_id: input.country_id ?? isoToCountryIdLocal(input.country_code),
  };

  const rules = await getCountryRules(enriched.country_id ?? "");
  const result = validateAddressForCountry(enriched, rules);

  if (!result.valid) {
    throw new InvalidAddressError(
      "Address validation failed",
      addressFieldErrorsToRecord(result.errors),
    );
  }

  assertShippingCountrySupported(enriched);

  return result.normalized!;
}

/** Maps ISO alpha-2 → country_id key used in our countries table */
function isoToCountryIdLocal(iso: string): string {
  const map: Record<string, string> = {
    US: "us", GB: "uk", DE: "de", FR: "fr",
    IT: "it", ES: "es", IN: "in", AE: "ae",
  };
  return map[iso.toUpperCase()] ?? iso.toLowerCase();
}

// ── List ─────────────────────────────────────────────────────────────────────

export async function listAddresses(userId: string): Promise<CustomerAddress[]> {
  const db = await getDb();
  const { data, error } = await db
    .from("customer_addresses")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("is_default_shipping", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    logger.error("[AddressService] listAddresses error", error);
    throw new Error("Failed to load addresses");
  }

  return (data ?? []) as unknown as CustomerAddress[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createAddress(
  userId: string,
  input: AddressInput,
): Promise<CustomerAddress> {
  const normalized = await validateAndNormalize(input);

  const db = await getDb();
  const { data, error } = await db
    .from("customer_addresses")
    .insert({
      user_id:              userId,
      first_name:           normalized.first_name,
      last_name:            normalized.last_name,
      company:              normalized.company,
      phone:                normalized.phone,
      email:                normalized.email,
      address_line1:        normalized.address_line1,
      address_line2:        normalized.address_line2,
      city:                 normalized.city,
      state:                normalized.state,
      postal_code:          normalized.postal_code,
      country_code:         normalized.country_code,
      country_id:           normalized.country_id,
      label:                normalized.label,
      delivery_instructions: normalized.delivery_instructions,
      is_default_shipping:  input.is_default_shipping ?? false,
      is_default_billing:   input.is_default_billing ?? false,
      validation_metadata:  {},
    })
    .select("*")
    .single();

  if (error) {
    logger.error("[AddressService] createAddress error", error);
    throw new Error("Failed to create address");
  }

  return data as unknown as CustomerAddress;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateAddress(
  userId: string,
  addressId: string,
  patch: Partial<AddressInput>,
): Promise<CustomerAddress> {
  const db = await getDb();

  // Fetch current address first
  const { data: existing, error: fetchError } = await db
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .single();

  if (fetchError || !existing) throw new AddressNotFoundError();

  const address = existing as unknown as CustomerAddress;
  assertOwnership(address, userId);
  assertNotArchived(address);

  // Merge patch with current values to build a full AddressInput for validation
  const merged: AddressInput = {
    first_name:           patch.first_name           ?? address.first_name,
    last_name:            patch.last_name            ?? address.last_name,
    company:              patch.company              ?? address.company ?? undefined,
    phone:                patch.phone               ?? address.phone ?? undefined,
    email:                patch.email               ?? address.email ?? undefined,
    address_line1:        patch.address_line1        ?? address.address_line1,
    address_line2:        patch.address_line2        ?? address.address_line2 ?? undefined,
    city:                 patch.city                 ?? address.city,
    state:                patch.state                ?? address.state,
    postal_code:          patch.postal_code          ?? address.postal_code,
    country_code:         patch.country_code         ?? address.country_code,
    country_id:           patch.country_id           ?? address.country_id ?? undefined,
    label:                patch.label                ?? address.label ?? undefined,
    delivery_instructions: patch.delivery_instructions ?? address.delivery_instructions ?? undefined,
    is_default_shipping:  patch.is_default_shipping  ?? address.is_default_shipping,
    is_default_billing:   patch.is_default_billing   ?? address.is_default_billing,
  };

  const normalized = await validateAndNormalize(merged);

  const { data, error } = await db
    .from("customer_addresses")
    .update({
      first_name:           normalized.first_name,
      last_name:            normalized.last_name,
      company:              normalized.company,
      phone:                normalized.phone,
      email:                normalized.email,
      address_line1:        normalized.address_line1,
      address_line2:        normalized.address_line2,
      city:                 normalized.city,
      state:                normalized.state,
      postal_code:          normalized.postal_code,
      country_code:         normalized.country_code,
      country_id:           normalized.country_id,
      label:                normalized.label,
      delivery_instructions: normalized.delivery_instructions,
      is_default_shipping:  merged.is_default_shipping,
      is_default_billing:   merged.is_default_billing,
      validation_metadata:  {},
    })
    .eq("id", addressId)
    .select("*")
    .single();

  if (error) {
    logger.error("[AddressService] updateAddress error", error);
    throw new Error("Failed to update address");
  }

  return data as unknown as CustomerAddress;
}

// ── Archive (soft-delete) ─────────────────────────────────────────────────────

export async function archiveAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  const db = await getDb();

  const { data: existing, error: fetchError } = await db
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .single();

  if (fetchError || !existing) throw new AddressNotFoundError();

  const address = existing as unknown as CustomerAddress;
  assertOwnership(address, userId);

  if (address.archived_at !== null) return; // idempotent

  // Prevent archiving the only/default address
  if (address.is_default_shipping || address.is_default_billing) {
    throw new CannotArchiveDefaultAddressError();
  }

  const { error } = await db
    .from("customer_addresses")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", addressId);

  if (error) {
    logger.error("[AddressService] archiveAddress error", error);
    throw new Error("Failed to archive address");
  }
}

// ── Set defaults ──────────────────────────────────────────────────────────────

export async function setDefaultShipping(
  userId: string,
  addressId: string,
): Promise<CustomerAddress> {
  return _setDefault(userId, addressId, "shipping");
}

export async function setDefaultBilling(
  userId: string,
  addressId: string,
): Promise<CustomerAddress> {
  return _setDefault(userId, addressId, "billing");
}

async function _setDefault(
  userId: string,
  addressId: string,
  type: "shipping" | "billing",
): Promise<CustomerAddress> {
  const db = await getDb();

  const { data: existing, error: fetchError } = await db
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .single();

  if (fetchError || !existing) throw new AddressNotFoundError();

  const address = existing as unknown as CustomerAddress;
  assertOwnership(address, userId);
  assertNotArchived(address);

  const updatePayload =
    type === "shipping"
      ? { is_default_shipping: true }
      : { is_default_billing: true };

  const { data, error } = await db
    .from("customer_addresses")
    .update(updatePayload)
    .eq("id", addressId)
    .select("*")
    .single();

  if (error) {
    logger.error(`[AddressService] setDefault${type} error`, error);
    throw new Error(`Failed to set default ${type} address`);
  }

  return data as unknown as CustomerAddress;
}

// ── Order address snapshot ────────────────────────────────────────────────────

export async function createOrderAddressSnapshot(
  input: AddressSnapshotInput,
): Promise<OrderAddressSnapshot> {
  const db = await getDb();

  const { data, error } = await db
    .from("order_address_snapshots")
    .insert({
      order_id:         input.order_id,
      address_type:     input.address_type,
      first_name:       input.first_name,
      last_name:        input.last_name,
      company:          input.company ?? null,
      phone:            input.phone ?? null,
      email:            input.email ?? null,
      address_line1:    input.address_line1,
      address_line2:    input.address_line2 ?? null,
      city:             input.city,
      state:            input.state,
      postal_code:      input.postal_code,
      country_code:     input.country_code.toUpperCase(),
      country_name:     input.country_name,
      source_address_id: input.source_address_id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    logger.error("[AddressService] createOrderAddressSnapshot error", error);
    throw new Error("Failed to create address snapshot");
  }

  return data as unknown as OrderAddressSnapshot;
}

/**
 * Loads a saved address and builds a snapshot input DTO.
 * Use at order creation time when the user selects a saved address.
 */
export async function snapshotFromSavedAddress(
  userId: string,
  addressId: string,
  orderId: string,
  addressType: "shipping" | "billing",
  countryName: string,
): Promise<AddressSnapshotInput> {
  const db = await getDb();

  const { data: existing, error } = await db
    .from("customer_addresses")
    .select("*")
    .eq("id", addressId)
    .single();

  if (error || !existing) throw new AddressNotFoundError();

  const address = existing as unknown as CustomerAddress;
  assertOwnership(address, userId);
  assertNotArchived(address);

  return {
    order_id:         orderId,
    address_type:     addressType,
    first_name:       address.first_name,
    last_name:        address.last_name,
    company:          address.company ?? undefined,
    phone:            address.phone ?? undefined,
    email:            address.email ?? undefined,
    address_line1:    address.address_line1,
    address_line2:    address.address_line2 ?? undefined,
    city:             address.city,
    state:            address.state,
    postal_code:      address.postal_code,
    country_code:     address.country_code,
    country_name:     countryName,
    source_address_id: address.id,
  };
}
