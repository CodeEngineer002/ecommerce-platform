import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";

import { InvoicePDF } from "@/components/orders/invoice-pdf";
import type { InvoiceData } from "@/components/orders/invoice-pdf";
import { AuthError, NotFoundError, UnauthorizedOrderAccessError } from "@/lib/errors";
import { isValidCountry } from "@/lib/i18n/config";
import type { CountryCode } from "@/lib/i18n/config";
import { REGION_CONFIGS } from "@/lib/i18n/region-config";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

/**
 * GET /api/orders/[id]/invoice
 * Generates and streams a PDF invoice for the authenticated order owner.
 * The PDF is built server-side via @react-pdf/renderer — no client JS needed.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const userClient = await createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) throw new AuthError();

    const { id: orderId } = await context.params;
    const db = createServiceClient();

    // ── Fetch order + items ────────────────────────────────────────────────
    const { data: order } = await db
      .from("orders")
      .select("id, order_number, status, created_at, user_id, shipping_address, subtotal, tax, shipping, discount, total")
      .eq("id", orderId)
      .single();

    if (!order) throw new NotFoundError("Order not found");
    if (order.user_id !== user.id) throw new UnauthorizedOrderAccessError();

    const { data: items } = await db
      .from("order_items")
      .select("product_name, variant_name, sku, quantity, unit_price, tax_amount, total")
      .eq("order_id", orderId)
      .order("product_name");

    // ── Region config (derive from order address country or fallback to IN) ─
    const shipping = order.shipping_address as Record<string, string> | null;
    const countryCode = (shipping?.country_code ?? "in").toLowerCase() as string;
    const regionKey: CountryCode = isValidCountry(countryCode)
      ? (countryCode as CountryCode)
      : "in";
    const region = REGION_CONFIGS[regionKey];

    // ── Build invoice data ─────────────────────────────────────────────────
    const today = new Date();
    const invoiceData: InvoiceData = {
      orderNumber: order.order_number ?? orderId.slice(0, 8).toUpperCase(),
      orderDate:   formatDate(order.created_at),
      invoiceDate: formatDate(today.toISOString()),
      items: (items ?? []).map((item) => ({
        product_name: item.product_name,
        variant_name: item.variant_name ?? null,
        sku:          item.sku ?? null,
        quantity:     item.quantity,
        unit_price:   item.unit_price,
        tax_amount:   item.tax_amount,
        total:        item.total,
      })),
      shippingAddress: shipping
        ? {
            full_name:    shipping.full_name,
            first_name:   shipping.first_name,
            last_name:    shipping.last_name,
            phone:        shipping.phone,
            address_line1: shipping.address_line1,
            address_line2: shipping.address_line2,
            city:         shipping.city,
            state:        shipping.state,
            postal_code:  shipping.postal_code,
            country:      shipping.country ?? shipping.country_code ?? "",
          }
        : {
            address_line1: "—",
            city:          "—",
            postal_code:   "",
            country:       "",
          },
      subtotal:       order.subtotal,
      taxAmount:      order.tax,
      taxLabel:       region.taxLabel,
      taxRate:        region.taxRate,
      shippingCost:   order.shipping,
      discount:       order.discount,
      total:          order.total,
      currencySymbol: region.currencySymbol,
      currencyCode:   region.currencyCode,
    };

    // ── Render PDF ─────────────────────────────────────────────────────────
    const element = React.createElement(InvoicePDF, { data: invoiceData });
    const buffer = await renderToBuffer(element);

    const filename = `invoice-${invoiceData.orderNumber}.pdf`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control":       "no-store",
      },
    });
  } catch (error) {
    const { message, status } = getErrorMeta(error);
    return NextResponse.json({ data: null, error: { message } }, { status });
  }
}

function getErrorMeta(error: unknown): { message: string; status: number } {
  if (error instanceof AuthError) return { message: "Unauthorized", status: 401 };
  if (error instanceof NotFoundError) return { message: "Order not found", status: 404 };
  if (error instanceof UnauthorizedOrderAccessError) return { message: "Forbidden", status: 403 };
  return { message: "Failed to generate invoice", status: 500 };
}
