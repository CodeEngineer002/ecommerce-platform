"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GripVertical, ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";

import { PermissionGate } from "@/components/admin/permission-gate";
import { InheritanceBadge } from "@/components/cms/inheritance-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useDeleteHomepageSection,
  useLocalizedHomepageSections,
  useUpsertHomepageSection,
} from "@/features/cms/hooks/use-localized-cms";
import { uploadCmsImage } from "@/features/cms/services/cms.media";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { COUNTRIES, toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import type { LocalizedHomepageSection, SectionType } from "@/types";

const SECTION_TYPE_LABELS: Record<SectionType, string> = {
  hero_banner:        "Hero Banner",
  featured_products:  "Featured Products",
  promotional_banner: "Promotional Banner",
  category_grid:      "Category Grid",
  testimonials:       "Testimonials",
  newsletter:         "Newsletter",
};

interface PromoSlide {
  image_url: string;
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
}

interface HeroSlide {
  image_url: string;
  title: string;
  subtitle: string;
  badge: string;
  cta_text: string;
  cta_link: string;
}

const EMPTY_SLIDE: PromoSlide = { image_url: "", title: "", subtitle: "", cta_text: "", cta_link: "" };
const EMPTY_HERO_SLIDE: HeroSlide = { image_url: "", title: "", subtitle: "", badge: "", cta_text: "", cta_link: "" };

const sectionSchema = z.object({
  type:      z.string().min(1),
  title:     z.string().optional(),
  subtitle:  z.string().optional(),
  is_active: z.boolean().default(true),
  content:   z.record(z.unknown()).optional(),
});
type SectionFormData = z.infer<typeof sectionSchema>;

export default function AdminHomepageModulePage() {
  const params = useParams<{ country: CountryCode; lang: LanguageCode }>();
  const country = params.country;
  const lang    = params.lang;
  const localeId = toLocaleId(country, lang);

  const { data: sections = [], isLoading, refetch } = useLocalizedHomepageSections(country, lang);
  const { mutate: upsertSection, isPending }  = useUpsertHomepageSection();
  const { mutate: deleteSection, isPending: isDeleting } = useDeleteHomepageSection();

  const [editItem, setEditItem] = useState<LocalizedHomepageSection | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<SectionType>("hero_banner");
  const [slides, setSlides] = useState<PromoSlide[]>([]);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);
  const [heroUploadingIdx, setHeroUploadingIdx] = useState<number | null>(null);
  const heroFileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const { register, handleSubmit, reset, setValue } = useForm<SectionFormData>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { type: "hero_banner", is_active: true },
  });

  const openCreate = () => {
    reset({ type: "hero_banner", is_active: true });
    setEditItem(null);
    setSelectedType("hero_banner");
    setSlides([]);
    setHeroSlides([]);
    setIsDialogOpen(true);
  };

  const openEdit = (section: LocalizedHomepageSection) => {
    setEditItem(section);
    setSelectedType(section.type as SectionType);
    const raw = (section.content as Record<string, unknown> | null) ?? {};

    if (section.type === "hero_banner") {
      // Support new slides format + legacy single-image format
      const rawSlides = raw.slides as HeroSlide[] | undefined;
      if (rawSlides?.length) {
        setHeroSlides(rawSlides);
      } else if (raw.image_url || raw.title || raw.cta_text) {
        // Migrate legacy single-image to slide
        setHeroSlides([{
          image_url: (raw.image_url as string) ?? "",
          title:     (section.title as string) ?? "",
          subtitle:  (section.subtitle as string) ?? "",
          badge:     (raw.badge as string) ?? "",
          cta_text:  (raw.cta_text as string) ?? "",
          cta_link:  (raw.cta_link as string) ?? "",
        }]);
      } else {
        setHeroSlides([]);
      }
      setSlides([]);
    } else {
      setHeroSlides([]);
      const existingSlides = (raw.slides as PromoSlide[]) ?? [];
      setSlides(existingSlides);
    }

    reset({
      type:      section.type,
      title:     section.title ?? "",
      subtitle:  section.subtitle ?? "",
      is_active: section.is_active,
    });
    setIsDialogOpen(true);
  };

  const addSlide = () => setSlides((prev) => [...prev, { ...EMPTY_SLIDE }]);
  const removeSlide = (idx: number) => setSlides((prev) => prev.filter((_, i) => i !== idx));
  const updateSlide = (idx: number, field: keyof PromoSlide, value: string) =>
    setSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const addHeroSlide = () => setHeroSlides((prev) => [...prev, { ...EMPTY_HERO_SLIDE }]);
  const removeHeroSlide = (idx: number) => setHeroSlides((prev) => prev.filter((_, i) => i !== idx));
  const updateHeroSlide = (idx: number, field: keyof HeroSlide, value: string) =>
    setHeroSlides((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));

  const handleSlideImageUpload = async (idx: number, file: File) => {
    setUploadingIdx(idx);
    try {
      const url = await uploadCmsImage(file);
      updateSlide(idx, "image_url", url);
    } catch {
      toast.error("Image upload failed. Please try again.");
    } finally {
      setUploadingIdx(null);
    }
  };

  const handleHeroSlideImageUpload = async (idx: number, file: File) => {
    setHeroUploadingIdx(idx);
    try {
      const url = await uploadCmsImage(file);
      updateHeroSlide(idx, "image_url", url);
    } catch {
      toast.error("Image upload failed. Please try again.");
    } finally {
      setHeroUploadingIdx(null);
    }
  };

  const onSubmit = (data: SectionFormData) => {
    const countryIso = COUNTRIES[country].iso.toLowerCase();
    let content: Record<string, unknown> | undefined;
    if (data.type === "hero_banner") {
      content = { slides: heroSlides };
    } else if (data.type === "promotional_banner") {
      content = { slides };
    } else {
      content = (editItem?.content as Record<string, unknown>) ?? undefined;
    }
    upsertSection(
      {
        ...data,
        type: data.type as SectionType,
        ...(editItem ? { id: editItem.id } : {}),
        locale_id:   localeId,
        country_id:  countryIso,
        language_id: lang,
        sort_order:  editItem?.sort_order ?? sections.length,
        content,
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
          description={`${sections.length} section${sections.length !== 1 ? "s" : ""} for ${localeId}`}
        />
        <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> Add Section
          </Button>
        </PermissionGate>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No homepage sections for {localeId}.</p>
          <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add first section
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section, idx) => (
            <Card key={section.id} className="flex items-start gap-4 p-4">
              <GripVertical className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {SECTION_TYPE_LABELS[section.type as SectionType] ?? section.type}
                  </span>
                  <Badge variant={section.is_active ? "success" : "secondary"} className="text-xs">
                    {section.is_active ? "Visible" : "Hidden"}
                  </Badge>
                </div>
                {section.title && (
                  <p className="text-sm text-muted-foreground">{section.title}</p>
                )}
                {/* Inheritance status */}
                <InheritanceBadge
                  scopeType={(section as Record<string, unknown>).scope_type as "country" | "locale" | null}
                  overrideStatus={(section as Record<string, unknown>).override_status as "inherited" | "overridden" | "detached" | null}
                  inheritsFromId={(section as Record<string, unknown>).inherits_from_id as string | null}
                  module="homepage"
                  country={country}
                  lang={lang}
                  contentId={section.id}
                  onChanged={() => refetch()}
                />
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">#{idx + 1}</div>
              <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(section)}>Edit</Button>
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem ? "Edit Section" : "Add Section"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">{localeId}</Badge>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Section Type *</label>
              <Select
                value={selectedType}
                onValueChange={(v) => { setSelectedType(v as SectionType); setValue("type", v); }}
                disabled={!!editItem}
              >
                <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SECTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FormField label="Heading / Title" {...register("title")} />
            <FormField label="Subtitle" {...register("subtitle")} />

            {/* Hero Banner — Carousel Slides editor */}
            {selectedType === "hero_banner" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Hero Carousel Slides</p>
                  <Button type="button" variant="outline" size="sm" onClick={addHeroSlide}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Slide
                  </Button>
                </div>
                {heroSlides.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No slides yet. Add at least one slide to show the hero carousel.
                  </p>
                )}
                {heroSlides.map((slide, idx) => (
                  <div key={idx} className="relative space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Slide {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeHeroSlide(idx)}
                        className="text-destructive hover:text-destructive/80"
                        aria-label="Remove slide"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Image upload */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Slide Image</label>
                      <input
                        ref={(el) => { heroFileInputRefs.current[idx] = el; }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleHeroSlideImageUpload(idx, file);
                          e.target.value = "";
                        }}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={heroUploadingIdx === idx}
                          onClick={() => heroFileInputRefs.current[idx]?.click()}
                          className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {heroUploadingIdx === idx ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <ImagePlus className="h-3.5 w-3.5" />
                          )}
                          {heroUploadingIdx === idx ? "Uploading…" : "Upload Image"}
                        </button>
                        {slide.image_url && heroUploadingIdx !== idx && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={slide.image_url}
                            alt="Preview"
                            className="h-10 w-16 rounded border object-cover"
                          />
                        )}
                      </div>
                    </div>

                    {/* Badge */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Badge <span className="text-muted-foreground">(optional, e.g. "New")</span></label>
                      <input
                        className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="New Arrivals"
                        value={slide.badge}
                        onChange={(e) => updateHeroSlide(idx, "badge", e.target.value)}
                      />
                    </div>

                    {/* Title & Subtitle */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Title</label>
                        <input
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Slide title"
                          value={slide.title}
                          onChange={(e) => updateHeroSlide(idx, "title", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Subtitle</label>
                        <input
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Slide subtitle"
                          value={slide.subtitle}
                          onChange={(e) => updateHeroSlide(idx, "subtitle", e.target.value)}
                        />
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">CTA Button Text</label>
                        <input
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="Shop Now"
                          value={slide.cta_text}
                          onChange={(e) => updateHeroSlide(idx, "cta_text", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">CTA Link</label>
                        <input
                          className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          placeholder="/us/en/products"
                          value={slide.cta_link}
                          onChange={(e) => updateHeroSlide(idx, "cta_link", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Slides editor — only for promotional_banner */}
            {selectedType === "promotional_banner" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Carousel Slides</p>
                  <Button type="button" variant="outline" size="sm" onClick={addSlide}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Slide
                  </Button>
                </div>
                {slides.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No slides yet. Add at least one slide to show the carousel.
                  </p>
                )}
                {slides.map((slide, idx) => (
                  <div key={idx} className="relative space-y-2 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Slide {idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeSlide(idx)}
                        className="text-destructive hover:text-destructive/80"
                        aria-label="Remove slide"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Slide Image</label>
                        <input
                          ref={(el) => { fileInputRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleSlideImageUpload(idx, file);
                            e.target.value = "";
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={uploadingIdx === idx}
                            onClick={() => fileInputRefs.current[idx]?.click()}
                            className="flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {uploadingIdx === idx ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImagePlus className="h-3.5 w-3.5" />
                            )}
                            {uploadingIdx === idx ? "Uploading…" : "Upload Image"}
                          </button>
                          {slide.image_url && uploadingIdx !== idx && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={slide.image_url}
                              alt="Preview"
                              className="h-10 w-16 rounded border object-cover"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Title</label>
                          <input
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="Slide title"
                            value={slide.title}
                            onChange={(e) => updateSlide(idx, "title", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Subtitle</label>
                          <input
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="Slide subtitle"
                            value={slide.subtitle}
                            onChange={(e) => updateSlide(idx, "subtitle", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">CTA Button Text</label>
                          <input
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="Shop Now"
                            value={slide.cta_text}
                            onChange={(e) => updateSlide(idx, "cta_text", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">CTA Link</label>
                          <input
                            className="w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="/in/en/products"
                            value={slide.cta_link}
                            onChange={(e) => updateSlide(idx, "cta_link", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

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
