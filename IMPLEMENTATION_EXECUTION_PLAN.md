# VentureOS Execution Plan

## Goal
Stabilize the core platform, harden SPR workspace scoping, and prepare the repo for real trust and evidence-driven behavior.

## Phase 1 — Core Stabilization

1. Remove demo/fallback behavior from production routes
   - Eliminate demo-only and synthetic default logic in `lib/server/api-router.js`
   - Remove demo session path fallbacks from auth and SPR flows
   - Ensure production endpoints do not rely on placeholder or generated workspace IDs

2. Harden SPR workspace scoping
   - Require explicit `workspaceId` for SPR evidence creation, GitHub scan, evidence bundles, and passport issuance
   - Remove `ctx.workspaceId` as a hidden workspace fallback in SPR routes
   - Enforce workspace matching between scoped tokens and payloads
   - Tighten legacy restricted-token workspace validation in `lib/server/restricted-tokens.js`

3. Add deterministic validation and error handling
   - Standardize 400/403 errors when workspace is missing or mismatched
   - Add audit logging for workspace violations and restricted-token failures
   - Verify every SPR endpoint is deterministic and rejects ambiguous requests

4. Freeze new module addition
   - Stop adding new SPR or trust-related modules until stability is confirmed
   - Focus on hardening existing `lib/server/api-router.js`, `lib/server/spr/passport.js`, and `lib/server/restricted-tokens.js`

## Phase 2 — Data Quality

1. Focus on real evidence ingestion
   - Auto-score repos, packages, pipelines, and artifacts from existing SPR evidence flows
   - Add freshness, provenance, and confidence metadata on evidence records
   - Ensure normalized evidence is stored for scoring and bundle operations

2. Build living inventory and lineage
   - Track source, dependencies, pipelines, containers, binaries, and AI artifacts as first-class entities
   - Connect evidence items to their origin, build process, and runtime artifact chain
   - Use the trust graph only for real relationships

## Phase 3 — Minimum Credible Platform

1. Make trust the product
   - Only expose evidence-based trust scores and passports
   - Hide placeholder coverage until real scoring is wired
   - Use the UI as a viewer for trust, lineage, evidence, and scoring

2. Render real data in the trust graph
   - Ensure the graph builder uses actual workspace data and SPR evidence
   - Remove any demo graph nodes from production flow

## Phase 4 — Compliance Layer

1. Add registry + analytics
   - Implement asset registry, alerts, reports, and golden-source ingestion
   - Connect ingest → scan → prioritize → passport → report → monitor

2. Add SBOM/SPDX + signing
   - Support SBOM ingestion and standardized artifact formats
   - Add signature, attestation, and provenance validation checks

## Phase 5 — UX and Commercial Readiness

1. Stabilize UI states
   - Add empty/loading/error/success states
   - Add explainability and glossary terminology
   - Surface exports for statements of work, first recommendation, and first passport

2. Narrow ICP and messaging
   - Align homepage and product language to one buyer segment
   - Stop supporting broad generic messaging until MVP clarity is established

3. Build go-to-market readiness
   - Track cost-to-date, running rate, and revenue signals
   - Document POC → renewal → expansion workflow

## Phase 6 — Scalable Platform

1. Broader analytics and scale workflows
   - Add CRM/ERP/Slack integration touchpoints
   - Add continuous memory and standards compliance hooks

2. Define done
   - Stable API
   - Real evidence
   - Real scoring
   - Real customers
   - Stable UX

## Immediate Repo Actions

- Validate and lock SPR workspace path logic in `lib/server/api-router.js`
- Strengthen restricted token validation in `lib/server/restricted-tokens.js`
- Harden passport workspace build logic in `lib/server/spr/passport.js`
- Update regression tests in `test/spr-mvp.js` for explicit workspace behavior
- Add audit and error visibility for missing/mismatched workspace failures

## Verification

- `node test/spr-mvp.js`
- targeted manual flow checks for missing workspace and token mismatch
- confirm no demo fallback executes in production API paths

## Next Pull Request Checklist — SPR Workspace Scoping Hardening

- [ ] Confirm all SPR production routes require explicit `workspaceId`
- [ ] Remove hidden `ctx.workspaceId` workspace fallback from SPR evidence and passport flows
- [ ] Validate restricted passport issuance rejects missing or mismatched workspace scope
- [ ] Tighten legacy restricted token workspace validation in `lib/server/restricted-tokens.js`
- [ ] Ensure evidence bundle and GitHub scan endpoints reject missing workspace
- [ ] Update and re-run `test/spr-mvp.js` to cover explicit workspace behavior
- [ ] Confirm audit/log visibility for workspace mismatch and restricted token failures
