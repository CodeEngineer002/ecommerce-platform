// Shown instantly by Next.js during route transitions between CMS modules.
// Renders the nav skeleton + content skeleton so there's zero blank-screen gap.
import { Skeleton } from "@/components/ui/skeleton";

export default function CmsModuleLoading() {
  return (
    <div className="space-y-6">
      {/* Nav skeleton */}
      <div className="space-y-0 rounded-lg border bg-card shadow-sm">
        {/* Country row */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Skeleton className="h-4 w-14 rounded" />
          {[120, 110, 90, 80, 70, 60, 80, 130].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
          ))}
        </div>
        {/* Language row */}
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
        {/* Module tabs row */}
        <div className="flex gap-1 px-4 py-2">
          {[80, 55, 55, 90, 70, 55].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-md" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Page header skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded" />
          <Skeleton className="h-4 w-64 rounded" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Content cards skeleton */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-40 rounded" />
                <Skeleton className="h-4 w-64 rounded" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-16 rounded-md" />
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
