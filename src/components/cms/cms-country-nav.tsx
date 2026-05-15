"use client";

import * as Flags from "country-flag-icons/react/3x2";
import { Globe, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type React from "react";

import { useActiveCountries } from "@/features/admin/hooks/use-country-management";
import type { CountryRow } from "@/features/admin/services/country-management.service";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  LANGUAGES,
  type CountryCode,
  type LanguageCode,
} from "@/lib/i18n/config";

// ── Flag helper — works for both hardcoded and dynamic countries ──────────────
function CountryFlag({
  iso2,
  className,
}: {
  iso2: string;
  className?: string;
}) {
  const Flag = (
    Flags as Record<string, React.ComponentType<{ className?: string; title?: string }>>
  )[iso2.toUpperCase()];
  if (!Flag) return <Globe className={cn("h-4 w-4", className)} />;
  return (
    <Flag
      className={cn("h-4 w-5 rounded-[2px] object-cover shadow-sm", className)}
      title={iso2.toUpperCase()}
    />
  );
}

// ── CMS module definitions ────────────────────────────────────────────────────
export const CMS_MODULES = [
  { id: "homepage",   label: "Homepage" },
  { id: "pages",      label: "Pages" },
  { id: "blocks",     label: "Blocks" },
  { id: "navigation", label: "Navigation" },
  { id: "banners",    label: "Banners" },
  { id: "media",      label: "Media" },
] as const;

export type CmsModuleId = (typeof CMS_MODULES)[number]["id"];

// ── CmsCountryNav ─────────────────────────────────────────────────────────────
/**
 * 3-tier country-first CMS navigation:
 *   Level 1: Country selector (horizontal pills)
 *   Level 2: Language tabs for selected country
 *   Level 3: CMS module tabs
 *
 * All navigation is URL-driven — no local state.
 * URL structure: /admin/cms/[country]/[lang]/[module]
 */
export function CmsCountryNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ country: string; lang: string }>();

  // DB-driven countries (with fallback to hardcoded while loading)
  const { data: dbCountries } = useActiveCountries();

  const currentCountry = params.country ?? "in";
  const currentLang = params.lang ?? "en";

  // Derive active module from pathname
  const currentModule =
    CMS_MODULES.find(({ id }) => pathname.endsWith(`/${id}`))?.id ?? "homepage";

  // Build country list from DB (fallback: hardcoded config)
  const countryList: Array<{ id: string; name: string; iso2: string; defaultLang: string }> =
    dbCountries && dbCountries.length > 0
      ? dbCountries.map((c: CountryRow) => ({
          id: c.id,
          name: c.name,
          iso2: c.iso_alpha2,
          defaultLang: c.default_language_id,
        }))
      : Object.values(COUNTRIES).map((c) => ({
          id: c.id,
          name: c.name,
          iso2: c.iso,
          defaultLang: c.defaultLang,
        }));

  // Languages for current country
  const currentCountryCfg = COUNTRIES[currentCountry as CountryCode];
  const dbCountryCfg = dbCountries?.find((c: CountryRow) => c.id === currentCountry);
  // For language list: use hardcoded config if available, else show just current lang
  const supportedLangs: string[] = currentCountryCfg?.supportedLangs
    ? [...currentCountryCfg.supportedLangs]
    : [currentLang];

  function goTo(country: string, lang: string, mod: string) {
    router.push(`/admin/cms/${country}/${lang}/${mod}`);
  }

  return (
    <div className="space-y-0 rounded-lg border bg-card shadow-sm">
      {/* ── Level 1: Country navigation ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b px-4 py-3">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Country
        </span>
        {countryList.map((c) => {
          const isActive = c.id === currentCountry;
          return (
            <button
              key={c.id}
              onClick={() => goTo(c.id, c.defaultLang, currentModule)}
              onMouseEnter={() => router.prefetch(`/admin/cms/${c.id}/${c.defaultLang}/${currentModule}`)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
              title={c.name}
            >
              <CountryFlag iso2={c.iso2} />
              <span>{c.name}</span>
            </button>
          );
        })}
        {/* Manage countries link */}
        <Link
          href="/admin/cms/countries"
          className="ml-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Manage countries"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Manage</span>
        </Link>
      </div>

      {/* ── Level 2: Language tabs ───────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b bg-muted/30 px-4 py-2">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Language
        </span>
        {supportedLangs.map((lang) => {
          const langCfg = LANGUAGES[lang as LanguageCode];
          const isActive = lang === currentLang;
          const isDefault =
            (dbCountryCfg?.default_language_id ?? currentCountryCfg?.defaultLang) === lang;
          return (
            <button
              key={lang}
              onClick={() => goTo(currentCountry, lang, currentModule)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <span>{langCfg?.nativeName ?? lang}</span>
              <span className="text-xs opacity-60">{(langCfg?.bcp47 ?? lang).toUpperCase()}</span>
              {isDefault && (
                <span className="rounded bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                  DEFAULT
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Level 3: Module tabs ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1 px-4 py-2">
        {CMS_MODULES.map(({ id, label }) => {
          const isActive = id === currentModule;
          return (
            <button
              key={id}
              onClick={() => goTo(currentCountry, currentLang, id)}
              onMouseEnter={() =>
                router.prefetch(`/admin/cms/${currentCountry}/${currentLang}/${id}`)
              }
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </button>
          );
        })}
        {/* Context display */}
        <div className="ml-auto flex items-center gap-1 self-center rounded-md border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
          <CountryFlag
            iso2={countryList.find((c) => c.id === currentCountry)?.iso2 ?? "UN"}
            className="h-3.5 w-4"
          />
          <span>
            {countryList.find((c) => c.id === currentCountry)?.name ?? currentCountry}
          </span>
          <span className="opacity-40">/</span>
          <span>{LANGUAGES[currentLang as LanguageCode]?.nativeName ?? currentLang}</span>
        </div>
      </div>
    </div>
  );
}
