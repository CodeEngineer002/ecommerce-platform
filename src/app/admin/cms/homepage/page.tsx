"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PermissionGate } from "@/components/admin/permission-gate";
import { CmsLocaleSelector } from "@/components/cms/cms-locale-selector";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useDeleteHomepageSection,
  useLocalizedHomepageSections,
  useUpsertHomepageSection,
} from "@/features/cms/hooks/use-localized-cms";
import { useCmsLocale } from "@/hooks/use-cms-locale";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { COUNTRIES } from "@/lib/i18n/config";
import type { LocalizedHomepageSection, SectionType } from "@/types";

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero_banner:       "Hero Banner",
  featured_products: "Featured Products",
  promotional_banner:"Promotional Banner",
  category_grid:     "Category Grid",
  testimonials:      "Testimonials",
  newsletter:        "Newsletter",
};

const sectionSchema = z.object({
  type:      z.string().min(1),
  title:     z.string().optional(),
  subtitle:  z.string().optional(),
  is_active: z.boolean().default(true),
});

type SectionFormData = z.infer<typeof sectionSchema>;

export default function AdminHomepagePage() {
  const { locale, setCountry, setLanguage, supportedLanguages } = useCmsLocale();
  const { data: sections = [], isLoading } = useLocalizedHomepageSections(locale.country, locale.lang);
  const { mutate: upsertSection, isPending } = useUpsertHomepageSection();
  const { mutate: deleteSection, isPending: isDeleting } = useDeleteHomepageSection();

  const [editItem, setEditItem] = useState<LocalizedHomepageSection | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<SectionType>("hero_banner");

  const { register, handleSubmit, reset } = useForm<SectionFormData>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { type: "hero_banner", is_active: true },
  });

  const openCreate = () => {
    reset({ type: "hero_banner", is_active: true });
    setEditItem(null);
    setSelectedType("hero_banner");
    setIsDialogOpen(true);
  };

  const openEdit = (section: LocalizedHomepageSection) => {
    setEditItem(section);
    setSelectedType(section.type as SectionType);
    reset({ type: section.type, title: section.title ?? "", subtitle: section.subtitle ?? "", is_active: section.is_active });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: SectionFormData) => {
    const countryIso = COUNTRIES[locale.country].iso.toLowerCase();
    upsertSection(
      {
        ...data,
        type: data.type as SectionType,
        ...(editItem ? { id: editItem.id } : {}),
        locale_id:   locale.localeId,
        country_id:  countryIso,
        language_id: locale.lang,
        sort_order:  editItem?.sort_order ?? sections.length,
      },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  if (isLoading) return <LoadingState text="Loading homepage sections…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Homepage Sections"
          description={`${sections.length} section${sections.length !== 1 ? "s" : ""} for ${locale.localeId}`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <CmsLocaleSelector
            locale={locale}
            onCountryChange={setCountry}
            onLanguageChange={setLanguage}
            supportedLanguages={supportedLanguages}
          />
          <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
            <Button onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add Section
            </Button>
          </PermissionGate>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No homepage sections for {locale.localeId}.</p>
          <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add first section
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <Card key={section.id} className="flex items-center gap-4 p-4">
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {SECTION_TYPE_LABELS[section.type as SectionType] ?? section.type}
                  </span>
                  <Badge variant={section.is_active ? "success" : "secondary"} className="text-xs">
                    {section.is_active ? "Visible" : "Hidden"}
                  </Badge>
                </div>
                {section.title && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{section.title}</p>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                #{idx + 1}
              </div>
              <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(section)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(section.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </PermissionGate>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? "Edit Section" : "Add Section"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">
                {locale.localeId}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Section Type *</label>
              <Select
                value={selectedType}
                onValueChange={(v) => setSelectedType(v as SectionType)}
                disabled={!!editItem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SECTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" {...register("type")} value={selectedType} />
            </div>
            <FormField label="Heading / Title" {...register("title")} />
            <FormField label="Subtitle" {...register("subtitle")} />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="section_active" className="rounded" {...register("is_active")} />
              <label htmlFor="section_active" className="text-sm font-medium">Visible on storefront</label>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>Save Section</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Section"
        description="This homepage section will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteSection(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
