/**
 * Shared types for the admin inventory module.
 * Import from here to avoid circular dependencies between components.
 */

export interface InventoryRowData {
  variantId: string;
  productId: string;
  productName: string;
  productCode: string | null;
  sku: string | null;
  variantName: string;
  color: string | null;
  colorCode: string | null;
  size: string | null;
  sizeCode: string | null;
  quantity: number;
  reserved: number;
}

export const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;

export interface ProductGroup {
  productId: string;
  productName: string;
  productCode: string | null;
  colors: ColorGroup[];
  allSizes: string[];
  totalUnits: number;
  hasLowStock: boolean;
  hasOOS: boolean;
}

export interface ColorGroup {
  color: string;
  cells: Map<string, CellData>; // size → cell
}

export interface CellData {
  variantId: string;
  quantity: number;
  reserved: number;
  available: number;
  sku: string | null;
  size: string;
  color: string;
  productName: string;
  variantLabel: string;
}

/**
 * Transforms a flat list of InventoryRowData into grouped product/color/size structure.
 * Exported as a pure function so it can be unit tested independently.
 */
export function buildProductGroups(rows: InventoryRowData[]): ProductGroup[] {
  // Group rows by productId
  const productMap = new Map<string, {
    productName: string;
    productCode: string | null;
    colorMap: Map<string, Map<string, CellData>>;
    sizesSet: Set<string>;
  }>();

  for (const row of rows) {
    if (!productMap.has(row.productId)) {
      productMap.set(row.productId, {
        productName: row.productName,
        productCode: row.productCode,
        colorMap: new Map(),
        sizesSet: new Set(),
      });
    }

    const product = productMap.get(row.productId)!;
    const color = row.color ?? "Default";
    const size = row.size ?? row.variantName;

    if (!product.colorMap.has(color)) {
      product.colorMap.set(color, new Map());
    }

    const available = row.quantity - row.reserved;
    const variantLabel = [row.color, row.size].filter(Boolean).join(" / ") || row.variantName;

    product.colorMap.get(color)!.set(size, {
      variantId: row.variantId,
      quantity: row.quantity,
      reserved: row.reserved,
      available,
      sku: row.sku,
      size,
      color,
      productName: row.productName,
      variantLabel,
    });

    product.sizesSet.add(size);
  }

  const groups: ProductGroup[] = [];

  for (const [productId, product] of productMap) {
    // Sort sizes according to SIZE_ORDER, then alphabetically for unknown sizes
    const allSizes = Array.from(product.sizesSet).sort((a, b) => {
      const ai = SIZE_ORDER.indexOf(a as typeof SIZE_ORDER[number]);
      const bi = SIZE_ORDER.indexOf(b as typeof SIZE_ORDER[number]);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    const colors: ColorGroup[] = Array.from(product.colorMap.entries()).map(([color, cells]) => ({
      color,
      cells,
    }));

    // Aggregate stats
    const allCells = colors.flatMap((c) => Array.from(c.cells.values()));
    const totalUnits = allCells.reduce((sum, c) => sum + c.quantity, 0);
    const hasOOS = allCells.some((c) => c.available <= 0);
    const hasLowStock = allCells.some((c) => c.available > 0 && c.available <= 5);

    groups.push({
      productId,
      productName: product.productName,
      productCode: product.productCode,
      colors,
      allSizes,
      totalUnits,
      hasLowStock,
      hasOOS,
    });
  }

  return groups;
}
