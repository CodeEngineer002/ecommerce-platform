"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  placeholder?: string;
  defaultValue?: string;
  onSearch?: (value: string) => void;
  className?: string;
  /**
   * When true, fires onSearch after the user pauses typing (debounced).
   * Defaults to true so the products page gets live search without Enter.
   */
  live?: boolean;
  debounceMs?: number;
  /** Minimum characters before live search fires (default 3). Clear/empty always fires. */
  minLength?: number;
}

export function SearchBar({
  placeholder = "Search products…",
  defaultValue = "",
  onSearch,
  className,
  live = true,
  debounceMs = 600,
  minLength = 3,
}: SearchBarProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFiredRef = useRef<string | null>(null);

  // Sync defaultValue if parent resets it (e.g. "Clear all" filter)
  useEffect(() => {
    setValue(defaultValue ?? "");
  }, [defaultValue]);

  const fireSearch = (q: string) => {
    // Skip if we already fired this exact query — prevents duplicate API calls
    if (lastFiredRef.current === q) return;
    lastFiredRef.current = q;
    if (onSearch) {
      onSearch(q);
    } else {
      router.push(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setValue(next);

    if (!live) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = next.trim();
    // Don't fire for very short incomplete words; always fire for clear
    if (trimmed.length > 0 && trimmed.length < minLength) return;

    timerRef.current = setTimeout(() => {
      fireSearch(trimmed);
    }, debounceMs);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    fireSearch(value.trim());
  };

  const handleClear = () => {
    setValue("");
    if (timerRef.current) clearTimeout(timerRef.current);
    fireSearch("");
  };

  return (
    <form onSubmit={handleSubmit} className={cn("relative", className)}>
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        leftIcon={<Search className="h-4 w-4" />}
        rightIcon={
          value ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null
        }
        className="pr-9"
      />
    </form>
  );
}

