VentureOS — Full File Structure (MSP Subsystem)

This document lists the recommended file/folder layout for the complete VentureOS MSP platform. Each path includes a short description of purpose and primary exported symbols.

Top-level
- README.md — project overview and run instructions
- package.json — dependencies and scripts
- vite.config.js, index.html, public/ — frontend build
- lib/server/ — backend services and engines
- src/ — frontend React app
- test/ — unit and integration tests
- ARCHIVE/ or docs/ — design and API docs

lib/server/
- api-router.js — central HTTP router; exports `handleApiRequest(req,res)`
- data-store.js — readDb/mutateDb, models: users, workspaces, msps, assets, passports, sessions, nodes, edges, coverageBaselines, riskBaselines; helpers: createId, createMsp, createWorkspaceForMsp, listWorkspacesForMsp, getMspById
- auth.js — session management, createSession, getSessionContext, requireAuth, requireMspMembership, assertMspRole, assertMspMode, validateCsrf
- billing.js — billing state machine, getMspBillingSummary, updateMspBillingState, computeMspHealthScore, generateMspExecutiveExport
- demo.js — generateDemoWorkspace, generateDemoMsp, generateDemoIntelligence, generateDemoExport
- onboarding.js — initializeWorkspacePack, createWorkspaceForMspAndInitialize, onboarding store helpers
- guided-setup.js — `guidedSetupSteps` registry, `getGuidedSetupProgress`, `performGuidedSetupAction`
- import/
  - asset-import.js — `assetImportEngine` (CSV/JSON import, normalization)
  - passport-import.js — `passportTemplateImport`
  - scan-import.js — `scanTemplateImport`
- graph-builder.js — normalizeAssetToNode, extractAssetRelationships, constructWorkspaceGraph, getWorkspaceGraph
- coverage.js — normalizeCoverageRules, evaluateCoverageForNode, computeWorkspaceCoverageBaseline, getCoverageBaseline
- risk.js — risk aggregation, getWorkspaceRiskData, computeRiskBaseline
- trust-graph.js — graph querying functions used by risk/coverage engines
- enforcement.js — evaluateWorkspaceTrust, integrity checks, enforcement rules application
- scoring.js — helpers for scoring, narratives
- export.js — generateWorkspaceExport, generateMspExecutiveExport wrappers (if separate from billing)
- utils/ — small utilities: csv-parsing, seeding, deterministic random, validation

src/
- App.jsx — application root + routing
- main.jsx — boot
- design-system/
  - theme.js — color tokens, typography tokens, spacing
  - components/
    - Button.jsx
    - Card.jsx
    - MetricCard.jsx
    - DistributionBar.jsx
    - Table/WorkspaceTable.jsx
    - GraphCanvas.jsx
    - NodeInspector.jsx
    - CoverageDial.jsx
    - CoverageGapList.jsx
    - RiskTimeline.jsx
    - StalenessList.jsx
    - StepList.jsx
    - UploadPanel.jsx
    - ExportCard.jsx
    - ModeBanner.jsx
- components/
  - layout/
    - Header.jsx
    - Sidebar.jsx
    - PageContainer.jsx
  - dashboard/
    - MspDashboard.jsx
    - WorkspaceDashboard.jsx
  - graph/
    - GraphView.jsx
    - GraphControls.jsx
  - onboarding/
    - OnboardingWizard.jsx
    - GuidedSetupSidebar.jsx
  - import/
    - ImportPanel.jsx
    - ImportStatus.jsx
  - reports/
    - ReportsPage.jsx
    - ExportModal.jsx
- screens/
  - MspDashboardScreen.jsx
  - WorkspaceScreen.jsx
  - GraphScreen.jsx
  - CoverageScreen.jsx
  - RiskScreen.jsx
  - TimelineScreen.jsx
  - ReportsScreen.jsx
  - ImportScreen.jsx
  - OnboardingScreen.jsx
  - DemoScreen.jsx
- api/
  - client.js — fetch wrappers for all API endpoints (session, msps, onboarding, graph, coverage, import, demo)
  - endpoints.js — central list of endpoint paths
- styles/
  - globals.css
  - layout.css

test/
- msp-onboarding.js — tests for `createWorkspaceForMsp`, `initializeWorkspacePack`, onboarding endpoints & guards
- guided-setup.js — tests for guided setup registry and actions
- workspace-import.js — tests for asset/passport/scan import
- workspace-graph.js — tests for normalization, extraction, construction
- workspace-coverage.js — rule normalization, node evaluation, baseline calculation
- msp-demo.js — demo endpoints (already present)

docs/
- API_MAP.md — detailed endpoints (use the API map as canonical)
- DESIGN_SYSTEM.md — color tokens, components reference
- ARCHITECTURE.md — high-level architecture diagram and module interaction

Notes on persistence and schema
- `readDb()` and `mutateDb()` are the single source of truth for tests; persist new collections: `nodes`, `edges`, `coverageBaselines`, `riskBaselines`, `assetCategories`, `passportTemplates`, `scanTemplates`, `coverageRules`, `enforcementRules`, `timelineEvents`, `onboardingRecords`, `importJobs`.

Testing and CI
- `npm test` runs node tests (e.g., `node test/*.js`)
- Tests must seed DB using `mutateDb` and clean up after run where needed

Next steps
- I can scaffold these files and minimal implementations for selected subsystems (onboarding, guided setup, import, graph, coverage). Choose which subsystem to scaffold first.

