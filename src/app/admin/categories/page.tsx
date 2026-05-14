"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { FormField } from "@/components/common/form-field";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCategories, categoryKeys } from "@/features/products/hooks/use-categories";
import { createClient } from "@/lib/supabase/client";
import { slugify } from "@/lib/utils";
import { categorySchema, type CategoryFormData } from "@/lib/validators";
import type { Category } from "@/types";

const columns = (
  onEdit: (cat: Category) => void,
  onDelete: (id: string) => void,
): ColumnDef<Category>[] => [
  {
    header: "Name",
    cell: (c) => <span className="font-medium">{c.name}</span>,
  },
  {
    header: "Slug",
    cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.slug}</span>,
  },
  {
    header: "Status",
    align: "center",
    cell: (c) => (
      <Badge variant={c.is_active ? "success" : "secondary"}>
        {c.is_active ? "Active" : "Draft"}
      </Badge>
    ),
  },
  {
    header: "Actions",
    align: "right",
    cell: (c) => (
      <>
        <Button variant="ghost" size="icon" onClick={() => onEdit(c)}>
          <Edit className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive"
          onClick={() => onDelete(c.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </>
    ),
  },
];

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
    reset({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? "",
      is_active: cat.is_active,
      sort_order: cat.sort_order,
    });
    setIsDialogOpen(true);
  };

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

      <DataTable
        columns={columns(openEdit, setDeleteId)}
        data={categories}
        keyFn={(c) => c.id}
        isLoading={isLoading}
        loadingText="Loading categories…"
        emptyTitle="No categories yet"
        emptyDescription="Create your first category to organize products."
      />

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
