"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Menu, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PermissionGate } from "@/components/admin/permission-gate";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useDeleteNavigationMenu,
  useNavigationMenus,
  useUpsertNavigationMenu,
} from "@/features/cms/hooks/use-localized-cms";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { toLocaleId, type CountryCode, type LanguageCode } from "@/lib/i18n/config";
import type { CmsNavigationMenu } from "@/types";

const menuSchema = z.object({
  name:   z.string().min(2),
  handle: z.string().min(2).regex(/^[a-z0-9-]+$/, "Handle: lowercase, numbers, hyphens only"),
});
type MenuFormData = z.infer<typeof menuSchema>;

export default function AdminNavigationModulePage() {
  const params   = useParams<{ country: CountryCode; lang: LanguageCode }>();
  const country  = params.country;
  const lang     = params.lang;
  const localeId = toLocaleId(country, lang);

  const { data: menus = [], isLoading } = useNavigationMenus(localeId);
  const { mutate: upsertMenu, isPending }         = useUpsertNavigationMenu();
  const { mutate: deleteMenu, isPending: isDeleting } = useDeleteNavigationMenu();

  const [editItem, setEditItem]         = useState<CmsNavigationMenu | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MenuFormData>({
    resolver: zodResolver(menuSchema),
  });

  const openCreate = () => { reset({}); setEditItem(null); setIsDialogOpen(true); };
  const openEdit   = (menu: CmsNavigationMenu) => {
    setEditItem(menu);
    reset({ name: menu.name, handle: menu.handle });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: MenuFormData) => {
    upsertMenu(
      { ...data, ...(editItem ? { id: editItem.id } : {}), locale_id: localeId },
      { onSuccess: () => setIsDialogOpen(false) },
    );
  };

  if (isLoading) return <LoadingState text="Loading navigation menus…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Navigation Menus"
          description={`Locale-aware menus for ${localeId}`}
        />
        <PermissionGate permission={PERMISSIONS.CMS_MANAGE_NAVIGATION}>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Menu
          </Button>
        </PermissionGate>
      </div>

      {menus.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Menu className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No navigation menus for {localeId}.</p>
          <PermissionGate permission={PERMISSIONS.CMS_MANAGE_NAVIGATION}>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Create first menu
            </Button>
          </PermissionGate>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {menus.map((menu) => (
            <Card key={menu.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{menu.name}</CardTitle>
                  <Badge variant={menu.is_active ? "success" : "secondary"} className="shrink-0 text-xs">
                    {menu.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <code className="text-xs text-muted-foreground">handle: {menu.handle}</code>
              </CardHeader>
              <CardContent>
                <PermissionGate permission={PERMISSIONS.CMS_MANAGE_NAVIGATION}>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(menu)}>Edit Menu</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(menu.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </PermissionGate>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? `Edit: ${editItem.name}` : "New Navigation Menu"}
              <Badge variant="outline" className="ml-2 font-mono text-xs font-normal">{localeId}</Badge>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Menu Name" required error={errors.name} {...register("name")} />
            <FormField
              label="Handle"
              required
              error={errors.handle}
              description="Used in templates: e.g. main-nav, footer-links"
              {...register("handle")}
              disabled={!!editItem}
            />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isPending}>Save Menu</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Menu"
        description="This navigation menu and all its items will be permanently deleted."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteMenu(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
