import { cn } from "@/lib/utils";

// ── Base ──────────────────────────────────────────────────────────────────

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

// ── Composites ────────────────────────────────────────────────────────────

interface SkeletonTextProps {
  /** Number of lines to render. Last line is 3/4 width for a natural look. */
  lines?: number;
  className?: string;
}

function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

interface SkeletonCardProps {
  /** Show footer row (price + button). */
  showFooter?: boolean;
  className?: string;
}

function SkeletonCard({ showFooter = true, className }: SkeletonCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card", className)} aria-hidden="true">
      <Skeleton className="aspect-square rounded-t-lg rounded-b-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        {showFooter && <Skeleton className="h-5 w-1/3" />}
      </div>
    </div>
  );
}

interface SkeletonAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const avatarSizeMap: Record<NonNullable<SkeletonAvatarProps["size"]>, string> = {
  sm: "h-6 w-6",
  md: "h-10 w-10",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
};

function SkeletonAvatar({ size = "md", className }: SkeletonAvatarProps) {
  return (
    <Skeleton
      className={cn("shrink-0 rounded-full", avatarSizeMap[size], className)}
    />
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  showHeader?: boolean;
  className?: string;
}

function SkeletonTable({ rows = 5, cols = 4, showHeader = true, className }: SkeletonTableProps) {
  return (
    <div className={cn("w-full space-y-2", className)} aria-hidden="true">
      {showHeader && (
        <div className="flex gap-3 border-b pb-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface SkeletonListItemProps {
  showAvatar?: boolean;
  lines?: number;
  className?: string;
}

function SkeletonListItem({ showAvatar = true, lines = 2, className }: SkeletonListItemProps) {
  return (
    <div className={cn("flex items-start gap-3 py-3", className)} aria-hidden="true">
      {showAvatar && <SkeletonAvatar size="md" className="mt-0.5 shrink-0" />}
      <div className="flex-1 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-4", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}

function SkeletonFormField({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)} aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonFormField,
  SkeletonListItem,
  SkeletonTable,
  SkeletonText,
};
