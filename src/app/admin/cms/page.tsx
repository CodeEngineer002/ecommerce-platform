"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Eye, Plus, Trash2 } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDeleteLocalizedCmsPage,
  useLocalizedCmsPages,
  useUpsertLocalizedCmsPage,
} from "@/features/cms/hooks/use-localized-cms";
import { useCmsLocale } from "@/hooks/use-cms-locale";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { COUNTRIES } from "@/lib/i18n/config";
import { slugify } from "@/lib/utils";
import type { LocalizedCmsPage } from "@/types";

const pageFormSchema = z.object({
  title:     z.string().min(2, "Title must be at least 2 characters"),
  slug:      z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug: lowercase, numbers, hyphens only"),
  content:   z.string().optional(),
  seo_title: z.string().optional(),
  seo_desc:  z.string().optional(),
  is_active: z.boolean().default(true),
});

type PageFormData = z.infer<typeof pageFormSchema>;

export default function AdminCmsPage() {
  const { locale, setCountry, setLanguage, supportedLanguages } = useCmsLocale();
  const { data: pages = [], isLoading } = useLocalizedCmsPages(locale.country, locale.lang);
  const { mutate: upsertPage, isPending } = useUpsertLocalizedCmsPage();
  const { mutate: deletePage, isPending: isDeleting } = useDeleteLocalizedCmsPage();

  const [editItem, setEditItem] = useState<LocalizedCmsPage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"content" | "seo">("content");

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<PageFormData>({
    resolver: zodResolver(pageFormSchema),
  });

  const openCreate = () => {
    reset({ is_active: true });
    setEditItem(null);
    setActiveTab("content");
    setIsDialogOpen(true);
  };

  const openEdit = (page: LocalizedCmsPage) => {
    setEditItem(page);
    reset({
      title:     page.title,
      slug:      page.slug,
      content:   page.content ?? "",
      seo_title: page.seo_title ?? "",
      seo_desc:  page.seo_desc ?? "",
      is_active: page.is_active,
    });
    setActiveTab("content");
    setIsDialogOpen(true);
  };

  const onSubmit = (data: PageFormData) => {
    const countryIso = COUNTRIES[locale.country].iso.toLowerCase();
    upsertPage(
      {
        ...data,
        ...(editItem ? { id: editItem.id } : {}),
        locale_id:   locale.localeId,
        country_id:  countryIso,
        language_id: locale.lang,
      },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  const previewUrl = (page: LocalizedCmsPage) =>
    `/${locale.country}/${locale.lang}/pages/${page.slug}`;

  if (isLoading) return <LoadingState text="Loading pages…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="CMS Pages"
          description={`${pages.length} page${pages.length !== 1 ? "s" : ""} in ${locale.localeId}`}
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
              <Plus className="mr-1 h-4 w-4" /> New Page
            </Button>
          </PermissionGate>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No pages for {locale.localeId} yet.</p>
          <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Create first page
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <Card key={page.id} className="group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{page.title}</CardTitle>
                  <Badge variant={page.is_active ? "success" : "secondary"} className="shrink-0">
                    {page.is_active ? "Published" : "Draft"}
                  </Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">/{page.slug}</p>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
                    <Button variant="outline" size="sm" onClick={() => openEdit(page)}>
                      <Edit className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </PermissionGate>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    title="Preview"
                  >
                    <a href={previewUrl(page)} target="_blank" rel="noopener noreferrer">
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(page.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </PermissionGate>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editItem ? `Edit: ${editItem.title}` : "New Page"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">
                {locale.localeId}
              </Badge>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "content" | "seo")}>
              <TabsList>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="seo">SEO</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4 pt-2">
                <FormField
                  label="Title"
                  required
                  error={errors.title}
                  {...register("title", {
                    onChange: (e) =>
                      !editItem && setValue("slug", slugify(e.target.value)),
                  })}
                />
                <FormField
                  label="Slug"
                  required
                  error={errors.slug}
                  description={`URL: /${locale.country}/${locale.lang}/pages/{slug}`}
                  {...register("slug")}
                />
                <FormField
                  label="Content (HTML / Markdown)"
                  as="textarea"
                  rows={10}
                  {...register("content")}
                />
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    className="rounded"
                    {...register("is_active")}
                  />
                  <label htmlFor="is_active" className="text-sm font-medium">
                    <Eye className="mr-1 inline h-3.5 w-3.5" />
                    Published (visible on storefront)
                  </label>
                </div>
              </TabsContent>

              <TabsContent value="seo" className="space-y-4 pt-2">
                <FormField
                  label="SEO Title"
                  description="Overrides page title in search results"
                  {...register("seo_title")}
                />
                <FormField
                  label="Meta Description"
                  as="textarea"
                  rows={3}
                  description="Short summary shown in search results (150–160 characters)"
                  {...register("seo_desc")}
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <PermissionGate permission={PERMISSIONS.CMS_EDIT} fallback={
                <Button type="submit" disabled>No edit permission</Button>
              }>
                <Button type="submit" loading={isPending}>
                  {editItem ? "Save Changes" : "Create Page"}
                </Button>
              </PermissionGate>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Page"
        description="This page will be permanently deleted from this locale. Other locales are unaffected."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() =>
          deleteId && deletePage(deleteId, { onSuccess: () => setDeleteId(null) })
        }
      />
    </div>
  );
}
