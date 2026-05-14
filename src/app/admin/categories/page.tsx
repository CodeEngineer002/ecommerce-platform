"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";

import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { categorySchema, type CategoryFormData } from "@/lib/validators";
import { slugify } from "@/lib/utils";
import { useCategories } from "@/features/products/hooks/use-categories";
import { createClient } from "@/lib/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { categoryKeys } from "@/features/products/hooks/use-categories";
import type { Category } from "@/types";

export default function AdminCategoriesPage() {
  const { data: categories = [], isLoading } = useCategories();
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { mutate: upsert, isPending } = useMutation({
    mutationFn: async (data: CategoryFormData & { id?: string }) => {
      const supabase = createClient();
      const { id, ...rest } = data;
      if (id) {
        return supabase.from("categories").update(rest).eq("id", id);
      }
      return supabase.from("categories").insert(rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.list() });
      setIsDialogOpen(false);
      setEditItem(null);
      toast.success("Category saved");
    },
  });

  const { mutate: deleteCategory, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      return supabase.from("categories").delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryKeys.list() });
      setDeleteId(null);
      toast.success("Category deleted");
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({ resolver: zodResolver(categorySchema) });

  const openCreate = () => {
    reset({ is_active: true, sort_order: 0 });
    setEditItem(null);
    setIsDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditItem(cat);
    reset({ name: cat.name, slug: cat.slug, description: cat.description ?? "", is_active: cat.is_active, sort_order: cat.sort_order });
    setIsDialogOpen(true);
  };

  if (isLoading) return <LoadingState text="Loading categories…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" /> New Category
          </Button>
        }
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Slug</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((cat) => (
              <tr key={cat.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{cat.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={cat.is_active ? "success" : "secondary"}>
                    {cat.is_active ? "Active" : "Draft"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(cat)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => setDeleteId(cat.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit/Create dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((data) =>
              upsert(editItem ? { ...data, id: editItem.id } : data)
            )}
            className="space-y-4"
          >
            <FormField
              label="Name"
              required
              error={errors.name}
              {...register("name", {
                onChange: (e) => !editItem && setValue("slug", slugify(e.target.value)),
              })}
            />
            <FormField label="Slug" required error={errors.slug} {...register("slug")} />
            <FormField label="Description" as="textarea" {...register("description")} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" type="button" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Category"
        description="Products in this category will not be deleted but will be uncategorized."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteCategory(deleteId)}
      />
    </div>
  );
}
