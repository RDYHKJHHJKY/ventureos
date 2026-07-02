# SPR Architecture Reset Blueprint

## Objective

Reset VentureOS onto the core SPR model by anchoring the platform around:

1. Passport Envelope — the primary container
2. Evidence Bundles — the trusted inputs
3. Trust Score — the deterministic output

Everything else becomes support infrastructure once these three definitions are locked.

---

## 1. Core model definitions

### Passport Envelope
The passport envelope is the single object the platform issues and verifies.

It must include:
- passport `id`
- `softwareId` / product identity
- `vendorId`
- `softwareName` / `vendorName`
- `visibility` (`public` | `private` | `restricted`)
- `accessToken` when visibility is `restricted`
- `workspaceId`
- `scoringProfile`
- `evidenceIds`
- `trustGraphHash`
- `evidenceFreshnessHash`
- `passportEnvelopeVersion`
- `issuedAt`, `expiresAt`, `updatedAt`
- `issuedBy`
- `passportEnvelopeHash`
- `trustScore`, `confidenceScore`, `verdict`
- `evidenceSummary`
- optional `status`, `revoked`, `revokedAt`

This envelope is the authoritative trust artifact.

### Evidence Bundles
Evidence is the input feed to the passport.

Each evidence item must contain:
- `id`
- `softwareId`
- `vendorId`
- `type`
- `title` / `summary`
- `source`
- `uri`
- `freshnessDays`
- `verified` / verification metadata
- `visibility`
- `accessToken`
- `workspaceId`
- `strength`, `numericSignals`
- `payload` / raw artifact references
- derived `freshnessScore`, `completenessScore`, `isStale`

Evidence is normalized, hashed, and sorted before binding into passports.

### Trust Score
Trust score is the computed numeric output from the passport’s evidence, identity, and scoring profile.

It must be:
- deterministic
- profile-aware
- traceable to evidence and identity inputs
- auditable via score hashing
- surfaced in passport views as `trustScore` and `verdict`

The score is not a UI label. It is the platform’s output from the core model.

---

## 2. Reset build slices (rails)

The architecture should be split into these implementation-ready slices:

- Passport issuance slice
- Evidence ingestion slice
- Trust scoring slice
- Audit chain slice
- Selective disclosure slice
- Workspace-scoped views slice

These slices are the rails for all SPR work.

---

## 3. Trust-passport pipeline

The platform heartbeat is a strict pipeline:

1. Identity verification
2. Passport envelope creation
3. Evidence ingestion
4. Evidence hashing + chaining
5. Trust scoring
6. Passport view generation
7. Audit replay
8. Freshness enforcement

Each step is its own module and must produce a clear output for the next step.

---

## 4. Proposed module layout

### `lib/server/spr/identity.js`
Responsibilities:
- verify vendor identity
- verify software identity
- normalize identity metadata
- produce identity assertions for passport issuance

### `lib/server/spr/passport-envelope.js`
Responsibilities:
- construct the passport envelope
- normalize passport metadata
- compute `passportEnvelopeHash`
- sign/verify passport envelopes
- serialize passport for storage and API output

### `lib/server/spr/evidence.js`
Responsibilities:
- normalize evidence items
- validate evidence payloads
- enforce workspace-scoped evidence visibility
- compute evidence hashes
- bind evidence into passport envelopes

### `lib/server/spr/scoring.js`
Responsibilities:
- normalize scoring inputs
- compute deterministic trust scores
- apply profile weights and penalties
- compute confidence / completeness metrics
- expose a single scoring primitive for passports

### `lib/server/spr/audit.js`
Responsibilities:
- append immutable audit events
- compute audit hashes and audit chains
- replay passport lifecycle history
- audit trust-score changes and evidence updates

### `lib/server/spr/views.js`
Responsibilities:
- generate passport views for request context
- enforce selective disclosure rules
- derive workspace-scoped passport output
- build public, private, and restricted passport payloads

### `lib/server/spr/freshness.js`
Responsibilities:
- compute freshness degradation
- enforce stale evidence penalties
- trigger passport refresh or downgrade conditions

---

## 5. Current repo mapping

### Existing files that already contain SPR logic
- `lib/server/passport-assembler.js` — passport envelope binding, evidence binding, hash creation, score compute wrapper.
- `lib/server/trust-score.js` — scoring engine and deterministic score computation.
- `lib/server/audit-chain.js` — audit event chaining and verification.
- `lib/server/audit-replay.js` — replaying audit state and history.
- `lib/server/passport-verifier.js` — passport verification and evidence verification logic.
- `lib/server/evidence-pipeline.js` — evidence normalization and ingest utilities.
- `lib/server/freshness.js` — freshness scoring and enforcement.
- `lib/server/api-router.js` — endpoint routing for SPR flows and workspace access control.

### Suggested boundary changes
Current logic is present but mixed in `api-router.js`. To reset the architecture:
- keep `api-router.js` as HTTP glue only
- move SPR business logic into the `lib/server/spr/` modules above
- keep `data-store.js` as persistence and shape helpers
- keep `auth.js` and workspace guards separate from SPR logic

---

## 6. Architecture blueprint: data flow

### 1. Identity verification
Input:
- vendor metadata
- software identity metadata
- optional external identity sources

Output:
- normalized identity object
- verified identity claims

### 2. Passport envelope creation
Input:
- identity object
- evidence list
- workspace context
- visibility settings

Output:
- passport envelope draft
- `trustGraphHash`
- `evidenceFreshnessHash`
- `passportEnvelopeHash`

### 3. Evidence ingestion
Input:
- raw evidence submission
- copied evidence from external tools
- workspace-bound evidence

Output:
- normalized evidence records
- evidence hashes
- `freshnessScore`
- `verificationStatus`

### 4. Evidence hashing + chaining
Input:
- evidence list attached to passport

Output:
- deterministic evidence hash bundles
- chained fingerprints used by `passportEnvelopeHash`

### 5. Trust scoring
Input:
- normalized passport draft
- normalized evidence list
- scoring profile

Output:
- `trustScore`
- `confidenceScore`
- `verdict`
- score metadata for audit

### 6. Passport view generation
Input:
- passport envelope
- request context
- workspace role and scope

Output:
- API-ready passport view
- selective disclosure of restricted/private fields
- public passport summary or full output

### 7. Audit replay
Input:
- audit log entries

Output:
- replayable history timeline
- proof of passport evolution and score changes

### 8. Freshness enforcement
Input:
- evidence freshness values
- passport expiry rules

Output:
- stale evidence signals
- passport status downgrade triggers
- expiry warnings or auto-expiry events

---

## 7. Implementation rails

### Minimum viable SPR core
Build the core flow first:
- create/update passport
- attach evidence
- compute score
- publish passport view
- append audit event
- verify envelope hash
- return workspace-scoped response

### Do not build until these are clear
- multi-tenant UI scenarios
- advanced dashboards
- external integrations
- marketing copy

Those are noise until the passport pipeline is locked.

---

## 8. Recommended next steps

1. Extract the existing `passport-assembler`, `trust-score`, `audit-chain`, `audit-replay`, and `passport-verifier` logic into dedicated `lib/server/spr/` modules.
2. Keep `api-router.js` strictly as endpoint routing and workspace/role guard glue.
3. Define a canonical `PassportEnvelope` JSON contract and use it for all SPR APIs.
4. Implement `selective disclosure` in `lib/server/spr/views.js` and make every passport endpoint pass through it.
5. Add a small regression test for the pipeline:
   - create passport
   - attach evidence
   - compute score
   - verify envelope hash
   - replay audit history

---

## 9. Why this reset works

This reset removes ambiguity by treating SPR as a pipeline, not a dashboard.

- `Passport Envelope` becomes the primary artifact.
- `Evidence Bundles` are the inputs that determine score.
- `Trust Score` is the output that proves the system is working.

Once that model is locked, all other product features align naturally.
