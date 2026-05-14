/**
 * Unit tests — address domain errors
 */

import { describe, expect, it } from "vitest";

import {
  AddressArchivedError,
  AddressNotFoundError,
  AddressOwnershipError,
  AddressRegionMismatchError,
  CannotArchiveDefaultAddressError,
  DefaultAddressConflictError,
  InvalidAddressError,
  InvalidPostalCodeError,
  UnsupportedShippingCountryError,
} from "@/domain/address/errors";
import { AppError } from "@/lib/errors";

describe("AddressNotFoundError", () => {
  it("is an AppError with 404 status", () => {
    const err = new AddressNotFoundError();
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe("ADDRESS_NOT_FOUND");
  });

  it("uses provided message", () => {
    const err = new AddressNotFoundError("Custom not found");
    expect(err.message).toBe("Custom not found");
  });
});

describe("AddressOwnershipError", () => {
  it("is a 403 AppError", () => {
    const err = new AddressOwnershipError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("ADDRESS_OWNERSHIP_ERROR");
  });
});

describe("AddressArchivedError", () => {
  it("is a 400 AppError", () => {
    const err = new AddressArchivedError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("ADDRESS_ARCHIVED");
  });
});

describe("InvalidAddressError", () => {
  it("is a 422 AppError", () => {
    const err = new InvalidAddressError("bad address");
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe("INVALID_ADDRESS");
    expect(err.message).toBe("bad address");
  });

  it("carries field errors", () => {
    const err = new InvalidAddressError("fail", { postal_code: ["Invalid format"] });
    expect(err.fieldErrors).toEqual({ postal_code: ["Invalid format"] });
  });
});

describe("InvalidPostalCodeError", () => {
  it("includes country code in message", () => {
    const err = new InvalidPostalCodeError("IN");
    expect(err.message).toContain("IN");
    expect(err.statusCode).toBe(422);
  });

  it("includes example when provided", () => {
    const err = new InvalidPostalCodeError("IN", "400001");
    expect(err.message).toContain("400001");
  });
});

describe("UnsupportedShippingCountryError", () => {
  it("is 400 with correct code", () => {
    const err = new UnsupportedShippingCountryError("XY");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("UNSUPPORTED_SHIPPING_COUNTRY");
    expect(err.message).toContain("XY");
  });
});

describe("AddressRegionMismatchError", () => {
  it("is 400 with correct code", () => {
    const err = new AddressRegionMismatchError("US", "IN");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("ADDRESS_REGION_MISMATCH");
    expect(err.message).toContain("US");
    expect(err.message).toContain("IN");
  });
});

describe("DefaultAddressConflictError", () => {
  it("is 409", () => {
    const err = new DefaultAddressConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe("DEFAULT_ADDRESS_CONFLICT");
  });
});

describe("CannotArchiveDefaultAddressError", () => {
  it("is 400 with correct code", () => {
    const err = new CannotArchiveDefaultAddressError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("CANNOT_ARCHIVE_DEFAULT");
  });
});
