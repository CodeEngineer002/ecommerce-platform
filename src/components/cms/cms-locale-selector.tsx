"use client";

import { Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CmsLocale } from "@/hooks/use-cms-locale";
import { COUNTRIES, LANGUAGES, COUNTRY_CODES, type CountryCode, type LanguageCode } from "@/lib/i18n/config";

interface CmsLocaleSelectorProps {
  locale: CmsLocale;
  onCountryChange: (country: CountryCode) => void;
  onLanguageChange: (lang: LanguageCode) => void;
  supportedLanguages: readonly LanguageCode[];
}

export function CmsLocaleSelector({
  locale,
  onCountryChange,
  onLanguageChange,
  supportedLanguages,
}: CmsLocaleSelectorProps) {
  const countryConfig = COUNTRIES[locale.country];
  const langConfig = LANGUAGES[locale.lang];

  return (
    <div className="flex items-center gap-2">
      {/* Country selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Globe className="h-3.5 w-3.5" />
            <span className="font-medium">{countryConfig.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Select Country</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {COUNTRY_CODES.map((code) => (
            <DropdownMenuItem
              key={code}
              className={locale.country === code ? "bg-accent" : ""}
              onSelect={() => onCountryChange(code)}
            >
              <span className="mr-2">{COUNTRIES[code].nativeName}</span>
              <span className="ml-auto text-xs text-muted-foreground">{COUNTRIES[code].currency}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Language selector — filtered to country's supported langs */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <span className="font-medium">{langConfig.nativeName}</span>
            <span className="text-xs text-muted-foreground uppercase">{langConfig.bcp47}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuLabel>Select Language</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {supportedLanguages.map((lang) => (
              <DropdownMenuItem
                key={lang}
                className={locale.lang === lang ? "bg-accent" : ""}
                onSelect={() => onLanguageChange(lang)}
              >
                <span className="mr-2">{LANGUAGES[lang].nativeName}</span>
                {COUNTRIES[locale.country].defaultLang === lang && (
                  <Badge variant="secondary" className="ml-auto text-[10px]">default</Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Active locale pill */}
      <Badge variant="outline" className="font-mono text-xs">
        {locale.localeId}
      </Badge>
    </div>
  );
}
