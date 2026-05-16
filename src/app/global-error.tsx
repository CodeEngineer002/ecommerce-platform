"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * global-error.tsx — catches React rendering errors at the root layout level.
 * Required by Sentry to capture server-component render failures.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ margin: 0, fontFamily: "sans-serif", background: "#f9fafb" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
          }}
        >
          <h2 style={{ fontSize: 20, color: "#111827", margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#6b7280", margin: 0 }}>An unexpected error occurred.</p>
          <button
            onClick={reset}
            style={{
              padding: "8px 20px",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

