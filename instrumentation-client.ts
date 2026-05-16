// instrumentation-client.ts — Turbopack only
// When using webpack (default Next.js), sentry.client.config.ts is the entry point instead.
// This file is a no-op to avoid double initialization when both files are present.
// Sentry is already initialized via sentry.client.config.ts for webpack builds.

import * as Sentry from "@sentry/nextjs";

// Required for Next.js router transition tracing
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

export {};
