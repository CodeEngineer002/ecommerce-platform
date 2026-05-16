/**
 * Carrier registry — maps carrier IDs to their provider implementations.
 *
 * To add a new carrier:
 *   1. Create `src/lib/carriers/providers/<name>.ts`
 *   2. Import and register below
 */

import { delhiveryProvider } from "./providers/delhivery";
import { genericProvider }   from "./providers/generic";
import { shiprocketProvider } from "./providers/shiprocket";
import type { CarrierProvider } from "./types";

export type { CarrierProvider, NormalizedTrackingEvent } from "./types";
export { mapCarrierStatus, INTERNAL_STATUS_RANK } from "./types";

const CARRIER_REGISTRY = new Map<string, CarrierProvider>([
  ["delhivery",  delhiveryProvider],
  ["shiprocket", shiprocketProvider],
  ["generic",    genericProvider],
  // Add more: bluedart, dtdc, fedex, etc.
]);

/**
 * Returns the carrier provider for the given carrier ID.
 * Falls back to the generic provider if the carrier is not explicitly registered.
 */
export function getCarrierProvider(carrierId: string): CarrierProvider {
  return CARRIER_REGISTRY.get(carrierId.toLowerCase()) ?? genericProvider;
}

export { delhiveryProvider, shiprocketProvider, genericProvider };
