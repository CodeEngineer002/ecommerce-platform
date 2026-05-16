# ShopNest E2E Test Suite

Reusable Playwright automation scripts for regression, checkout, and admin flows.
These tests run headlessly against a local dev server and report via HTML.

## Quick start

```bash
# 1. Install Playwright browsers (first time only)
npx playwright install chromium

# 2. Copy and fill environment file
cp .env.e2e.example .env.e2e
# Edit .env.e2e with your local Supabase credentials

# 3. Seed E2E test data (test users + address)
npm run db:seed        # products, categories, coupons
npm run db:seed:e2e    # e2e-customer, e2e-admin, test address

# 4. Start the dev server (in a separate terminal)
npm run dev

# 5. Run tests
npm run test:e2e
```

## Commands

| Command | What it runs |
|---------|-------------|
| `npm run test:e2e` | Full E2E suite (chromium + mobile) |
| `npm run test:e2e:ui` | Interactive Playwright UI mode |
| `npm run test:e2e:checkout` | COD checkout flow only |
| `npm run test:e2e:cart` | Cart operations only |
| `npm run test:e2e:order` | All tests tagged `@order` |
| `npm run test:e2e:admin` | Admin panel tests only |
| `npm run test:e2e:regression` | Critical path regression suite |
| `npm run test:e2e:report` | Open the last HTML report |

## Structure

```
src/tests/e2e/
├── setup/
│   ├── customer-auth.setup.ts   — logs in as E2E customer, saves session
│   └── admin-auth.setup.ts      — logs in as E2E admin, saves session
├── fixtures/
│   ├── auth.fixture.ts          — customerPage / adminPage / anonPage fixtures
│   └── checkout.fixture.ts      — pre-loaded cart for checkout tests
├── helpers/
│   ├── auth.ts                  — login helpers, localeUrl()
│   ├── db.ts                    — Supabase service-role DB assertions
│   ├── products.ts              — goToProduct(), addToCart()
│   ├── cart.ts                  — goToCart(), proceedToCheckout()
│   ├── checkout.ts              — checkout interaction helpers
│   ├── admin.ts                 — admin navigation helpers
│   └── assertions.ts            — console/network capture, performance checks
├── seed/
│   └── e2e-seed.ts              — creates test users + addresses
├── specs/
│   ├── storefront/
│   │   ├── product-browsing.spec.ts
│   │   ├── cart.spec.ts
│   │   └── checkout-cod.spec.ts
│   ├── admin/
│   │   └── order-management.spec.ts
│   └── regression/
│       └── critical-path.spec.ts
└── reports/
    └── html/                    — HTML report output (gitignored)
```

## Reports

After a test run, reports are written to `src/tests/e2e/reports/html/`.

```bash
npm run test:e2e:report    # open in browser
```

Each failed test includes:
- **Screenshot** — captured at point of failure
- **Trace** — step-by-step browser trace (viewable in `playwright show-trace`)
- **Video** — recording of the test run (on retry/failure)
- **Console errors** — captured via page.on("console")
- **Network failures** — 4xx/5xx API calls captured

To view a trace file:
```bash
npx playwright show-trace src/tests/e2e/reports/artifacts/<test>/trace.zip
```

## Environment variables

See `.env.e2e.example` for the full list. Required variables:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Local Supabase URL (localhost:54321) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (DB assertions only) |
| `TEST_CUSTOMER_EMAIL` | E2E customer email |
| `TEST_CUSTOMER_PASSWORD` | E2E customer password |
| `TEST_ADMIN_EMAIL` | E2E admin email |
| `TEST_ADMIN_PASSWORD` | E2E admin password |
| `TEST_LOCALE_PREFIX` | URL locale prefix (default: `/in/en`) |
| `TEST_PRODUCT_SLUG` | Test product slug |

## Auth state files

Login sessions are persisted to `.playwright/` (gitignored):
- `.playwright/customer.json` — customer session
- `.playwright/admin.json` — admin session

These are created by the `setup:customer` and `setup:admin` Playwright projects.
Delete them to force a fresh login on next run.

## Test data

E2E tests use isolated test data:
- **Customer**: `e2e-customer@test.shopnest.local`
- **Admin**: `e2e-admin@test.shopnest.local`
- **Address**: "E2E Default" label, Mumbai IN
- **Orders**: tagged with `[E2E]` in notes field for cleanup

Cleanup test data:
```bash
npm run db:seed:e2e:cleanup
```

## Production safety

The seed script and DB helpers **refuse** to run against a non-localhost Supabase URL
unless `E2E_ALLOW_PRODUCTION=true` is explicitly set. This prevents accidental data
corruption in staging or production.

## CI

E2E tests run in CI only on `main` branch or PRs targeting `main`.
The CI workflow installs Playwright browsers, runs in headless mode,
and uploads the HTML report as an artifact (7-day retention).

Environment variables required in CI:
```
E2E_BASE_URL=https://your-test-deployment-url
TEST_CUSTOMER_EMAIL=...
TEST_CUSTOMER_PASSWORD=...
TEST_ADMIN_EMAIL=...
TEST_ADMIN_PASSWORD=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
E2E_ALLOW_PRODUCTION=true  # only if running against a non-local DB
```

## Debugging failures

1. **Open HTML report**: `npm run test:e2e:report`
2. **View trace**: Click "Traces" in the HTML report or run `npx playwright show-trace <path>`
3. **Re-run single test**: `npx playwright test --grep "test name here"`
4. **Interactive mode**: `npm run test:e2e:ui`
5. **Headed mode**: `npx playwright test --headed`

Common failure causes:
- **Auth setup failed**: Delete `.playwright/*.json` and check credentials with `npm run db:seed:e2e`
- **Empty cart in checkout**: Run `npm run db:seed` to restore product inventory
- **Address validation fails**: Check that the test address country matches `TEST_LOCALE_PREFIX`
- **Port conflict**: Ensure dev server is running on port 4000 (`npm run dev`)
