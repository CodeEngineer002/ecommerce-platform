"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCmsPages, useDeleteCmsPage, useUpsertCmsPage } from "@/features/cms/hooks/use-cms";
import { slugify } from "@/lib/utils";
import type { CmsPage } from "@/types";

const pageFormSchema = z.object({
  title: z.string().min(2),
  slug: z.string().min(2),
  content: z.string().optional(),
  seo_title: z.string().optional(),
  seo_desc: z.string().optional(),
  is_active: z.boolean().default(true),
});

type PageFormData = z.infer<typeof pageFormSchema>;

export default function AdminCmsPage() {
  const { data: pages = [], isLoading } = useCmsPages();
  const { mutate: upsertPage, isPending } = useUpsertCmsPage();
  const { mutate: deletePage, isPending: isDeleting } = useDeleteCmsPage();
  const [editItem, setEditItem] = useState<CmsPage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<PageFormData>({
    resolver: zodResolver(pageFormSchema),
  });

  const openCreate = () => {
    reset({ is_active: true });
    setEditItem(null);
    setIsDialogOpen(true);
  };

  const openEdit = (page: CmsPage) => {
    setEditItem(page);
    reset({ title: page.title, slug: page.slug, content: page.content ?? "", seo_title: page.seo_title ?? "", seo_desc: page.seo_desc ?? "", is_active: page.is_active });
    setIsDialogOpen(true);
  };

  if (isLoading) return <LoadingState text="Loading pages…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CMS Pages"
        description="Manage static content pages"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Page
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pages.map((page) => (
          <Card key={page.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{page.title}</CardTitle>
                <Badge variant={page.is_active ? "success" : "secondary"}>
                  {page.is_active ? "Published" : "Draft"}
                </Badge>
              </div>
              <p className="font-mono text-xs text-muted-foreground">/{page.slug}</p>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(page)}>
                  <Edit className="mr-1 h-3 w-3" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setDeleteId(page.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Page" : "New Page"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((data) =>
              upsertPage(
                editItem ? { ...data, id: editItem.id } : data,
                { onSuccess: () => setIsDialogOpen(false) }
              )
            )}
            className="space-y-4"
          >
            <FormField
              label="Title"
              required
              error={errors.title}
              {...register("title", {
                onChange: (e) => !editItem && setValue("slug", slugify(e.target.value)),
              })}
            />
            <FormField label="Slug" required error={errors.slug} {...register("slug")} />
            <FormField label="Content (HTML/Markdown)" as="textarea" rows={8} {...register("content")} />
            <div className="grid grid-cols-2 gap-4">
              <FormField label="SEO Title" {...register("seo_title")} />
              <FormField label="Meta Description" {...register("seo_desc")} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>Save Page</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Page"
        description="This page will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deletePage(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
