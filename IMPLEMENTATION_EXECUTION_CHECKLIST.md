# VentureOS Implementation Execution Checklist

## Purpose
This checklist translates the master build pipeline into an executable plan for the current repository.

## How to Use This
- Work through the phases in order.
- Mark each item complete once the implementation and verification are in place.
- Prefer small, testable increments over large speculative changes.

---

## Phase 0 — Foundation
- [ ] Confirm repository structure and module boundaries.
- [ ] Confirm database schema coverage for core entities.
- [ ] Verify authentication and session handling.
- [ ] Verify authorization and tenant-aware access.
- [ ] Confirm configuration loading for local/test/prod.
- [ ] Confirm logging and error handling strategy.
- [ ] Confirm automated test entry points.
- [ ] Confirm container/deployment assets.

### Current Repo Notes
- Existing auth and routing live in [lib/server/auth.js](lib/server/auth.js) and [lib/server/api-router.js](lib/server/api-router.js).
- Existing data-store support lives in [lib/server/data-store.js](lib/server/data-store.js).
- Database SQL scaffolding exists in [db/schema.sql](db/schema.sql).

---

## Phase 1 — Core Platform
- [ ] Verify MSP creation and membership flows.
- [ ] Verify workspace creation and member access.
- [ ] Verify role definitions and permission checks.
- [ ] Verify billing lifecycle state handling.
- [ ] Verify operational mode handling.
- [ ] Verify enforcement middleware is wired into API routes.

### Current Repo Notes
- MSP and billing helpers exist in [lib/server/billing.js](lib/server/billing.js).
- Workspace membership and auth helpers exist in [lib/server/auth.js](lib/server/auth.js).

---

## Phase 2 — Workspace Intelligence
- [ ] Verify workspace overview endpoint behavior.
- [ ] Verify dashboard aggregation for trust and health data.
- [ ] Verify executive summary generation.
- [ ] Verify alert and timeline generation.
- [ ] Verify workspace metadata endpoints.

### Current Repo Notes
- Workspace overview and risk logic are in [lib/server/billing.js](lib/server/billing.js).
- Main UI entry point is [src/App.jsx](src/App.jsx).

---

## Phase 3 — Trust Graph
- [ ] Verify graph node and edge construction.
- [ ] Verify traversal and relationship queries.
- [ ] Verify identity graph relationships.
- [ ] Verify graph viewer integration.
- [ ] Verify node inspector behavior.

### Current Repo Notes
- Trust graph logic is in [lib/server/trust-graph.js](lib/server/trust-graph.js).
- Graph builder logic is in [lib/server/graph-builder.js](lib/server/graph-builder.js).

---

## Phase 4 — Coverage Engine
- [ ] Verify coverage scoring and baselines.
- [ ] Verify evidence gap reporting.
- [ ] Verify recommendations generation.
- [ ] Verify trend reporting.

### Current Repo Notes
- Coverage engine exists in [lib/server/coverage.js](lib/server/coverage.js).

---

## Phase 5 — Risk Intelligence
- [ ] Verify risk scoring and severity bands.
- [ ] Verify staleness and aging analysis.
- [ ] Verify risk timeline generation.
- [ ] Verify alerting for high-risk items.

### Current Repo Notes
- Risk and scoring logic exists in [lib/server/scoring.js](lib/server/scoring.js).
- Billing and workspace risk overview exists in [lib/server/billing.js](lib/server/billing.js).

---

## Phase 6 — Reporting
- [ ] Verify report generation endpoints.
- [ ] Verify export endpoints for JSON/CSV/PDF-like output.
- [ ] Verify report templates for executive and technical audiences.

### Current Repo Notes
- Report-like exports exist in [lib/server/billing.js](lib/server/billing.js) and [lib/server/demo.js](lib/server/demo.js).

---

## Phase 7 — Onboarding
- [ ] Verify onboarding state and progress flow.
- [ ] Verify workspace setup wizard output.
- [ ] Verify import wizard flow and validation.

### Current Repo Notes
- Onboarding helpers exist in [lib/server/onboarding.js](lib/server/onboarding.js).

---

## Phase 8 — Import Engine
- [ ] Verify CSV/JSON import handling.
- [ ] Verify artifact normalization and deduplication.
- [ ] Verify malformed import reporting.

### Current Repo Notes
- Import-related route logic exists in [lib/server/api-router.js](lib/server/api-router.js).

---

## Phase 9 — SPR Trust Engine
- [ ] Verify vendor/software/evidence registry behavior.
- [ ] Verify evidence normalization, freshness, and completeness.
- [ ] Verify monitoring signals for SBOM/CVE/domain/repo/certificate.
- [ ] Verify passport issuance, renewal, versioning, and revocation.
- [ ] Verify procurement filtering and trust score evaluation.

### Current Repo Notes
- SPR implementation is in [lib/server/api-router.js](lib/server/api-router.js).
- Regression coverage is in [test/spr-mvp.js](test/spr-mvp.js).

---

## Phase 10 — Privacy Layer
- [ ] Verify evidence visibility levels.
- [ ] Verify buyer-token access control.
- [ ] Verify evidence bundle metadata.
- [ ] Verify restricted passport views.
- [ ] Verify audit trail coverage for evidence access.

### Current Repo Notes
- Privacy-related evidence handling is in [lib/server/api-router.js](lib/server/api-router.js).

---

## Phase 11 — Verification Layer
- [ ] Verify standards ingestion for SLSA/Sigstore/SOC2/ISO.
- [ ] Verify provenance and compliance normalization.
- [ ] Verify multi-factor trust scoring.

### Current Repo Notes
- Verification and standards support is in [lib/server/api-router.js](lib/server/api-router.js).

---

## Phase 12 — Global Trust Network
- [ ] Verify public passport and verification endpoints.
- [ ] Verify revocation and federation semantics.
- [ ] Verify QR-based or external verification hooks.

### Current Repo Notes
- Public passport handling exists in [lib/server/api-router.js](lib/server/api-router.js).

---

## Phase 13 — Demo Mode
- [ ] Verify demo MSP/workspace/assets/report generation.
- [ ] Verify demo mode isolation from production behavior.

### Current Repo Notes
- Demo helpers exist in [lib/server/demo.js](lib/server/demo.js).

---

## Phase 14 — UI System
- [ ] Verify the main dashboard and workspace views use live API data.
- [ ] Verify graph, coverage, risk, reports, billing, and demo views are wired.

### Current Repo Notes
- Main UI entry point is [src/App.jsx](src/App.jsx).

---

## Phase 15 — Production Hardening
- [ ] Verify monitoring and telemetry hooks.
- [ ] Verify rate limiting and security posture.
- [ ] Verify recovery, backup, and rollback documentation.
- [ ] Verify regression and load test coverage.

### Current Repo Notes
- Production hardening remains a follow-on task and is not yet fully represented in the repository.

---

## Immediate Next Action
The highest-value next step is to complete Phase 10 and Phase 11 in a more robust way by adding:
- explicit audit log records for privacy and verification actions
- stronger access-policy checks for restricted passports and evidence bundles
- additional standards normalization for SOC2 and ISO evidence
