"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";

import { queryKeys } from "@/lib/query-keys";
import type { ProductFormData } from "@/lib/validators";

import {
  adminCreateProduct,
  adminDeleteProduct,
  adminGetProduct,
  adminGetProducts,
  adminUpdateInventory,
  adminUpdateProduct,
  deleteProductImage,
  uploadProductImage,
} from "../services/admin-product.service";

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
