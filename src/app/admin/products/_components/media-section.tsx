"use client";

import { GripVertical, ImageIcon, Star, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAdminAssignImageToVariant,
  useAdminReorderImages,
  useAdminUpdateImageAltText,
  useDeleteProductImage,
  useUploadProductImage,
} from "@/features/admin/hooks/use-admin-products";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/types";
import type { AdminVariant } from "../catalog-utils";

interface Props {
  productId: string;
  images: ProductImage[];
  variants?: AdminVariant[];
}

export function MediaSection({ productId, images, variants = [] }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [editingAlt, setEditingAlt] = useState<string | null>(null);
  const [altValues, setAltValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { mutate: upload, isPending: isUploading, variables: uploadingFile } = useUploadProductImage();
  const { mutate: deleteImage, isPending: isDeleting } = useDeleteProductImage();
  const { mutate: reorder } = useAdminReorderImages();
  const { mutate: updateAlt } = useAdminUpdateImageAltText();
  const { mutate: assignVariant } = useAdminAssignImageToVariant();

  // ── Drag-to-reorder ─────────────────────────────────────────────────────────

  const sorted = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  function handleDragEnd() {
    if (dragIdx === null || dropIdx === null || dragIdx === dropIdx) {
      setDragIdx(null);
      setDropIdx(null);
      return;
    }
    const reordered = [...sorted];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    const updates = reordered.map((img, i) => ({
      id: img.id,
      sort_order: i,
      is_primary: i === 0,
    }));
    reorder({ productId, updates });
    setDragIdx(null);
    setDropIdx(null);
  }

  // ── Alt text ────────────────────────────────────────────────────────────────

  function saveAlt(imageId: string) {
    const alt = altValues[imageId];
    if (alt !== undefined) {
      updateAlt({ imageId, altText: alt, productId });
    }
    setEditingAlt(null);
  }

  // ── Upload ──────────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      upload({ productId, file });
      e.target.value = "";
    }
  }

  const onDropZone = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("image/")) {
        upload({ productId, file });
      }
    },
    [productId, upload],
  );

  return (
    <div className="space-y-6">
      {/* Upload zone */}
      <Card>
        <CardHeader>
          <CardTitle>Product Images</CardTitle>
          <CardDescription>
            Drag images to reorder. The first image is the primary image shown in listings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
              "border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/30",
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropZone}
          >
            <div className="rounded-full bg-muted p-3">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {isUploading ? "Uploading…" : "Drop image or click to upload"}
            </p>
            <p className="text-xs text-muted-foreground">JPEG, PNG, WebP — max 5MB</p>
            {isUploading && uploadingFile && (
              <p className="text-xs text-primary animate-pulse">
                Uploading {(uploadingFile as { file: File }).file?.name}…
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Image grid */}
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-40" />
              <p className="text-sm">No images yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sorted.map((img, idx) => (
                <div
                  key={img.id}
                  className={cn(
                    "group relative rounded-lg border overflow-hidden bg-muted/30",
                    dragIdx === idx && "opacity-40 scale-95",
                    dropIdx === idx && "ring-2 ring-primary",
                  )}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragEnter={() => setDropIdx(idx)}
                  onDragEnd={handleDragEnd}
                >
                  {/* Image */}
                  <div className="relative aspect-square">
                    <Image
                      src={img.url}
                      alt={img.alt_text ?? ""}
                      fill
                      className="object-cover"
                      sizes="200px"
                    />
                    {/* Overlay actions */}
                    <div className="absolute inset-0 flex flex-col justify-between p-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                      <div className="flex items-center justify-between">
                        <GripVertical className="h-4 w-4 text-white drop-shadow cursor-grab active:cursor-grabbing" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 bg-black/40 text-white hover:bg-red-500/80"
                          onClick={() => deleteImage({ imageId: img.id, url: img.url })}
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        {img.is_primary && (
                          <Badge className="text-[10px] py-0 px-1.5 bg-amber-500 text-white border-none">
                            <Star className="mr-0.5 h-2.5 w-2.5" />
                            Primary
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Alt text */}
                  <div className="p-2 space-y-1">
                    {editingAlt === img.id ? (
                      <Input
                        autoFocus
                        size={1}
                        className="h-6 text-xs"
                        value={altValues[img.id] ?? img.alt_text ?? ""}
                        onChange={(e) =>
                          setAltValues((prev) => ({ ...prev, [img.id]: e.target.value }))
                        }
                        onBlur={() => saveAlt(img.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveAlt(img.id);
                          if (e.key === "Escape") setEditingAlt(null);
                        }}
                      />
                    ) : (
                      <p
                        className="text-[10px] text-muted-foreground truncate cursor-text hover:text-foreground"
                        onClick={() => {
                          setEditingAlt(img.id);
                          setAltValues((prev) => ({ ...prev, [img.id]: img.alt_text ?? "" }));
                        }}
                        title="Click to edit alt text"
                      >
                        {img.alt_text ?? <span className="italic opacity-50">Add alt text</span>}
                      </p>
                    )}

                    {/* Variant assignment */}
                    {variants.length > 0 && (
                      <select
                        className="w-full rounded border bg-background px-1 py-0.5 text-[10px] text-muted-foreground"
                        value={(img as ProductImage & { variant_id?: string | null }).variant_id ?? ""}
                        onChange={(e) =>
                          assignVariant({
                            imageId: img.id,
                            variantId: e.target.value || null,
                            productId,
                          })
                        }
                      >
                        <option value="">No variant</option>
                        {variants.map((v) => {
                          const opts = (v.options ?? {}) as Record<string, string>;
                          const label = [opts.color, opts.size].filter(Boolean).join(" / ") || v.name;
                          return (
                            <option key={v.id} value={v.id}>{label}</option>
                          );
                        })}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
