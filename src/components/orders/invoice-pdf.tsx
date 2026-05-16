/**
 * InvoicePDF — React-PDF template rendered server-side via renderToBuffer.
 *
 * Intentionally uses @react-pdf/renderer primitives (Document, Page, View, Text)
 * NOT HTML/CSS — this is a PDF Document, not a web page.
 */
import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  product_name: string;
  variant_name: string | null;
  sku:          string | null;
  quantity:     number;
  unit_price:   number;
  tax_amount:   number;
  total:        number;
}

export interface InvoiceShippingAddress {
  full_name?:     string;
  first_name?:    string;
  last_name?:     string;
  phone?:         string;
  address_line1:  string;
  address_line2?: string | null;
  city:           string;
  state?:         string;
  postal_code:    string;
  country:        string;
}

export interface InvoiceData {
  orderNumber:     string;
  orderDate:       string;   // formatted display date
  invoiceDate:     string;   // today formatted
  items:           InvoiceLineItem[];
  shippingAddress: InvoiceShippingAddress;
  subtotal:        number;
  taxAmount:       number;
  taxLabel:        string;  // e.g. "GST", "VAT", "Sales Tax"
  taxRate:         number;  // e.g. 0.18
  shippingCost:    number;
  discount:        number;
  total:           number;
  currencySymbol:  string;
  currencyCode:    string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BRAND   = "#1a1a2e";
const ACCENT  = "#4f46e5";
const MUTED   = "#6b7280";
const BORDER  = "#e5e7eb";

const s = StyleSheet.create({
  page: {
    fontFamily:  "Helvetica",
    fontSize:     10,
    color:        "#111827",
    paddingTop:   40,
    paddingBottom: 60,
    paddingHorizontal: 48,
  },

  // ── Header ──────────────────────────────────────────────────────────────
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 32 },
  brandName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND },
  brandSub:  { fontSize: 8,  color: MUTED, marginTop: 2 },

  invoiceTitle: { fontSize: 22, fontFamily: "Helvetica-Bold", color: ACCENT, textAlign: "right" },
  invoiceMeta:  { fontSize: 9,  color: MUTED, textAlign: "right", marginTop: 4 },
  invoiceVal:   { color: "#111827", fontFamily: "Helvetica-Bold" },

  // ── Address block ────────────────────────────────────────────────────────
  addrSection: { flexDirection: "row", marginBottom: 24, gap: 32 },
  addrBlock:   { flex: 1 },
  sectionLabel:{ fontSize: 7, fontFamily: "Helvetica-Bold", color: ACCENT,
                 textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  addrLine:    { fontSize: 9, color: "#374151", lineHeight: 1.5 },

  // ── Divider ──────────────────────────────────────────────────────────────
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 16 },

  // ── Table ────────────────────────────────────────────────────────────────
  tableHeader: {
    flexDirection: "row",
    backgroundColor: ACCENT,
    color: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableRowAlt: { backgroundColor: "#f9fafb" },

  colDesc:  { flex: 4 },
  colQty:   { flex: 1, textAlign: "center" },
  colPrice: { flex: 2, textAlign: "right" },
  colTax:   { flex: 2, textAlign: "right" },
  colTotal: { flex: 2, textAlign: "right" },

  thText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  tdText: { fontSize: 9, color: "#374151" },
  tdSub:  { fontSize: 7.5, color: MUTED, marginTop: 1.5 },

  // ── Totals ───────────────────────────────────────────────────────────────
  totalsSection: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  totalsBox:     { width: 220 },
  totalsRow:     { flexDirection: "row", justifyContent: "space-between",
                   paddingVertical: 4, paddingHorizontal: 8 },
  totalsRowFinal:{ flexDirection: "row", justifyContent: "space-between",
                   paddingVertical: 8, paddingHorizontal: 8,
                   backgroundColor: BRAND, borderRadius: 4, marginTop: 4 },
  totalsLabel:   { fontSize: 9, color: MUTED },
  totalsValue:   { fontSize: 9, color: "#374151", fontFamily: "Helvetica-Bold" },
  totalsFinalLab:{ fontSize: 10, color: "#ffffff", fontFamily: "Helvetica-Bold" },
  totalsFinalVal:{ fontSize: 10, color: "#ffffff", fontFamily: "Helvetica-Bold" },

  discountValue: { fontSize: 9, color: "#16a34a", fontFamily: "Helvetica-Bold" },

  // ── Footer ───────────────────────────────────────────────────────────────
  footer: { position: "absolute", bottom: 32, left: 48, right: 48,
            borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10 },
  footerText: { fontSize: 7.5, color: MUTED, textAlign: "center" },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, symbol: string): string {
  return `${symbol}${n.toFixed(2)}`;
}

function fullName(addr: InvoiceShippingAddress): string {
  if (addr.full_name) return addr.full_name;
  return [addr.first_name, addr.last_name].filter(Boolean).join(" ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoicePDF({ data }: { data: InvoiceData }) {
  const { currencySymbol: sym } = data;

  const taxPct = `${(data.taxRate * 100).toFixed(0)}%`;

  return (
    <Document title={`Invoice #${data.orderNumber}`} author="Store">
      <Page size="A4" style={s.page}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <View>
            <Text style={s.brandName}>MyStore</Text>
            <Text style={s.brandSub}>Tax Invoice</Text>
          </View>
          <View>
            <Text style={s.invoiceTitle}>INVOICE</Text>
            <Text style={s.invoiceMeta}>
              Invoice No: <Text style={s.invoiceVal}>#{data.orderNumber}</Text>
            </Text>
            <Text style={s.invoiceMeta}>
              Order Date: <Text style={s.invoiceVal}>{data.orderDate}</Text>
            </Text>
            <Text style={s.invoiceMeta}>
              Invoice Date: <Text style={s.invoiceVal}>{data.invoiceDate}</Text>
            </Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Bill To / Ship To ──────────────────────────────────────── */}
        <View style={s.addrSection}>
          <View style={s.addrBlock}>
            <Text style={s.sectionLabel}>Bill To</Text>
            <Text style={s.addrLine}>{fullName(data.shippingAddress)}</Text>
            {data.shippingAddress.phone ? (
              <Text style={s.addrLine}>{data.shippingAddress.phone}</Text>
            ) : null}
          </View>
          <View style={s.addrBlock}>
            <Text style={s.sectionLabel}>Ship To</Text>
            <Text style={s.addrLine}>{fullName(data.shippingAddress)}</Text>
            <Text style={s.addrLine}>{data.shippingAddress.address_line1}</Text>
            {data.shippingAddress.address_line2 ? (
              <Text style={s.addrLine}>{data.shippingAddress.address_line2}</Text>
            ) : null}
            <Text style={s.addrLine}>
              {data.shippingAddress.city}
              {data.shippingAddress.state ? `, ${data.shippingAddress.state}` : ""}
              {data.shippingAddress.postal_code ? ` – ${data.shippingAddress.postal_code}` : ""}
            </Text>
            <Text style={s.addrLine}>{data.shippingAddress.country}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* ── Line Items Table ───────────────────────────────────────── */}
        {/* Header row */}
        <View style={s.tableHeader}>
          <Text style={[s.thText, s.colDesc]}>Item</Text>
          <Text style={[s.thText, s.colQty]}>Qty</Text>
          <Text style={[s.thText, s.colPrice]}>Unit Price</Text>
          <Text style={[s.thText, s.colTax]}>{data.taxLabel} ({taxPct})</Text>
          <Text style={[s.thText, s.colTotal]}>Total</Text>
        </View>

        {data.items.map((item, idx) => (
          <View key={idx} style={[s.tableRow, idx % 2 === 1 ? s.tableRowAlt : {}]}>
            <View style={s.colDesc}>
              <Text style={s.tdText}>{item.product_name}</Text>
              {item.variant_name ? (
                <Text style={s.tdSub}>{item.variant_name}</Text>
              ) : null}
              {item.sku ? (
                <Text style={s.tdSub}>SKU: {item.sku}</Text>
              ) : null}
            </View>
            <Text style={[s.tdText, s.colQty]}>{item.quantity}</Text>
            <Text style={[s.tdText, s.colPrice]}>{fmt(item.unit_price, sym)}</Text>
            <Text style={[s.tdText, s.colTax]}>{fmt(item.tax_amount, sym)}</Text>
            <Text style={[s.tdText, s.colTotal]}>{fmt(item.total, sym)}</Text>
          </View>
        ))}

        {/* ── Totals ─────────────────────────────────────────────────── */}
        <View style={s.totalsSection}>
          <View style={s.totalsBox}>
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Subtotal</Text>
              <Text style={s.totalsValue}>{fmt(data.subtotal, sym)}</Text>
            </View>

            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>{data.taxLabel} ({taxPct})</Text>
              <Text style={s.totalsValue}>{fmt(data.taxAmount, sym)}</Text>
            </View>

            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Shipping</Text>
              <Text style={s.totalsValue}>
                {data.shippingCost === 0 ? "FREE" : fmt(data.shippingCost, sym)}
              </Text>
            </View>

            {data.discount > 0 && (
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Discount</Text>
                <Text style={s.discountValue}>-{fmt(data.discount, sym)}</Text>
              </View>
            )}

            <View style={s.totalsRowFinal}>
              <Text style={s.totalsFinalLab}>Total</Text>
              <Text style={s.totalsFinalVal}>{fmt(data.total, sym)}</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            This is a computer-generated invoice and does not require a physical signature.
            {`  |  `}Order #{data.orderNumber}
            {`  |  `}{data.invoiceDate}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
