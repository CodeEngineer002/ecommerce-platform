"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import { queryKeys } from "@/lib/query-keys";
import type { ProductFormData } from "@/lib/validators";

import {
  adminArchiveProduct,
  adminAssignImageToVariant,
  adminCreateProduct,
  adminCreateVariant,
  adminDeleteProduct,
  adminDeleteVariant,
  adminDuplicateProduct,
  adminGetProduct,
  adminGetProducts,
  adminReorderImages,
  adminUpdateImageAltText,
  adminUpdateInventory,
  adminUpdateProduct,
  adminUpdateVariant,
  deleteProductImage,
  uploadProductImage,
} from "../services/admin-product.service";
import type { VariantFormData } from "@/lib/validators";

export const adminProductKeys = queryKeys.adminProducts;

export function useAdminProducts(page = 1) {
  return useQuery({
    queryKey: queryKeys.adminProducts.list(page),
    queryFn: () => adminGetProducts(page),
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useAdminProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.adminProducts.detail(id),
    queryFn: () => adminGetProduct(id),
    enabled: !!id,
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

export function useAdminCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductFormData) => adminCreateProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Product created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductFormData> }) =>
      adminUpdateProduct(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(id) });
      toast.success("Product updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminDeleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Product deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUploadProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) =>
      uploadProductImage(productId, file),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      toast.success("Image uploaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      imageId,
      url,
      productId: _productId,
    }: {
      imageId: string;
      url: string;
      productId: string;
    }) => deleteProductImage(imageId, url),
    onSuccess: (_, { productId }) => {
      // Invalidate product detail so image list refreshes
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      toast.success("Image deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUpdateInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      adminUpdateInventory(variantId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Inventory updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Variant mutations ─────────────────────────────────────────────────────────

export function useAdminCreateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId,
      variant,
    }: {
      productId: string;
      variant: Parameters<typeof adminCreateVariant>[1];
    }) => adminCreateVariant(productId, variant),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Variant created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUpdateVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      productId,
      data,
    }: {
      variantId: string;
      productId: string;
      data: Partial<VariantFormData>;
    }) => adminUpdateVariant(variantId, data),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Variant updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminDeleteVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      variantId,
      productId: _productId,
    }: {
      variantId: string;
      productId: string;
    }) => adminDeleteVariant(variantId),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Variant deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Product-level operations ──────────────────────────────────────────────────

export function useAdminDuplicateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminDuplicateProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Product duplicated as Draft");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminArchiveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminArchiveProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.all });
      toast.success("Product archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Image management mutations ────────────────────────────────────────────────

export function useAdminReorderImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      productId: _productId,
      updates,
    }: {
      productId: string;
      updates: Array<{ id: string; sort_order: number; is_primary: boolean }>;
    }) => adminReorderImages(updates),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminUpdateImageAltText() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      imageId,
      altText,
      productId: _productId,
    }: {
      imageId: string;
      altText: string;
      productId: string;
    }) => adminUpdateImageAltText(imageId, altText),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAdminAssignImageToVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      imageId,
      variantId,
      productId: _productId,
    }: {
      imageId: string;
      variantId: string | null;
      productId: string;
    }) => adminAssignImageToVariant(imageId, variantId),
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: adminProductKeys.detail(productId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
