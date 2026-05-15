"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Calendar, Megaphone, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PermissionGate } from "@/components/admin/permission-gate";
import { InheritanceBadge } from "@/components/cms/inheritance-badge";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useDeleteBanner,
  useBanners,
  useUpsertBanner,
} from "@/features/cms/hooks/use-localized-cms";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import type { CmsBanner } from "@/types";

const bannerSchema = z.object({
  handle:           z.string().min(2).regex(/^[a-z0-9-]+$/, "Handle: lowercase, numbers, hyphens only"),
  title:            z.string().optional(),
  subtitle:         z.string().optional(),
  image_url:        z.string().url("Must be a valid URL").optional().or(z.literal("")),
  cta_text:         z.string().optional(),
  cta_url:          z.string().optional(),
  cta_open_new_tab: z.boolean().default(false),
  valid_from:       z.string().optional(),
  valid_until:      z.string().optional(),
  is_active:        z.boolean().default(true),
});
type BannerFormData = z.infer<typeof bannerSchema>;

export default function AdminBannersModulePage() {
  const params   = useParams<{ country: CountryCode; lang: LanguageCode }>();
  const country  = params.country;
  const lang     = params.lang;
  const localeId = toLocaleId(country, lang);

  const { data: banners = [], isLoading, refetch } = useBanners(localeId);
  const { mutate: upsertBanner, isPending }         = useUpsertBanner();
  const { mutate: deleteBanner, isPending: isDeleting } = useDeleteBanner();

  const [editItem, setEditItem]         = useState<CmsBanner | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BannerFormData>({
    resolver: zodResolver(bannerSchema),
    defaultValues: { is_active: true, cta_open_new_tab: false },
  });

  const openCreate = () => {
    reset({ is_active: true, cta_open_new_tab: false });
    setEditItem(null);
    setIsDialogOpen(true);
  };

  const openEdit = (banner: CmsBanner) => {
    setEditItem(banner);
    reset({
      handle:           banner.handle,
      title:            banner.title ?? "",
      subtitle:         banner.subtitle ?? "",
      image_url:        banner.image_url ?? "",
      cta_text:         banner.cta_text ?? "",
      cta_url:          banner.cta_url ?? "",
      cta_open_new_tab: banner.cta_open_new_tab,
      valid_from:       banner.valid_from ? banner.valid_from.slice(0, 16) : "",
      valid_until:      banner.valid_until ? banner.valid_until.slice(0, 16) : "",
      is_active:        banner.is_active,
    });
    setIsDialogOpen(true);
  };

  const isBannerActive = (banner: CmsBanner) => {
    if (!banner.is_active) return false;
    const now = new Date();
    if (banner.valid_from && new Date(banner.valid_from) > now) return false;
    if (banner.valid_until && new Date(banner.valid_until) < now) return false;
    return true;
  };

  const onSubmit = (data: BannerFormData) => {
    upsertBanner(
      {
        handle:           data.handle,
        title:            data.title ?? null,
        subtitle:         data.subtitle ?? null,
        image_url:        data.image_url || null,
        cta_text:         data.cta_text ?? null,
        cta_url:          data.cta_url ?? null,
        cta_open_new_tab: data.cta_open_new_tab,
        valid_from:       data.valid_from ? new Date(data.valid_from).toISOString() : null,
        valid_until:      data.valid_until ? new Date(data.valid_until).toISOString() : null,
        is_active:        data.is_active,
        background_color: editItem?.background_color ?? null,
        text_color:       editItem?.text_color ?? null,
        ...(editItem ? { id: editItem.id } : {}),
        locale_id:        localeId,
        sort_order:       editItem?.sort_order ?? banners.length,
      },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  if (isLoading) return <LoadingState text="Loading banners…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Banners"
          description={`Time-bound promotional banners for ${localeId}`}
        />
        <PermissionGate permission={PERMISSIONS.CMS_MANAGE_BANNERS}>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Banner
          </Button>
        </PermissionGate>
      </div>

      {banners.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Megaphone className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No banners for {localeId}.</p>
          <PermissionGate permission={PERMISSIONS.CMS_MANAGE_BANNERS}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Create first banner
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {banners.map((banner) => {
            const live = isBannerActive(banner);
            return (
              <Card key={banner.id}>
                {banner.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={banner.image_url}
                    alt={banner.title ?? "Banner"}
                    className="h-28 w-full rounded-t-lg object-cover"
                  />
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{banner.title ?? banner.handle}</CardTitle>
                    <Badge variant={live ? "success" : "secondary"} className="shrink-0 text-xs">
                      {live ? "Live" : "Inactive"}
                    </Badge>
                  </div>
                  {(banner.valid_from || banner.valid_until) && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {banner.valid_from ? new Date(banner.valid_from).toLocaleDateString() : "∞"}
                      {" → "}
                      {banner.valid_until ? new Date(banner.valid_until).toLocaleDateString() : "∞"}
                    </p>
                  )}
                  <InheritanceBadge
                    scopeType={(banner as Record<string, unknown>).scope_type as "country" | "locale" | null}
                    overrideStatus={(banner as Record<string, unknown>).override_status as "inherited" | "overridden" | "detached" | null}
                    inheritsFromId={(banner as Record<string, unknown>).inherits_from_id as string | null}
                    module="banners"
                    country={country}
                    lang={lang}
                    contentId={banner.id}
                    onChanged={() => refetch()}
                  />
                </CardHeader>
                <CardContent>
                  <PermissionGate permission={PERMISSIONS.CMS_MANAGE_BANNERS}>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(banner)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(banner.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </PermissionGate>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editItem ? `Edit Banner: ${editItem.handle}` : "New Banner"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">{localeId}</Badge>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Handle"
                required
                error={errors.handle}
                description="Unique banner identifier"
                {...register("handle")}
                disabled={!!editItem}
              />
              <FormField label="Title" {...register("title")} />
            </div>
            <FormField label="Subtitle" {...register("subtitle")} />
            <FormField label="Image URL" error={errors.image_url} {...register("image_url")} />
            <div className="grid grid-cols-2 gap-4">
              <FormField label="CTA Text" {...register("cta_text")} />
              <FormField label="CTA URL" {...register("cta_url")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Valid From</label>
                <input type="datetime-local" className="w-full rounded-md border px-3 py-2 text-sm" {...register("valid_from")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Valid Until</label>
                <input type="datetime-local" className="w-full rounded-md border px-3 py-2 text-sm" {...register("valid_until")} />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="banner_active" className="rounded" {...register("is_active")} />
                <label htmlFor="banner_active" className="text-sm font-medium">Active</label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="cta_new_tab" className="rounded" {...register("cta_open_new_tab")} />
                <label htmlFor="cta_new_tab" className="text-sm font-medium">Open CTA in new tab</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>Save Banner</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Banner"
        description="This banner will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteBanner(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
