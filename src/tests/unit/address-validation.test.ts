/**
 * Unit tests — address validation engine
 *
 * All functions under test are pure (no DB), so no mocking required.
 */

import { describe, expect, it } from "vitest";

import type { AddressCountryRules, AddressInput } from "@/domain/address/types";
import {
  addressFieldErrorsToRecord,
  normalizeAddress,
  validateAddressForCountry,
} from "@/domain/address/validation";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const IN_RULES: AddressCountryRules = {
  country_id:            "in",
  postal_code_required:  true,
  postal_code_regex:     "^\\d{6}$",
  postal_code_example:   "400001",
  state_required:        true,
  phone_required:        true,
  city_required:         true,
  rtl_layout:            false,
  postal_code_label:     "PIN Code",
  state_label:           "State",
  metadata:              {},
};

const US_RULES: AddressCountryRules = {
  country_id:            "us",
  postal_code_required:  true,
  postal_code_regex:     "^\\d{5}(-\\d{4})?$",
  postal_code_example:   "90210",
  state_required:        true,
  phone_required:        false,
  city_required:         true,
  rtl_layout:            false,
  postal_code_label:     "ZIP Code",
  state_label:           "State",
  metadata:              {},
};

const UK_RULES: AddressCountryRules = {
  country_id:            "uk",
  postal_code_required:  true,
  postal_code_regex:     "^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$",
  postal_code_example:   "SW1A 1AA",
  state_required:        false,
  phone_required:        false,
  city_required:         true,
  rtl_layout:            false,
  postal_code_label:     "Postcode",
  state_label:           "County",
  metadata:              {},
};

const AE_RULES: AddressCountryRules = {
  country_id:            "ae",
  postal_code_required:  false,
  postal_code_regex:     null,
  postal_code_example:   null,
  state_required:        true,
  phone_required:        true,
  city_required:         true,
  rtl_layout:            true,
  postal_code_label:     "Postal Code",
  state_label:           "Emirate",
  metadata:              {},
};

function validIN(): AddressInput {
  return {
    first_name:   "Priya",
    address_line1: "123 Main St",
    city:         "Mumbai",
    state:        "Maharashtra",
    postal_code:  "400001",
    country_code: "IN",
    country_id:   "in",
    phone:        "+91-9876543210",
  };
}

function validUS(): AddressInput {
  return {
    first_name:   "John",
    address_line1: "1600 Pennsylvania Ave",
    city:         "Washington",
    state:        "DC",
    postal_code:  "20500",
    country_code: "US",
    country_id:   "us",
  };
}

// ── normalizeAddress ──────────────────────────────────────────────────────────

describe("normalizeAddress", () => {
  it("uppercases country_code", () => {
    const result = normalizeAddress({ ...validIN(), country_code: "in" });
    expect(result.country_code).toBe("IN");
  });

  it("trims all string fields", () => {
    const result = normalizeAddress({
      ...validIN(),
      first_name: "  Priya  ",
      city:       "  Mumbai  ",
    });
    expect(result.first_name).toBe("Priya");
    expect(result.city).toBe("Mumbai");
  });

  it("sets null for empty optional fields", () => {
    const result = normalizeAddress({ ...validIN(), company: "", phone: "" });
    expect(result.company).toBeNull();
    expect(result.phone).toBeNull();
  });

  it("normalizes UK postcode spacing", () => {
    const result = normalizeAddress({
      ...validUS(),
      country_code: "GB",
      postal_code: "SW1A1AA",
    });
    expect(result.postal_code).toBe("SW1A 1AA");
  });

  it("lowercases country_id", () => {
    const result = normalizeAddress({ ...validIN(), country_id: "IN" });
    expect(result.country_id).toBe("in");
  });
});

// ── validateAddressForCountry ─────────────────────────────────────────────────

describe("validateAddressForCountry — India", () => {
  it("returns valid for a correct IN address", () => {
    const result = validateAddressForCountry(validIN(), IN_RULES);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalized).toBeDefined();
  });

  it("requires first_name", () => {
    const result = validateAddressForCountry({ ...validIN(), first_name: "" }, IN_RULES);
    expect(result.valid).toBe(false);
    const field = result.errors.find((e) => e.field === "first_name");
    expect(field).toBeDefined();
  });

  it("requires phone for IN", () => {
    const result = validateAddressForCountry({ ...validIN(), phone: "" }, IN_RULES);
    expect(result.valid).toBe(false);
    const field = result.errors.find((e) => e.field === "phone");
    expect(field).toBeDefined();
  });

  it("requires state for IN", () => {
    const result = validateAddressForCountry({ ...validIN(), state: "" }, IN_RULES);
    expect(result.valid).toBe(false);
    const field = result.errors.find((e) => e.field === "state");
    expect(field).toBeDefined();
  });

  it("rejects 5-digit PIN (must be 6)", () => {
    const result = validateAddressForCountry({ ...validIN(), postal_code: "40001" }, IN_RULES);
    expect(result.valid).toBe(false);
    const field = result.errors.find((e) => e.field === "postal_code");
    expect(field).toBeDefined();
  });

  it("accepts valid 6-digit PIN", () => {
    const result = validateAddressForCountry({ ...validIN(), postal_code: "110001" }, IN_RULES);
    expect(result.valid).toBe(true);
  });
});

describe("validateAddressForCountry — United States", () => {
  it("returns valid for a correct US address", () => {
    const result = validateAddressForCountry(validUS(), US_RULES);
    expect(result.valid).toBe(true);
  });

  it("accepts ZIP+4 format", () => {
    const result = validateAddressForCountry(
      { ...validUS(), postal_code: "90210-1234" },
      US_RULES,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects 4-digit ZIP", () => {
    const result = validateAddressForCountry(
      { ...validUS(), postal_code: "9021" },
      US_RULES,
    );
    expect(result.valid).toBe(false);
  });

  it("does NOT require phone for US", () => {
    const result = validateAddressForCountry({ ...validUS(), phone: undefined }, US_RULES);
    expect(result.valid).toBe(true);
  });
});

describe("validateAddressForCountry — United Kingdom", () => {
  it("accepts valid postcode with space", () => {
    const result = validateAddressForCountry(
      {
        ...validUS(),
        country_code: "GB",
        country_id: "uk",
        postal_code: "SW1A 1AA",
        state: "",
      },
      UK_RULES,
    );
    expect(result.valid).toBe(true);
  });

  it("accepts postcode without space (normalised by normalizeAddress)", () => {
    const result = validateAddressForCountry(
      {
        ...validUS(),
        country_code: "GB",
        country_id: "uk",
        postal_code: "SW1A1AA",
        state: "",
      },
      UK_RULES,
    );
    expect(result.valid).toBe(true);
  });

  it("does NOT require state for UK", () => {
    const result = validateAddressForCountry(
      {
        ...validUS(),
        country_code: "GB",
        country_id: "uk",
        postal_code: "SW1A 1AA",
        state: "",
      },
      UK_RULES,
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateAddressForCountry — UAE (no postal code required)", () => {
  it("passes without postal code", () => {
    const result = validateAddressForCountry(
      {
        first_name: "Ahmed",
        address_line1: "Sheikh Zayed Rd",
        city: "Dubai",
        state: "Dubai",
        postal_code: "",
        country_code: "AE",
        country_id: "ae",
        phone: "+971-50-1234567",
      },
      AE_RULES,
    );
    expect(result.valid).toBe(true);
  });

  it("requires phone for UAE", () => {
    const result = validateAddressForCountry(
      {
        first_name: "Ahmed",
        address_line1: "Sheikh Zayed Rd",
        city: "Dubai",
        state: "Dubai",
        postal_code: "",
        country_code: "AE",
        country_id: "ae",
        phone: "",
      },
      AE_RULES,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "phone")).toBe(true);
  });

  it("requires state (emirate) for UAE", () => {
    const result = validateAddressForCountry(
      {
        first_name: "Ahmed",
        address_line1: "Sheikh Zayed Rd",
        city: "Dubai",
        state: "",
        postal_code: "",
        country_code: "AE",
        country_id: "ae",
        phone: "+971-50-1234567",
      },
      AE_RULES,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "state")).toBe(true);
  });
});

describe("validateAddressForCountry — no rules provided", () => {
  it("applies generic checks when rules is null", () => {
    const result = validateAddressForCountry(
      {
        first_name: "Test",
        address_line1: "123 Test St",
        city: "Testville",
        state: "",
        postal_code: "12345",
        country_code: "ZZ",
      },
      null,
    );
    expect(result.valid).toBe(true);
  });

  it("requires city even without rules", () => {
    const result = validateAddressForCountry(
      {
        first_name: "Test",
        address_line1: "123 Test St",
        city: "",
        state: "",
        postal_code: "12345",
        country_code: "ZZ",
      },
      null,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === "city")).toBe(true);
  });
});

// ── addressFieldErrorsToRecord ─────────────────────────────────────────────────

describe("addressFieldErrorsToRecord", () => {
  it("groups multiple errors per field", () => {
    const errors = [
      { field: "phone", message: "Required" },
      { field: "phone", message: "Invalid format" },
      { field: "postal_code", message: "Required" },
    ];
    const record = addressFieldErrorsToRecord(errors);
    expect(record.phone).toHaveLength(2);
    expect(record.postal_code).toHaveLength(1);
  });

  it("returns empty object for no errors", () => {
    expect(addressFieldErrorsToRecord([])).toEqual({});
  });
});
