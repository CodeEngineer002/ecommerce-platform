/**
 * Unit tests — address region policy
 */

import { describe, expect, it } from "vitest";

import {
  AddressRegionMismatchError,
  UnsupportedShippingCountryError,
} from "@/domain/address/errors";
import {
  assertAddressMatchesActiveRegion,
  assertShippingCountrySupported,
  countryIdToIso,
  getAllowedShippingCountriesForRegion,
  isoToCountryId,
} from "@/domain/address/region-policy";
import type { AddressInput } from "@/domain/address/types";

function makeAddress(countryCode: string): AddressInput {
  return {
    first_name:   "Test",
    address_line1: "123 Test St",
    city:         "Test City",
    country_code: countryCode,
  };
}

describe("countryIdToIso", () => {
  it.each([
    ["us", "US"],
    ["uk", "GB"],
    ["de", "DE"],
    ["in", "IN"],
    ["ae", "AE"],
  ])("%s → %s", (id, iso) => {
    expect(countryIdToIso(id)).toBe(iso);
  });

  it("uppercases unknown country id", () => {
    expect(countryIdToIso("jp")).toBe("JP");
  });
});

describe("isoToCountryId", () => {
  it.each([
    ["US", "us"],
    ["GB", "uk"],
    ["DE", "de"],
    ["IN", "in"],
    ["AE", "ae"],
  ])("%s → %s", (iso, id) => {
    expect(isoToCountryId(iso)).toBe(id);
  });

  it("lowercases unknown iso", () => {
    expect(isoToCountryId("JP")).toBe("jp");
  });
});

describe("getAllowedShippingCountriesForRegion", () => {
  it("returns all 8 configured countries for IN region", () => {
    const allowed = getAllowedShippingCountriesForRegion("in");
    expect(allowed.has("IN")).toBe(true);
    expect(allowed.has("US")).toBe(true);
    expect(allowed.has("GB")).toBe(true);
    expect(allowed.size).toBeGreaterThanOrEqual(8);
  });

  it("returns same set for US region", () => {
    const allowed = getAllowedShippingCountriesForRegion("us");
    expect(allowed.has("US")).toBe(true);
    expect(allowed.has("IN")).toBe(true);
  });
});

describe("assertShippingCountrySupported", () => {
  it.each(["US", "GB", "DE", "FR", "IT", "ES", "IN", "AE"])(
    "does not throw for supported country %s",
    (iso) => {
      expect(() =>
        assertShippingCountrySupported(makeAddress(iso)),
      ).not.toThrow();
    },
  );

  it("throws UnsupportedShippingCountryError for unknown country", () => {
    expect(() =>
      assertShippingCountrySupported(makeAddress("XY")),
    ).toThrow(UnsupportedShippingCountryError);
  });

  it("is case-insensitive", () => {
    expect(() =>
      assertShippingCountrySupported(makeAddress("us")),
    ).not.toThrow();
  });
});

describe("assertAddressMatchesActiveRegion", () => {
  it("passes when address country matches active region", () => {
    expect(() =>
      assertAddressMatchesActiveRegion(makeAddress("IN"), "in"),
    ).not.toThrow();
  });

  it("throws AddressRegionMismatchError when country differs", () => {
    expect(() =>
      assertAddressMatchesActiveRegion(makeAddress("US"), "in"),
    ).toThrow(AddressRegionMismatchError);
  });

  it("includes both countries in error message", () => {
    let err: AddressRegionMismatchError | undefined;
    try {
      assertAddressMatchesActiveRegion(makeAddress("US"), "in");
    } catch (e) {
      err = e as AddressRegionMismatchError;
    }
    expect(err?.message).toContain("US");
    expect(err?.message).toContain("IN");
  });
});
