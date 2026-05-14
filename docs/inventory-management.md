# Inventory Management

## Schema

```
inventory
├── variant_id (1:1 with product_variants)
├── quantity     — total physical stock
└── reserved     — stock held for pending orders

available = quantity - reserved
```

## Lifecycle of Inventory

```
Purchase/restock     → quantity ↑
Customer places order → reserved ↑ (via create_order_atomic)
Order cancelled       → reserved ↓ (via release_inventory_for_order)
Order delivered       → quantity ↓, reserved ↓ (via commit_inventory_for_order)
Customer returns item → quantity ↑ (via admin restock action)
```

## Race-Condition Safety

### Problem
Two concurrent checkout requests for the same variant could both read "3 available", both reserve 3, and oversell by 3.

### Solution: Sorted Row-Level Locking
Inside `create_order_atomic`, inventory rows are locked with `SELECT ... FOR UPDATE` **sorted by `variant_id`**. This prevents deadlocks between transactions that share overlapping cart items.

```sql
-- Locks acquired in deterministic order
FOR v_item IN
  SELECT value FROM jsonb_array_elements(p_cart_items)
  ORDER BY value->>'variant_id'
LOOP
  SELECT (quantity - reserved) INTO v_available
    FROM inventory WHERE variant_id = v_variant_id
    FOR UPDATE;  -- exclusive lock on this row
  ...
END LOOP;
```

### Pre-flight Check vs Hard Lock
- `assertSufficientStock()` — fast non-locking read for user-facing stock display
- `create_order_atomic` — locked read inside transaction (authoritative)

Never rely on the pre-flight check alone to prevent overselling. It's for UX only.

## Inventory Movement Ledger

Every stock change records an `inventory_movements` entry:

| Field | Description |
|-------|-------------|
| `type` | purchase, sale, return, adjustment, transfer |
| `quantity` | change amount (can be negative concept-wise, positive raw) |
| `previous_quantity` | stock level before change |
| `new_quantity` | stock level after change |
| `source_type` | what caused the change (order, return, adjustment, purchase, admin) |
| `source_id` | FK to the source record (order_id, return_request_id, etc.) |
| `note` | human-readable reason |
| `created_by` | actor UUID (admin or system) |

### When Movements Are Recorded

| Trigger | Movement Type | Source Type |
|---------|--------------|-------------|
| Order creation (reservation) | `sale` | `order` |
| Order cancellation (release) | `adjustment` | `order` |
| Order delivery (commit) | `sale` | `order` |
| Return restock | `return` | `return` |
| Admin stock adjustment | `adjustment` | `admin` |

## DB Functions

| Function | Purpose |
|----------|---------|
| `reserve_inventory(variant_id, qty)` | Single-variant lock-and-reserve |
| `release_inventory(variant_id, qty)` | Decrements reservation |
| `confirm_inventory_sale(variant_id, qty)` | Deducts quantity + reservation |
| `release_inventory_for_order(order_id)` | Releases all reservations for an order |
| `commit_inventory_for_order(order_id)` | Commits all stock for a delivered order |
| `record_inventory_movement(...)` | Writes a movement record |
| `available_inventory(variant_id)` | Returns quantity - reserved |

## Low Stock Handling

The cart validator (`src/domain/cart/cart-validator.ts`) warns when `available ≤ requested + 2`. This is a soft UX warning, not a hard block. The hard block is in `create_order_atomic`.

## Future: Multi-Warehouse

To support multiple warehouses:
1. Add `warehouse_id UUID` to `inventory` (remove the `variant_id UNIQUE` constraint)
2. Add `warehouse_id` to `inventory_movements`
3. Update `reserve_inventory` and `create_order_atomic` to accept warehouse preference
4. Add a warehouse allocation strategy (nearest warehouse, highest stock, etc.)
