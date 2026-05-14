/**
 * Address domain — types
 *
 * These types represent the enriched address domain introduced in migration
 * 00013. They are the authoritative shapes passed between the service layer,
 * API routes, and UI hooks.
 *
 * Note: `server-only` is intentionally NOT imported here so that these types
 * remain usable in shared validators and React components without violating
 * Next.js server/client boundaries.
 */

// ── Stored customer address ───────────────────────────────────────────────────

export interface CustomerAddress {
  id: string;
  user_id: string;

  first_name: string;
  last_name: string;
  company: string | null;

  phone: string | null;
  email: string | null;

  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;   // ISO alpha-2: 'IN', 'US', 'DE' …
  country_id: string | null;  // FK to countries table: 'in', 'us', 'de' …

  label: string | null;
  delivery_instructions: string | null;

  is_default_shipping: boolean;
  is_default_billing: boolean;

  archived_at: string | null;

  validation_metadata: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

// ── Immutable order address snapshot ─────────────────────────────────────────

export interface OrderAddressSnapshot {
  id: string;
  order_id: string;
  address_type: "shipping" | "billing";

  first_name: string;
  last_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  country_name: string;

  source_address_id: string | null;

  created_at: string;
}

// ── Country-specific address validation rules ─────────────────────────────────

export interface AddressCountryRules {
  country_id: string;
  postal_code_required: boolean;
  postal_code_regex: string | null;
  postal_code_example: string | null;
  state_required: boolean;
  phone_required: boolean;
  city_required: boolean;
  rtl_layout: boolean;
  postal_code_label: string;
  state_label: string;
  metadata: Record<string, unknown>;
}

// ── Input DTO for create / update ─────────────────────────────────────────────

export interface AddressInput {
  first_name: string;
  last_name?: string;
  company?: string;
  phone?: string;
  email?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code?: string;
  country_code: string;       // ISO alpha-2
  country_id?: string;        // FK to countries: 'in', 'us' …
  label?: string;
  delivery_instructions?: string;
  is_default_shipping?: boolean;
  is_default_billing?: boolean;
}

// ── Validation result ─────────────────────────────────────────────────────────

export interface AddressFieldError {
  field: string;
  message: string;
}

export interface AddressValidationResult {
  valid: boolean;
  errors: AddressFieldError[];
  normalized?: NormalizedAddress;
}

export interface NormalizedAddress {
  first_name: string;
  last_name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;       // uppercase
  country_id: string | null;
  label: string | null;
  delivery_instructions: string | null;
}

// ── Checkout address selection ────────────────────────────────────────────────

export interface CheckoutAddressSelection {
  /** Saved address id (if user chose from their address book) */
  savedAddressId?: string;
  /** Manual address entry (guest or "use new address") */
  manualAddress?: AddressInput;
  /** Whether billing == shipping */
  billingSameAsShipping: boolean;
  savedBillingAddressId?: string;
  manualBillingAddress?: AddressInput;
}

// ── Snapshot DTO (for order creation) ────────────────────────────────────────

export interface AddressSnapshotInput {
  order_id: string;
  address_type: "shipping" | "billing";
  first_name: string;
  last_name: string;
  company?: string;
  phone?: string;
  email?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  country_name: string;
  source_address_id?: string;
}
