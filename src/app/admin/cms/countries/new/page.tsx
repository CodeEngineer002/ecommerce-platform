"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAddCountry, useAllLanguages } from "@/features/admin/hooks/use-country-management";

const schema = z.object({
  id: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[a-z]+$/, "Lowercase letters only, e.g. jp, br, au"),
  name: z.string().min(2),
  native_name: z.string().min(2),
  iso_alpha2: z
    .string()
    .length(2)
    .regex(/^[A-Za-z]+$/, "2-letter ISO code, e.g. JP"),
  iso_alpha3: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]+$/, "3-letter ISO code, e.g. JPN"),
  default_language_id: z.string().min(2),
  fallback_language_id: z.string().min(2),
  currency_code: z
    .string()
    .length(3)
    .regex(/^[A-Za-z]+$/, "3-letter code, e.g. JPY"),
  timezone: z.string().min(3),
  sort_order: z.coerce.number().int().min(0).default(99),
  extra_language_ids: z.array(z.string()).default([]),
});

type FormData = z.infer<typeof schema>;

// Common timezones for the dropdown
const COMMON_TIMEZONES = [
  "Africa/Cairo",
  "America/Chicago",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Calcutta",
  "Asia/Dubai",
  "Asia/Jakarta",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Moscow",
  "Europe/Paris",
  "Europe/Rome",
  "Pacific/Auckland",
  "UTC",
];

export default function AddCountryPage() {
  const router = useRouter();
  const { data: languages = [] } = useAllLanguages();
  const { mutate: addCountry, isPending } = useAddCountry();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      sort_order: 99,
      extra_language_ids: [],
      fallback_language_id: "en",
    },
  });

  const extraLangs = watch("extra_language_ids");
  const defaultLang = watch("default_language_id");

  function onSubmit(data: FormData) {
    addCountry(data, {
      onSuccess: () => router.push("/admin/cms/countries"),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/cms/countries">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Add New Country"
          description="Configure a new storefront country with its languages and settings"
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Country Identity</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Country ID"
              hint="Short lowercase key, e.g. jp, br, au"
              error={errors.id?.message}
            >
              <input
                {...register("id")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="jp"
              />
            </FormField>
            <FormField label="Sort Order" error={errors.sort_order?.message}>
              <input
                {...register("sort_order")}
                type="number"
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="99"
              />
            </FormField>
            <FormField label="English Name" error={errors.name?.message}>
              <input
                {...register("name")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Japan"
              />
            </FormField>
            <FormField
              label="Native Name"
              hint="Name in local language"
              error={errors.native_name?.message}
            >
              <input
                {...register("native_name")}
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="日本"
              />
            </FormField>
            <FormField
              label="ISO Alpha-2"
              hint="2-letter code from ISO 3166-1, e.g. JP"
              error={errors.iso_alpha2?.message}
            >
              <input
                {...register("iso_alpha2")}
                className="w-full rounded-md border px-3 py-2 text-sm uppercase"
                placeholder="JP"
                maxLength={2}
              />
            </FormField>
            <FormField
              label="ISO Alpha-3"
              hint="3-letter code from ISO 3166-1, e.g. JPN"
              error={errors.iso_alpha3?.message}
            >
              <input
                {...register("iso_alpha3")}
                className="w-full rounded-md border px-3 py-2 text-sm uppercase"
                placeholder="JPN"
                maxLength={3}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Currency & Timezone</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Currency Code"
              hint="3-letter ISO 4217 code, e.g. JPY"
              error={errors.currency_code?.message}
            >
              <input
                {...register("currency_code")}
                className="w-full rounded-md border px-3 py-2 text-sm uppercase"
                placeholder="JPY"
                maxLength={3}
              />
            </FormField>
            <FormField label="Timezone" error={errors.timezone?.message}>
              <select
                {...register("timezone")}
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">Select timezone…</option>
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Languages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Default Language"
                hint="Primary language for this country"
                error={errors.default_language_id?.message}
              >
                <select
                  {...register("default_language_id")}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select language…</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.native_name} ({lang.id.toUpperCase()})
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Fallback Language"
                hint="Used when default language content is missing"
                error={errors.fallback_language_id?.message}
              >
                <select
                  {...register("fallback_language_id")}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                >
                  <option value="">Select language…</option>
                  {languages.map((lang) => (
                    <option key={lang.id} value={lang.id}>
                      {lang.native_name} ({lang.id.toUpperCase()})
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">
                Additional Languages
              </Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {languages
                  .filter((l) => l.id !== defaultLang)
                  .map((lang) => {
                    const checked = extraLangs.includes(lang.id);
                    return (
                      <label
                        key={lang.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            if (v) {
                              setValue("extra_language_ids", [
                                ...extraLangs,
                                lang.id,
                              ]);
                            } else {
                              setValue(
                                "extra_language_ids",
                                extraLangs.filter((x) => x !== lang.id)
                              );
                            }
                          }}
                        />
                        <div>
                          <p className="text-sm font-medium">
                            {lang.native_name}
                          </p>
                          <p className="text-xs uppercase text-muted-foreground">
                            {lang.id}
                          </p>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/cms/countries">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add Country"}
          </Button>
        </div>
      </form>
    </div>
  );
}
