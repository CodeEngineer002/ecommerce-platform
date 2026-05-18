"use client";

/**
 * StripePaymentForm
 *
 * Rendered after the order is created and the server returns a Stripe
 * clientSecret.  Mounts Stripe's hosted Payment Element so the customer
 * enters their card details and confirms the PaymentIntent.
 *
 * On success Stripe redirects the user to `return_url` (order success page).
 * On failure the error message is displayed inline and the user can retry
 * without needing to re-create the order.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/lib/env";

// ── Singleton Stripe instance (lazily loaded) ─────────────────────────────────
// loadStripe() is memoised by the Stripe SDK — calling it multiple times with
// the same key always returns the same promise.
const stripePromise =
  env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    ? loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    : null;

// ── Inner form (must be rendered inside <Elements>) ───────────────────────────

interface InnerFormProps {
  returnUrl: string;
  total: number;
  currency: string;
}

function InnerForm({ returnUrl, total, currency }: InnerFormProps) {
  const stripe   = useStripe();
  const elements = useElements();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg]         = useState<string | null>(null);
  const [elementsReady, setElementsReady] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!stripe || !elements || isSubmitting) return;

      setIsSubmitting(true);
      setErrorMsg(null);

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
      });

      // confirmPayment only resolves back here on error.
      // On success Stripe redirects the browser to return_url.
      if (error) {
        setErrorMsg(
          error.message ?? "Payment failed. Please try a different card.",
        );
        setIsSubmitting(false);
      }
    },
    [stripe, elements, isSubmitting, returnUrl],
  );

  const fmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        id="payment-element"
        onReady={() => setElementsReady(true)}
        options={{ layout: "tabs" }}
      />

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!stripe || !elementsReady || isSubmitting}
        loading={isSubmitting}
      >
        {isSubmitting ? "Processing Payment…" : `Pay ${fmt.format(total / 100)}`}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Secured by Stripe. Your card details are never stored on our servers.
      </p>
    </form>
  );
}

// ── Public component ───────────────────────────────────────────────────────────

interface StripePaymentFormProps {
  clientSecret: string;
  orderId: string;
  /** Total in SMALLEST currency unit (paise / cents). */
  totalInSmallestUnit: number;
  currency: string;
}

export function StripePaymentForm({
  clientSecret,
  orderId,
  totalInSmallestUnit,
  currency,
}: StripePaymentFormProps) {
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch — only render Stripe Elements on the client.
  useEffect(() => { setMounted(true); }, []);

  if (!stripePromise) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Stripe is not configured. Please set{" "}
        <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> in your environment.
      </div>
    );
  }

  const successUrl = `${env.NEXT_PUBLIC_APP_URL}/orders/${orderId}/success`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600" />
          Enter Payment Details
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!mounted ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: { colorPrimary: "#7c3aed" },
              },
            }}
          >
            <InnerForm
              returnUrl={successUrl}
              total={totalInSmallestUnit}
              currency={currency}
            />
          </Elements>
        )}
      </CardContent>
    </Card>
  );
}
