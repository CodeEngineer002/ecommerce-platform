# Testing Strategy

## Overview

The ShopNest testing strategy follows a layered pyramid: many unit tests, fewer integration tests, and targeted E2E tests for critical user journeys.

```
        ┌────────────────────────┐
        │      E2E (Playwright)  │  25+ tests
        │   Critical journeys    │
        ├────────────────────────┤
        │   Integration Tests    │  30+ tests
        │   (mocked Supabase)    │
        ├────────────────────────┤
        │      Unit Tests        │  300+ tests
        │   Pure domain logic    │
        └────────────────────────┘
```

---

## Unit Tests (`src/tests/unit/`)

**Runner**: Vitest  
**Environment**: jsdom (for React components), node (for pure logic)  
**Coverage target**: 80%+ on `src/domain/` and `src/lib/`  

### Coverage by module

| Module | Test File | Key Coverage |
|--------|-----------|-------------|
| Pricing Engine | `pricing-engine.test.ts` + `pricing-engine-extended.test.ts` | All coupon types, rounding, edge cases |
| Order State Machine | `order-state-machine.test.ts` + `-extended.test.ts` | All transitions, terminal states, payment + fulfillment machines |
| Refund Calculator | `refund-calculator.test.ts` + `-extended.test.ts` | Partial/full returns, restocking fees, tax calculation |
| Shipping Calculator | `shipping-calculator.test.ts` | Flat rate, free shipping, custom strategies |
| Locale Resolver | `locale-resolver.test.ts` | Config invariants, resolveLocaleFromUrl |
| Routing Helpers | `routing-helpers.test.ts` | localePath, localeRoute, buildAlternates |
| SEO Helpers | `seo-helpers.test.ts` | hreflang generation, metadata building |
| Permissions (RBAC) | `permissions.test.ts` | All permission codes, groups, labels |
| CMS Blocks + Sanitize | `cms.test.ts` + `cms-sanitize-blocks.test.ts` | Schema validation, XSS scrubbing |
| Cart Store | `cart-store.test.ts` | State management, itemCount, subtotal |
| Logger | `logger.test.ts` | PII scrubbing, correlation IDs, child loggers |
| Utils | `utils.test.ts` | Shared utility functions |
| Price Display | `price-display.test.tsx` | React component rendering |

### Test Factories (`src/tests/factories/index.ts`)

Reusable builders for all domain entities:
- `makeLineItem(overrides?)` — pricing tests
- `makePercentageCoupon(overrides?)` / `makeFixedCoupon(overrides?)`
- `makeRefundInput(overrides?)` / `makeReturnItem(overrides?)`
- `makeStockCheckItem(overrides?)`
- `makeCartItemWithProduct(overrides?)`
- `makePriceBreakdown(overrides?)`

**Rule**: Never construct test data inline — always use factories. This ensures consistent, semantically meaningful fixtures.

---

## Integration Tests (`src/tests/integration/`)

**Runner**: Vitest  
**DB**: Mocked Supabase client (for CI) / Real local Supabase (for full coverage)  

### Test files

| File | What it tests |
|------|---------------|
| `checkout-flow.test.ts` | Price authority, coupon+pricing interaction, order transitions, refund lifecycle |
| `rbac-enforcement.test.ts` | All role archetypes against every permission code |
| `cms-delivery.test.ts` | Locale fallback chain, block validation, routing, sanitization |

### Integration test patterns

```ts
// Always mock at the Supabase client level, not the domain layer
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => makeSupabaseServiceMock({ orders: mockOrdersChain }),
}));
```

### Real DB integration (future)
For full DB integration tests (RLS enforcement, transactions):
```bash
supabase start
SUPABASE_URL=http://localhost:54321 vitest run src/tests/integration/
```

---

## E2E Tests (`src/tests/e2e/`)

**Runner**: Playwright  
**Browser**: Chromium (CI), Chromium + Mobile Chrome (local)  
**Base URL**: `http://localhost:4000`  

### Test files

| File | Journeys covered |
|------|-----------------|
| `home.spec.ts` | Home page, product listing, auth flow |
| `storefront.spec.ts` | Locale detection, redirects, cart, auth guards, 404 |
| `checkout-journey.spec.ts` | Cart → checkout, coupon UX, orders, wishlist, search |
| `admin-cms.spec.ts` | Admin security guards, SEO meta, accessibility basics |

### Running E2E tests

```bash
# Start dev server first
npm run dev

# Run all E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Run specific browser only
npx playwright test --project=chromium
```

### Auth-dependent E2E tests

Tests requiring authentication use environment variables:
```
TEST_ADMIN_EMAIL=admin@example.com
TEST_ADMIN_PASSWORD=your-test-password
TEST_USER_EMAIL=user@example.com
```

Tests gracefully skip if these are not set, allowing CI to run without seed data.

---

## Coverage Commands

```bash
# Run all unit + integration tests
npm test

# Run with coverage report
npm run test:coverage

# Run with Vitest UI
npm run test:ui

# Run E2E tests
npm run test:e2e
```

---

## Testing Conventions

### 1. Pure functions first
Domain logic (`src/domain/`) is written as pure functions with no side effects. This makes them trivially testable without mocks.

### 2. Test factories over inline fixtures
Use `src/tests/factories` builders. Never repeat fixture data inline.

### 3. Describe/it naming
```ts
describe("calculatePricing", () => {
  it("applies percentage coupon correctly", () => { ... });
  it("caps discount at subtotal", () => { ... });
});
```

### 4. Edge cases are first-class
Every domain function has tests for:
- Zero / empty inputs
- Boundary values (exactly at threshold)
- Maximum / overflow values
- Invalid state transitions
- Locale-specific behavior

### 5. No `any` in tests
Test code is typed. Use factories to get correctly-typed fixtures.

### 6. State reset
Any test that touches mutable state (Zustand stores, module-level singletons) must reset in `beforeEach`:
```ts
beforeEach(() => {
  useCartStore.setState({ items: [], persistedItems: [], isOpen: false });
});
```

### 7. Server-only modules
Server-only modules (anything importing `"server-only"`) cannot be tested directly in unit tests. Mock at the boundary.

---

## CI Integration

Tests run in this order on every PR:
1. TypeScript check (`npm run type-check`)
2. Lint + format check
3. Unit + integration tests with coverage
4. Build verification
5. E2E tests (main branch only)
6. Migration validation

See `.github/workflows/ci.yml` for full pipeline configuration.
