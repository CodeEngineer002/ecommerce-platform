"use client";

import toast, { type ToastOptions } from "react-hot-toast";

type ToastVariant = "success" | "error" | "info" | "warning" | "loading";

interface AppToastOptions extends Omit<ToastOptions, "icon"> {
  description?: string;
}

const iconMap: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
  loading: "…",
};

function buildOptions(variant: ToastVariant, options?: AppToastOptions): ToastOptions {
  return {
    duration: variant === "error" ? 5000 : 3000,
    ...options,
    icon: iconMap[variant],
  };
}

/**
 * useToast — typed wrapper over react-hot-toast.
 *
 * Centralises default durations, icons, and toast behaviour so individual
 * call sites never import react-hot-toast directly. Swap the underlying
 * library here without touching any consumer.
 *
 * Usage:
 *   const { success, error } = useToast()
 *   success("Order placed!")
 *   error("Payment failed", { duration: 7000 })
 *   await promise(fetch(...), { loading: "Saving…", success: "Saved!", error: "Failed" })
 */
export function useToast() {
  return {
    success(message: string, options?: AppToastOptions) {
      return toast.success(message, buildOptions("success", options));
    },
    error(message: string, options?: AppToastOptions) {
      return toast.error(message, buildOptions("error", options));
    },
    info(message: string, options?: AppToastOptions) {
      return toast(message, buildOptions("info", options));
    },
    warning(message: string, options?: AppToastOptions) {
      return toast(message, buildOptions("warning", options));
    },
    loading(message: string, options?: AppToastOptions) {
      return toast.loading(message, options);
    },
    dismiss: toast.dismiss,
    promise: toast.promise,
  };
}

/** Non-hook version for use outside React components (e.g. API error handlers). */
export const toastNotify = {
  success: (message: string, options?: AppToastOptions) =>
    toast.success(message, buildOptions("success", options)),
  error: (message: string, options?: AppToastOptions) =>
    toast.error(message, buildOptions("error", options)),
  info: (message: string, options?: AppToastOptions) =>
    toast(message, buildOptions("info", options)),
  warning: (message: string, options?: AppToastOptions) =>
    toast(message, buildOptions("warning", options)),
  dismiss: toast.dismiss,
};
