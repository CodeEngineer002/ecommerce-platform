/**
 * ARCH-7: This non-locale storefront orders page is superseded by the richer
 * locale-aware version at src/app/[country]/[lang]/orders/page.tsx
 *
 * The middleware already redirects /orders → /{country}/{lang}/orders for all
 * storefront paths, so this file should never be reached in production.
 * It is kept as a safety redirect in case middleware is bypassed.
 */
import { redirect } from "next/navigation";

export default function LegacyOrdersPage() {
  // Middleware intercepts /orders first and redirects to locale URL.
  // If we get here, fall back to the India default locale.
  redirect("/in/en/orders");
}
