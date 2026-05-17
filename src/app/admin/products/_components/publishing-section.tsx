"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { UseFormSetValue } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CountryRow } from "@/features/admin/services/country-management.service";
import type { ProductFormData } from "@/lib/validators";

// ── Region grouping ───────────────────────────────────────────────────────────

const REGION_MAP: Record<string, string[]> = {
  "Asia & Pacific": ["IN", "JP", "SG", "AU", "CN", "KR", "MY", "TH", "ID", "PH"],
  "Europe": ["GB", "UK", "DE", "FR", "ES", "IT", "NL", "PL", "SE", "NO", "DK", "FI", "CH", "AT", "BE"],
  "Americas": ["US", "CA", "BR", "MX", "AR", "CL", "CO"],
  "Middle East & Africa": ["AE", "SA", "QA", "KW", "BH", "OM", "EG", "ZA", "NG", "KE"],
};

function getRegion(isoAlpha2: string): string {
  for (const [region, codes] of Object.entries(REGION_MAP)) {
    if (codes.includes(isoAlpha2.toUpperCase())) return region;
  }
  return "Other";
}

interface Props {
  allCountries: CountryRow[];
  selectedCountryIds: string[];
  onCountryChange: (ids: string[]) => void;
  register?: UseFormSetValue<ProductFormData>;
  isActive: boolean;
  isFeatured: boolean;
  onActiveChange: (v: boolean) => void;
  onFeaturedChange: (v: boolean) => void;
}

export function PublishingSection({
  allCountries,
  selectedCountryIds,
  onCountryChange,
  isActive,
  isFeatured,
  onActiveChange,
  onFeaturedChange,
}: Props) {
  const [countrySearch, setCountrySearch] = useState("");

  const filteredCountries = useMemo(() => {
    const q = countrySearch.toLowerCase();
    if (!q) return allCountries;
    return allCountries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso_alpha2.toLowerCase().includes(q),
    );
  }, [allCountries, countrySearch]);

  // Group by region
  const grouped = useMemo(() => {
    const map = new Map<string, CountryRow[]>();
    for (const c of filteredCountries) {
      const region = getRegion(c.iso_alpha2);
      if (!map.has(region)) map.set(region, []);
      map.get(region)!.push(c);
    }
    // Sort: known regions first, then Other
    const order = ["Asia & Pacific", "Europe", "Americas", "Middle East & Africa", "Other"];
    return order.flatMap((r) => {
      const countries = map.get(r);
      return countries ? [{ region: r, countries }] : [];
    });
  }, [filteredCountries]);

  function toggleCountry(id: string, checked: boolean) {
    onCountryChange(
      checked
        ? [...selectedCountryIds, id]
        : selectedCountryIds.filter((x) => x !== id),
    );
  }

  function toggleRegion(countries: CountryRow[], checked: boolean) {
    const ids = countries.map((c) => c.id);
    if (checked) {
      onCountryChange(Array.from(new Set([...selectedCountryIds, ...ids])));
    } else {
      onCountryChange(selectedCountryIds.filter((x) => !ids.includes(x)));
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Controls visibility on the storefront.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={isActive}
              onCheckedChange={(v) => onActiveChange(!!v)}
            />
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Visible on the storefront. Uncheck to hide without archiving.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <Checkbox
              checked={isFeatured}
              onCheckedChange={(v) => onFeaturedChange(!!v)}
            />
            <div>
              <p className="text-sm font-medium">Featured</p>
              <p className="text-xs text-muted-foreground">
                Shown in featured product sections and homepage highlights.
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Country availability */}
      <Card>
        <CardHeader>
          <CardTitle>Market Availability</CardTitle>
          <CardDescription>
            Select specific markets where this product is visible.
            Leave all unchecked to make it available in all markets globally.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Summary */}
          {selectedCountryIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Available in {selectedCountryIds.length} market{selectedCountryIds.length !== 1 ? "s" : ""}:
              </span>
              {selectedCountryIds.slice(0, 6).map((cid) => {
                const c = allCountries.find((x) => x.id === cid);
                return (
                  <Badge key={cid} variant="secondary" className="gap-1 text-xs">
                    {c?.iso_alpha2 ?? cid}
                    <button
                      type="button"
                      onClick={() => toggleCountry(cid, false)}
                      className="ml-0.5 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {selectedCountryIds.length > 6 && (
                <Badge variant="outline" className="text-xs">
                  +{selectedCountryIds.length - 6} more
                </Badge>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground"
                onClick={() => onCountryChange([])}
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Search */}
          <Input
            placeholder="Search countries…"
            value={countrySearch}
            onChange={(e) => setCountrySearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="h-9"
          />

          {/* Grouped country list */}
          <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
            {grouped.map(({ region, countries }) => {
              const allSelected = countries.every((c) => selectedCountryIds.includes(c.id));
              const someSelected = countries.some((c) => selectedCountryIds.includes(c.id));
              return (
                <div key={region}>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={allSelected}
                      className={someSelected && !allSelected ? "data-[state=unchecked]:opacity-50" : ""}
                      onCheckedChange={(v) => toggleRegion(countries, !!v)}
                    />
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {region}
                    </Label>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 ml-6 sm:grid-cols-3">
                    {countries.map((country) => (
                      <label
                        key={country.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 hover:bg-muted/50 transition-colors"
                      >
                        <Checkbox
                          checked={selectedCountryIds.includes(country.id)}
                          onCheckedChange={(v) => toggleCountry(country.id, !!v)}
                        />
                        <span className="text-xs font-mono text-muted-foreground">{country.iso_alpha2}</span>
                        <span className="text-xs truncate">{country.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
