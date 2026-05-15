"use client";

import { FileImage, Trash2, UploadCloud } from "lucide-react";
import { useState } from "react";

import { PermissionGate } from "@/components/admin/permission-gate";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { PageHeader } from "@/components/common/page-header";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useDeleteMediaAsset, useMediaAssets } from "@/features/cms/hooks/use-localized-cms";
import { PERMISSIONS } from "@/lib/admin/permissions";
import type { MediaAsset } from "@/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminMediaPage() {
  const [search, setSearch] = useState("");
  const [mimeFilter, setMimeFilter] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const { data, isLoading } = useMediaAssets({
    search: search || undefined,
    mimeType: mimeFilter || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const { mutate: deleteAsset, isPending: isDeleting } = useDeleteMediaAsset();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaAsset | null>(null);

  const assets = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (isLoading) return <LoadingState text="Loading media assets…" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Media Library"
          description={`${totalCount} asset${totalCount !== 1 ? "s" : ""}`}
        />
        <PermissionGate permission={PERMISSIONS.CMS_MANAGE_MEDIA}>
          <Button>
            <UploadCloud className="mr-1 h-4 w-4" /> Upload
          </Button>
        </PermissionGate>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Search by filename…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <select
          value={mimeFilter}
          onChange={(e) => { setMimeFilter(e.target.value); setPage(1); }}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          <option value="image/">Images</option>
          <option value="video/">Videos</option>
          <option value="application/pdf">PDFs</option>
        </select>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileImage className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">No media assets found.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {assets.map((asset) => {
              const isImage = asset.mime_type.startsWith("image/");
              return (
                <Card
                  key={asset.id}
                  className="group cursor-pointer overflow-hidden"
                  onClick={() => setSelected(asset)}
                >
                  <div className="aspect-square bg-muted">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.thumbnail_url ?? asset.url}
                        alt={asset.alt_text ?? asset.original_name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <FileImage className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p className="truncate text-xs font-medium" title={asset.original_name}>
                      {asset.original_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatBytes(asset.file_size)}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}

      {/* Asset detail panel */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/30"
          onClick={() => setSelected(null)}
        >
          <aside
            className="h-full w-80 overflow-y-auto bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Asset Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>✕</Button>
            </div>

            {selected.mime_type.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.url}
                alt={selected.alt_text ?? selected.original_name}
                className="mb-4 w-full rounded-md object-contain"
              />
            )}

            <dl className="space-y-2 text-sm">
              <div><dt className="font-medium">Filename</dt><dd className="text-muted-foreground break-all">{selected.original_name}</dd></div>
              <div><dt className="font-medium">Type</dt><dd className="text-muted-foreground">{selected.mime_type}</dd></div>
              <div><dt className="font-medium">Size</dt><dd className="text-muted-foreground">{formatBytes(selected.file_size)}</dd></div>
              {selected.width && selected.height && (
                <div><dt className="font-medium">Dimensions</dt><dd className="text-muted-foreground">{selected.width} × {selected.height}</dd></div>
              )}
              {selected.tags?.length ? (
                <div>
                  <dt className="font-medium">Tags</dt>
                  <dd className="flex flex-wrap gap-1 pt-1">
                    {selected.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigator.clipboard.writeText(selected.url)}
              >
                Copy URL
              </Button>
              <PermissionGate permission={PERMISSIONS.CMS_MANAGE_MEDIA}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => { setDeleteId(selected.id); setSelected(null); }}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </PermissionGate>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title="Delete Asset"
        description="This media asset will be permanently deleted. Pages referencing it will show broken images."
        variant="destructive"
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={() => deleteId && deleteAsset(deleteId, { onSuccess: () => setDeleteId(null) })}
      />
    </div>
  );
}
