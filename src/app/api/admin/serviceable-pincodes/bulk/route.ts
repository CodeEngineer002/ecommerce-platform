import { z } from "zod";

import { apiError, apiSuccess, withApiHandler } from "@/lib/api";
import { PERMISSIONS } from "@/lib/admin/permissions";
import { requireAdminPermission } from "@/lib/admin/with-admin-permission";

/**
 * POST /api/admin/serviceable-pincodes/bulk
 *
 * Body shape:
 *   { country_code: "IN",
 *     csv: "<raw CSV text>",
 *     mode: "upsert" | "replace_country" }
 *
 * CSV columns (header row required):
 *   pincode (required), city, state, is_deliverable (true/false),
 *   cod_enabled (true/false), expected_days, notes
 *
 * Modes:
 *   - "upsert": insert new rows, update existing (matched by country_code+pincode).
 *   - "replace_country": delete ALL rows for the given country_code first,
 *     then insert from CSV. Destructive — use when you want a fresh full list.
 *
 * Returns counts: { inserted, updated, skipped, errors[] }.
 */
const bodySchema = z.object({
  country_code: z.string().min(2).max(3),
  csv:          z.string().min(1).max(5_000_000), // ~5MB cap
  mode:         z.enum(["upsert", "replace_country"]).default("upsert"),
});

interface ParsedRow {
  pincode:        string;
  city:           string | null;
  state:          string | null;
  is_deliverable: boolean;
  cod_enabled:    boolean;
  expected_days:  number | null;
  notes:          string | null;
}

/** Minimal CSV parser — handles quoted fields, escaped quotes, commas in quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === ",") { cur.push(field); field = ""; i += 1; continue; }
    if (c === "\n" || c === "\r") {
      // Handle \r\n
      if (c === "\r" && text[i + 1] === "\n") i += 1;
      cur.push(field); rows.push(cur); cur = []; field = ""; i += 1; continue;
    }
    field += c; i += 1;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "yes" || v === "1" || v === "y") return true;
  if (v === "false" || v === "no" || v === "0" || v === "n") return false;
  return fallback;
}

export const POST = withApiHandler(async (request: Request) => {
  const { db } = await requireAdminPermission(PERMISSIONS.ORDERS_MANAGE);

  const body: unknown = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "Invalid request",
      400,
      "VALIDATION_ERROR",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const countryCode = parsed.data.country_code.toUpperCase();
  const rows  = parseCsv(parsed.data.csv);

  if (rows.length < 2) {
    return apiError("CSV must include a header row + at least one data row", 400, "VALIDATION_ERROR");
  }

  // ── Parse header → column index map ─────────────────────────────────────
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const colPincode       = idx("pincode");
  const colCity          = idx("city");
  const colState         = idx("state");
  const colDeliverable   = idx("is_deliverable");
  const colCod           = idx("cod_enabled");
  const colExpectedDays  = idx("expected_days");
  const colNotes         = idx("notes");

  if (colPincode < 0) {
    return apiError(
      "CSV header must include 'pincode' column",
      400,
      "VALIDATION_ERROR",
    );
  }

  // ── Build typed rows ─────────────────────────────────────────────────────
  const errors: string[] = [];
  const seen = new Set<string>();
  const toInsert: ParsedRow[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const pincode = row[colPincode]?.trim();
    if (!pincode) { errors.push(`Row ${r + 1}: empty pincode — skipped`); continue; }
    if (seen.has(pincode)) { errors.push(`Row ${r + 1}: duplicate pincode ${pincode} in CSV — first occurrence wins`); continue; }
    seen.add(pincode);

    const expDays = colExpectedDays >= 0 ? row[colExpectedDays]?.trim() : "";
    toInsert.push({
      pincode,
      city:           colCity   >= 0 ? row[colCity]?.trim()   || null : null,
      state:          colState  >= 0 ? row[colState]?.trim()  || null : null,
      is_deliverable: toBool(colDeliverable >= 0 ? row[colDeliverable] : undefined, true),
      cod_enabled:    toBool(colCod         >= 0 ? row[colCod]         : undefined, true),
      expected_days:  expDays ? Number(expDays) || null : null,
      notes:          colNotes  >= 0 ? row[colNotes]?.trim()  || null : null,
    });
  }

  if (toInsert.length === 0) {
    return apiError("No valid rows in CSV", 400, "VALIDATION_ERROR", { errors });
  }

  // ── replace_country: wipe existing rows for this country ─────────────────
  if (parsed.data.mode === "replace_country") {
    const { error: delErr } = await db
      .from("serviceable_pincodes")
      .delete()
      .eq("country_code", countryCode);
    if (delErr) return apiError(delErr.message, 500, "DB_ERROR");
  }

  // ── Upsert ───────────────────────────────────────────────────────────────
  const payload = toInsert.map((r) => ({ country_code: countryCode, ...r }));
  const { data, error } = await db
    .from("serviceable_pincodes")
    .upsert(payload, { onConflict: "country_code,pincode" })
    .select("id");

  if (error) return apiError(error.message, 500, "DB_ERROR", { errors });

  return apiSuccess({
    country_code: countryCode,
    mode:         parsed.data.mode,
    affected:     data?.length ?? 0,
    errors,
  });
});
