import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      environment: process.env.NODE_ENV,
      enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
      beforeSend(event) {
        if (event.request?.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
          delete event.request.headers["x-supabase-auth"];
        }
        return event;
      },
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,
      environment: process.env.NODE_ENV,
      enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
