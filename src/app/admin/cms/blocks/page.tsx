"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Code, Plus, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCmsBlocks,
  useDeleteCmsBlock,
  useUpsertCmsBlock,
} from "@/features/cms/hooks/use-localized-cms";
import { useCmsLocale } from "@/hooks/use-cms-locale";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { BLOCK_REGISTRY, BLOCK_TYPES, type BlockType } from "@/lib/cms/block-registry";
import type { CmsBlock } from "@/types";

const blockSchema = z.object({
  handle:   z.string().min(2).regex(/^[a-z0-9-]+$/, "Handle: lowercase, numbers, hyphens only"),
  type:     z.string().min(1),
  title:    z.string().optional(),
  content:  z.string().optional(),
  is_active: z.boolean().default(true),
});

type BlockFormData = z.infer<typeof blockSchema>;

export default function AdminBlocksPage() {
  const { locale, setCountry, setLanguage, supportedLanguages } = useCmsLocale();
  const { data: blocks = [], isLoading } = useCmsBlocks(locale.localeId);
  const { mutate: upsertBlock, isPending } = useUpsertCmsBlock();
  const { mutate: deleteBlock, isPending: isDeleting } = useDeleteCmsBlock();

  const [editItem, setEditItem] = useState<CmsBlock | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<BlockType>("rich_text");

  const { register, handleSubmit, reset, formState: { errors } } = useForm<BlockFormData>({
    resolver: zodResolver(blockSchema),
    defaultValues: { type: "rich_text", is_active: true },
  });

  const openCreate = () => {
    reset({ type: "rich_text", is_active: true });
    setEditItem(null);
    setSelectedType("rich_text");
    setIsDialogOpen(true);
  };

  const openEdit = (block: CmsBlock) => {
    setEditItem(block);
    setSelectedType(block.type as BlockType);
    reset({ handle: block.handle, type: block.type, title: block.title ?? "", content: block.content ?? "", is_active: block.is_active });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: BlockFormData) => {
    upsertBlock(
      {
        ...data,
        type: selectedType,
        ...(editItem ? { id: editItem.id } : {}),
        locale_id: locale.localeId,
      },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  if (isLoading) return <LoadingState text="Loading blocks…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Content Blocks"
          description={`Reusable locale-scoped blocks for ${locale.localeId}`}
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
              <Plus className="mr-1 h-4 w-4" /> New Block
            </Button>
          </PermissionGate>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Code className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No blocks for {locale.localeId} yet.</p>
          <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Create first block
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((block) => {
            const entry = BLOCK_REGISTRY[block.type as BlockType];
            return (
              <Card key={block.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{block.title ?? block.handle}</CardTitle>
                    <Badge variant={block.is_active ? "success" : "secondary"} className="shrink-0 text-xs">
                      {block.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{block.type}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">#{block.handle}</span>
                  </div>
                  {entry?.description && (
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  <PermissionGate permission={PERMISSIONS.CMS_EDIT}>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(block)}>Edit</Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(block.id)}
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
              {editItem ? `Edit Block: ${editItem.handle}` : "New Content Block"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">{locale.localeId}</Badge>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Handle"
                required
                error={errors.handle}
                description="Unique ID used in templates (e.g. hero-home-de)"
                {...register("handle")}
                disabled={!!editItem}
              />
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Block Type *</label>
                <Select
                  value={selectedType}
                  onValueChange={(v) => setSelectedType(v as BlockType)}
                  disabled={!!editItem}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOCK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {BLOCK_REGISTRY[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <FormField label="Title / Display Name" {...register("title")} />
            <FormField
              label="Content (HTML / Markdown)"
              as="textarea"
              rows={8}
              description="For json-rich-text blocks, paste JSON directly"
              {...register("content")}
            />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="block_active" className="rounded" {...register("is_active")} />
              <label htmlFor="block_active" className="text-sm font-medium">Active</label>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>Save Block</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Block"
        description="This block will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteBlock(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
