# Observability & Logging

## Architecture

ShopNest uses a centralized structured logging abstraction (`src/lib/logger.ts`) designed for production-safe operation with future observability platform integration.

---

## Logger API

```ts
import { logger, createRequestLogger, generateCorrelationId } from "@/lib/logger";
```

### Methods

| Method | Channel | Use case |
|--------|---------|---------|
| `logger.debug(msg, ctx)` | `app` | Development traces |
| `logger.info(msg, ctx)` | `app` | General app events |
| `logger.warn(msg, ctx)` | `app` | Non-fatal warnings |
| `logger.error(msg, error, ctx)` | `app` | Errors with full stack |
| `logger.audit(action, ctx)` | `audit` | Admin actions, permission changes |
| `logger.payment(event, ctx)` | `payment` | Payment lifecycle events |
| `logger.cms(event, ctx)` | `cms` | Content publishing, editing |
| `logger.order(event, ctx)` | `order` | Order lifecycle events |
| `logger.inventory(event, ctx)` | `inventory` | Stock changes |

### Request-scoped logging

```ts
// In API route handlers:
const correlationId = request.headers.get("x-correlation-id") ?? generateCorrelationId();
const log = createRequestLogger(correlationId);

log.info("Order creation started", { userId, itemCount: cartItems.length });
log.order("order.created", { orderId, userId, total });
log.payment("intent.created", { orderId, provider });
```

---

## Correlation ID Flow

1. **Middleware** generates a correlation ID on every request (or passes through an existing `x-correlation-id` header)
2. ID is set as response header `x-correlation-id`
3. API handlers read the header and create a `RequestLogger` bound to that ID
4. All log lines from the same request share the same `correlationId`

This enables end-to-end request tracing in log aggregators.

---

## PII Scrubbing

The following fields are **automatically redacted** before any log emission:

```
password, token, secret, apiKey, api_key, authorization,
creditCard, credit_card, cardNumber, card_number, cvv, ssn,
privateKey, private_key, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_KEY_SECRET
```

**Rule**: Never log payment details, authentication tokens, or personal credentials.

---

## Output Format

### Development (`NODE_ENV=development`)
```
[INFO][order] (req-lxyz123-a4b2c1) Order created {"orderId":"ord-1","userId":"user-1"}
[ERROR][payment] (req-lxyz123-a4b2c1) Stripe webhook failed | Error: Invalid signature
```

### Production (`NODE_ENV=production`)
```json
{"level":"info","message":"Order created","timestamp":"2026-05-14T10:00:00.000Z","channel":"order","correlationId":"lxyz123-a4b2c1","context":{"orderId":"ord-1","userId":"user-1"}}
```

JSON output is suitable for ingestion by:
- **Datadog** (`dd-trace` integration)
- **Papertrail**
- **AWS CloudWatch**
- **Google Cloud Logging**

---

## Audit Log

The `audit` channel captures all privileged actions. Audit events are always emitted (not silenced in test mode when `AUDIT_LOG=true`).

### What to audit
```ts
// CMS publish
logger.audit("cms:content_published", { contentId, actorId, locale });

// Admin order update
logger.audit("order:status_changed", { orderId, from, to, actorId });

// Permission grant
logger.audit("rbac:permission_granted", { targetUserId, permission, actorId });

// Media upload
logger.audit("media:uploaded", { filePath, mimeType, actorId });
```

---

## Future Integrations

### Sentry
```bash
npm install @sentry/nextjs
```
Replace the `logger.error` transport to also call `Sentry.captureException(error)`.

### Datadog
Add `dd-trace` and configure the JSON log format to include `dd.trace_id` for APM correlation.

### Supabase Audit Table
For compliance, pipe `logger.audit` output to a `platform_audit_logs` table:
```sql
create table platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_id uuid references auth.users,
  context jsonb,
  created_at timestamptz default now()
);
```

---

## Silence in Tests

In test environments (`NODE_ENV=test`), logs are silenced unless `LOG_LEVEL=debug` is set. This prevents console noise in CI output.

```bash
LOG_LEVEL=debug npm test  # verbose test output
```
