/**
 * Address domain — error classes
 *
 * All errors extend AppError so they integrate automatically with
 * withApiHandler's error→response mapping.
 */

import { AppError } from "@/lib/errors";

// ── Not found / ownership ─────────────────────────────────────────────────────

export class AddressNotFoundError extends AppError {
  constructor(message = "Address not found") {
    super(message, "ADDRESS_NOT_FOUND", 404);
  }
}

export class AddressOwnershipError extends AppError {
  constructor(message = "You do not have permission to modify this address") {
    super(message, "ADDRESS_OWNERSHIP_ERROR", 403);
  }
}

// ── State errors ──────────────────────────────────────────────────────────────

export class AddressArchivedError extends AppError {
  constructor(message = "This address has been archived and cannot be used") {
    super(message, "ADDRESS_ARCHIVED", 400);
  }
}

// ── Validation errors ─────────────────────────────────────────────────────────

export class InvalidAddressError extends AppError {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message, "INVALID_ADDRESS", 422);
  }
}

export class InvalidPostalCodeError extends InvalidAddressError {
  constructor(countryCode: string, example?: string | null) {
    const hint = example ? ` (example: ${example})` : "";
    super(`Invalid postal code format for ${countryCode}${hint}`, {
      postal_code: [`Invalid format${hint}`],
    });
  }
}

// ── Shipping / region errors ──────────────────────────────────────────────────

export class UnsupportedShippingCountryError extends AppError {
  constructor(countryCode: string) {
    super(
      `Shipping to ${countryCode} is not currently supported`,
      "UNSUPPORTED_SHIPPING_COUNTRY",
      400,
    );
  }
}

export class AddressRegionMismatchError extends AppError {
  constructor(addressCountry: string, storeCountry: string) {
    super(
      `Address country (${addressCountry}) does not match the active store region (${storeCountry})`,
      "ADDRESS_REGION_MISMATCH",
      400,
    );
  }
}

// ── Default address errors ────────────────────────────────────────────────────

export class DefaultAddressConflictError extends AppError {
  constructor(message = "Could not update default address") {
    super(message, "DEFAULT_ADDRESS_CONFLICT", 409);
  }
}

export class CannotArchiveDefaultAddressError extends AppError {
  constructor() {
    super(
      "Cannot archive the default address. Set another address as default first.",
      "CANNOT_ARCHIVE_DEFAULT",
      400,
    );
  }
}
