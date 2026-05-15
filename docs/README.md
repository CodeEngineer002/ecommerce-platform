# Documentation Index

> **For AI agents and new developers**: start here. This index tells you which document to read for any topic and the recommended reading order.

---

## Architecture Entry Points

| Goal | Start Here |
|------|-----------|
| Understand the overall system | [architecture/SYSTEM_OVERVIEW.md](architecture/SYSTEM_OVERVIEW.md) |
| Understand domain boundaries | [architecture/DOMAIN_MAP.md](architecture/DOMAIN_MAP.md) |
| Understand service dependencies | [architecture/DEPENDENCY_GRAPH.md](architecture/DEPENDENCY_GRAPH.md) |
| Find any API route | [architecture/API_MAP.md](architecture/API_MAP.md) |
| Understand a major architectural decision | [ADRs/](ADRs/) |
| Machine-readable knowledge graph | [knowledge-graph/](knowledge-graph/) || AI/LLM context and invariants | [LLM-CONTEXT.md](LLM-CONTEXT.md) |
---

## Recommended Reading Order

### For AI Agents
1. `CLAUDE.md` — Project state, completed work, architecture rules (root)
2. `docs/LLM-CONTEXT.md` — AI-specific invariants, stale section warnings, maintenance rules
3. `docs/architecture/SYSTEM_OVERVIEW.md` — Full system portrait
4. `docs/architecture/DOMAIN_MAP.md` — Domain ownership
5. `docs/knowledge-graph/entities.json` — All entities
6. `docs/knowledge-graph/services.json` — All services
7. Then domain-specific docs below as needed

### For New Backend Developers
1. `CLAUDE.md` (root)
2. `docs/architecture/SYSTEM_OVERVIEW.md`
3. `docs/database-architecture.md`
4. `docs/ecommerce-domain.md`
5. `docs/business-rules.md`
6. Domain docs: `cart-architecture.md` → `checkout-flow.md` → `order-lifecycle.md` → `payment-flow.md`
7. `docs/rls-policies.md`
8. `docs/testing-strategy.md`

### For New Frontend Developers
1. `CLAUDE.md` (root)
2. `docs/architecture/SYSTEM_OVERVIEW.md`
3. `docs/COMPONENT_GUIDELINES.md`
4. `docs/globalization-architecture.md`
5. `docs/locale-routing.md`
6. `docs/localization-strategy.md`
7. `docs/rtl-support.md`

### For CMS / Content Developers
1. `docs/cms-architecture.md`
2. `docs/cms-localization-model.md`
3. `docs/cms-inheritance-model.md`
4. `docs/cms-country-language-navigation.md`
5. `docs/globalization-architecture.md`
6. `docs/international-seo.md`

---

## Document Inventory

### Architecture (New — Knowledge System)
| File | Purpose | Audience |
|------|---------|----------|
| [LLM-CONTEXT.md](LLM-CONTEXT.md) | AI invariants, stale-section warnings, maintenance rules | AI agents |
| [architecture/SYSTEM_OVERVIEW.md](architecture/SYSTEM_OVERVIEW.md) | Full system portrait, canonical entry | AI, All devs |
| [architecture/DOMAIN_MAP.md](architecture/DOMAIN_MAP.md) | Domain boundaries, ownership | All devs |
| [architecture/DEPENDENCY_GRAPH.md](architecture/DEPENDENCY_GRAPH.md) | Service & domain dependencies | Backend devs |
| [architecture/API_MAP.md](architecture/API_MAP.md) | All API routes, auth, ownership | Backend devs |

### Architecture Decision Records (New)
| File | Decision |
|------|---------|
| [ADRs/ADR-001-country-first-localization.md](ADRs/ADR-001-country-first-localization.md) | Country as primary business context |
| [ADRs/ADR-002-order-immutability.md](ADRs/ADR-002-order-immutability.md) | Immutable order snapshots |
| [ADRs/ADR-003-cms-inheritance-model.md](ADRs/ADR-003-cms-inheritance-model.md) | AEM-like CMS inheritance |
| [ADRs/ADR-004-server-side-pricing.md](ADRs/ADR-004-server-side-pricing.md) | Never trust client prices |
| [ADRs/ADR-005-service-role-client-pattern.md](ADRs/ADR-005-service-role-client-pattern.md) | Service-role bypass + app-layer security |
| [ADRs/ADR-006-atomic-order-creation.md](ADRs/ADR-006-atomic-order-creation.md) | PostgreSQL RPC for atomic orders |
| [ADRs/ADR-007-cart-server-authority.md](ADRs/ADR-007-cart-server-authority.md) | Server-authoritative cart with client cache |

### Machine-Readable Knowledge Graph (New)
| File | Contents |
|------|---------|
| [knowledge-graph/entities.json](knowledge-graph/entities.json) | All domain entities & DB tables |
| [knowledge-graph/relationships.json](knowledge-graph/relationships.json) | Entity relationships |
| [knowledge-graph/workflows.json](knowledge-graph/workflows.json) | Key workflows & state machines |
| [knowledge-graph/services.json](knowledge-graph/services.json) | Service inventory |
| [knowledge-graph/APIs.json](knowledge-graph/APIs.json) | API route inventory |
| [knowledge-graph/permissions.json](knowledge-graph/permissions.json) | RBAC permission codes |
| [knowledge-graph/ADR-index.json](knowledge-graph/ADR-index.json) | ADR index |

### Domain Documentation (Existing — Canonical)
| File | Domain | Status |
|------|--------|--------|
| [cart-architecture.md](cart-architecture.md) | Cart | ✅ Current |
| [checkout-flow.md](checkout-flow.md) | Checkout | ✅ Current |
| [order-lifecycle.md](order-lifecycle.md) | Orders | ✅ Current |
| [payment-flow.md](payment-flow.md) | Payments | ✅ Current |
| [refund-return-flow.md](refund-return-flow.md) | Returns | ✅ Current |
| [inventory-management.md](inventory-management.md) | Inventory | ✅ Current |
| [admin-architecture.md](admin-architecture.md) | Admin/RBAC | ✅ Current |
| [rls-policies.md](rls-policies.md) | DB Security | ✅ Current |
| [database-architecture.md](database-architecture.md) | Database | ✅ Current |
| [indexing-strategy.md](indexing-strategy.md) | DB Performance | ✅ Current |
| [ecommerce-domain.md](ecommerce-domain.md) | Domain Layer | ✅ Current |
| [business-rules.md](business-rules.md) | Business Rules | ✅ Current |
| [observability.md](observability.md) | Logging | ✅ Current |
| [testing-strategy.md](testing-strategy.md) | Testing | ✅ Current |
| [production-readiness.md](production-readiness.md) | Status/Roadmap | ✅ Current |
| [COMPONENT_GUIDELINES.md](COMPONENT_GUIDELINES.md) | UI Components | ✅ Current |

### Globalization Documentation (Existing — Canonical)
| File | Topic | Status |
|------|-------|--------|
| [globalization-architecture.md](globalization-architecture.md) | G11N overview | ✅ Current |
| [locale-routing.md](locale-routing.md) | URL routing | ✅ Current |
| [localization-strategy.md](localization-strategy.md) | UI translations | ✅ Current |
| [international-seo.md](international-seo.md) | SEO markup | ✅ Current |
| [rtl-support.md](rtl-support.md) | Arabic RTL | ✅ Current |
| [cms-architecture.md](cms-architecture.md) | CMS overview | ✅ Current |
| [cms-localization-model.md](cms-localization-model.md) | CMS data model | ✅ Current |
| [cms-inheritance-model.md](cms-inheritance-model.md) | CMS inheritance | ✅ Current |
| [cms-country-language-navigation.md](cms-country-language-navigation.md) | Admin CMS nav | ✅ Current |

---

## Maintenance Notes

- All docs in `docs/architecture/` and `docs/ADRs/` are **human-curated** — do not auto-generate.
- All docs in `docs/knowledge-graph/` are designed to be **auto-regenerated** from source code (see [knowledge-graph/README.md](knowledge-graph/README.md)).
- When adding a new domain feature, also update the relevant domain doc AND `knowledge-graph/*.json` files.
- `CLAUDE.md` (root) is the authoritative AI context file — always keep it current.
