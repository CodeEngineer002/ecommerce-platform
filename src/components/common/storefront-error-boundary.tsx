"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  /** Optional heading override */
  heading?: string;
}

interface State {
  hasError: boolean;
  eventId:  string | null;
}

/**
 * StorefrontErrorBoundary
 *
 * Catches unhandled React render errors in the storefront, reports them to
 * Sentry with a unique event ID, and shows a user-friendly fallback UI with a
 * "Report feedback" button (Sentry user-feedback dialog).
 *
 * Usage (wrap storefront layout or individual page sections):
 *   <StorefrontErrorBoundary>
 *     <CheckoutFlow />
 *   </StorefrontErrorBoundary>
 */
export class StorefrontErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, eventId: null };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const eventId = Sentry.captureException(error, {
      contexts: {
        react: { componentStack: info.componentStack ?? undefined },
      },
    });
    this.setState({ eventId: eventId ?? null });
  }

  handleReset = (): void => {
    this.setState({ hasError: false, eventId: null });
  };

  handleReportFeedback = (): void => {
    if (this.state.eventId) {
      Sentry.showReportDialog({ eventId: this.state.eventId });
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">
            {this.props.heading ?? "Something went wrong"}
          </h2>
          <p className="text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
          {this.state.eventId && (
            <p className="text-xs text-muted-foreground">
              Error ID:{" "}
              <span className="font-mono">{this.state.eventId}</span>
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Button onClick={this.handleReset} variant="default">
            Try again
          </Button>
          {this.state.eventId && (
            <Button onClick={this.handleReportFeedback} variant="outline">
              Report feedback
            </Button>
          )}
          <Button variant="ghost" asChild>
            <a href="/">Go to homepage</a>
          </Button>
        </div>
      </div>
    );
  }
}
