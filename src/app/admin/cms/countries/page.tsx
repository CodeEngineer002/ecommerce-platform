"use client";

import * as Flags from "country-flag-icons/react/3x2";
import { Globe, Plus, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useAllCountries,
  useAllLanguages,
  useAddLanguageToCountry,
  useCountryLocales,
  useRemoveLanguageFromCountry,
  useToggleCountryActive,
} from "@/features/admin/hooks/use-country-management";
import { cn } from "@/lib/utils";
import type { CountryRow } from "@/features/admin/services/country-management.service";

// ── Flag helper ────────────────────────────────────────────────────────────────
function CountryFlag({ iso2, className }: { iso2: string; className?: string }) {
  const Flag = (Flags as Record<string, React.ComponentType<{ className?: string }>>)[iso2.toUpperCase()];
  if (!Flag) return <Globe className={cn("h-4 w-4", className)} />;
  return <Flag className={cn("h-4 w-5 rounded-[2px] shadow-sm", className)} />;
}

// ── Language manager for a single country ─────────────────────────────────────
function CountryLanguages({
  country,
}: {
  country: CountryRow;
}) {
  const { data: locales = [] } = useCountryLocales(country.id);
  const { data: allLangs = [] } = useAllLanguages();
  const { mutate: addLang, isPending: adding } = useAddLanguageToCountry();
  const { mutate: removeLang } = useRemoveLanguageFromCountry();
  const [open, setOpen] = useState(false);

  const existingLangIds = new Set(locales.map((l) => l.language_id));
  const availableToAdd = allLangs.filter((l) => !existingLangIds.has(l.id));

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {locales.map((locale) => {
          const lang = allLangs.find((l) => l.id === locale.language_id);
          return (
            <div
              key={locale.id}
              className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-0.5 text-xs"
            >
              <span className="font-medium">{lang?.native_name ?? locale.language_id}</span>
              <span className="uppercase text-muted-foreground">{locale.language_id}</span>
              {locale.is_default && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  DEFAULT
                </Badge>
              )}
              {!locale.is_default && (
                <button
                  onClick={() =>
                    removeLang({ localeId: locale.id, countryId: country.id })
                  }
                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                  title="Remove language"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {availableToAdd.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" /> Add language
            </button>
            {open && (
              <div className="absolute left-0 top-7 z-10 min-w-[160px] rounded-md border bg-popover shadow-lg">
                {availableToAdd.map((lang) => (
                  <button
                    key={lang.id}
                    disabled={adding}
                    onClick={() => {
                      addLang({
                        countryId: country.id,
                        languageId: lang.id,
                        isoAlpha2: country.iso_alpha2,
                      });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span>{lang.native_name}</span>
                    <span className="ml-auto text-xs uppercase text-muted-foreground">
                      {lang.id}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminCountriesPage() {
  const { data: countries = [], isLoading } = useAllCountries();
  const { mutate: toggleActive, isPending } = useToggleCountryActive();

  if (isLoading) return <LoadingState text="Loading countries…" />;

  const active = countries.filter((c) => c.is_active);
  const inactive = countries.filter((c) => !c.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <PageHeader
          title="Country Management"
          description={`${active.length} active countries · ${inactive.length} disabled`}
        />
        <Button asChild>
          <Link href="/admin/cms/countries/new">
            <Plus className="mr-1.5 h-4 w-4" /> Add Country
          </Link>
        </Button>
      </div>

      {/* Active countries */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Active ({active.length})
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((country) => (
            <Card key={country.id} className="overflow-hidden">
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CountryFlag iso2={country.iso_alpha2} />
                    <div>
                      <CardTitle className="text-sm">{country.name}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {country.iso_alpha2} · {country.currency_code}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Disable country"
                    disabled={isPending}
                    onClick={() => toggleActive({ id: country.id, isActive: false })}
                  >
                    <PowerOff className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-4 pt-0">
                <div className="text-xs text-muted-foreground">
                  {country.timezone}
                </div>
                <CountryLanguages country={country} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Inactive countries */}
      {inactive.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Disabled ({inactive.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inactive.map((country) => (
              <Card key={country.id} className="overflow-hidden opacity-60">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CountryFlag iso2={country.iso_alpha2} className="grayscale" />
                      <div>
                        <CardTitle className="text-sm text-muted-foreground">
                          {country.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {country.iso_alpha2} · {country.currency_code}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-green-600"
                      title="Enable country"
                      disabled={isPending}
                      onClick={() => toggleActive({ id: country.id, isActive: true })}
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
