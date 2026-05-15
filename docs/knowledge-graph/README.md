# Knowledge Graph README

> This directory contains **machine-readable architecture data** for the ecommerce platform.
> It is designed to complement the human-curated docs in `docs/architecture/` and `docs/ADRs/`.

---

## Files

| File | Contents | Update Frequency |
|------|---------|-----------------|
| `entities.json` | All DB tables, domain DTOs, state machines | On schema/domain change |
| `relationships.json` | Entity relationships and cross-domain flows | On schema change |
| `services.json` | Service inventory (classes, functions, methods) | On service change |
| `APIs.json` | All API routes with auth, ownership, returns | On route change |
| `permissions.json` | RBAC permission codes, roles, enforcement layers | On permission change |
| `workflows.json` | Key workflows (order placement, cart merge, etc.) | On workflow change |
| `ADR-index.json` | Index of all Architecture Decision Records | When new ADR added |

---

## Auto-Generation vs Human-Curated

### AUTO-GENERATION-READY (marked in `_meta`)
These files can be regenerated from source code. Future tooling should target:

| File | Derivable From |
|------|---------------|
| `entities.json` (db_entities) | `supabase/migrations/*.sql` |
| `APIs.json` | `src/app/api/**/route.ts` (scan for method + path) |
| `permissions.json` (permissions list) | `src/lib/admin/permissions.ts` |

**To regenerate:** Scan the sources listed above. Do NOT overwrite the `_meta`, `domain_entities`, or `state_machines` sections — those require human curation.

### HUMAN-CURATED (do not auto-generate)
- `services.json` — Service semantics, invariants, method contracts
- `workflows.json` — Workflow steps, error paths, edge cases
- `relationships.json` (cross_domain_flows) — Business process flows
- `ADR-index.json` — ADR decisions and rationale

---

## Maintenance Instructions

When you add a new feature, update the relevant files:

**New DB table:** Update `entities.json` → `db_entities`, update `relationships.json`

**New API route:** Update `APIs.json`

**New service/method:** Update `services.json`

**New permission:** Update `permissions.json`

**New workflow:** Update `workflows.json`

**New architectural decision:** Create `ADR-XXX-name.md` in `docs/ADRs/`, then update `ADR-index.json`

---

## How AI Agents Should Use These Files

1. **Start with `entities.json`** to understand what exists (tables, DTOs, state machines)
2. **Check `relationships.json`** to understand how entities connect
3. **Check `services.json`** to find the right service/method for an operation
4. **Check `workflows.json`** to understand full end-to-end flows
5. **Check `APIs.json`** to find the right API route
6. **Check `permissions.json`** when implementing admin features
7. **Check `ADR-index.json`** before proposing architectural changes (don't re-decide settled questions)
