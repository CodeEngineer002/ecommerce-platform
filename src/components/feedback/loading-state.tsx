import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
  text?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-4",
};

export function LoadingState({ className, text, size = "md" }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-primary border-t-transparent",
          sizeMap[size]
        )}
        aria-label="Loading"
      />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

export function InlineLoader({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className
      )}
    />
  );
}
