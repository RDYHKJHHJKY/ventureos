VentureOS — Complete File Tree (Backend + React Frontend)

This manifest lists every recommended file for the full MSP subsystem and matching React UI. Use this to scaffold the repository.

Root
- package.json
- README.md
- vite.config.js
- index.html
- tsconfig.json
- .env.example

Server (backend) — lib/server/
- api-router.js
- data-store.js
- auth.js
- billing.js
- demo.js
- onboarding.js
- guided-setup.js
- graph-builder.js
- coverage.js
- risk.js
- trust-graph.js
- enforcement.js
- import/asset-import.js
- import/passport-import.js
- import/scan-import.js
- export.js
- scoring.js
- integrity.js
- utils/csv.js
- utils/seed.js
- utils/validation.js
- utils/deterministic-rng.js
- middleware/validate-signature.js
- middleware/error-handler.js

Server tests
- test/msp-onboarding.js
- test/guided-setup.js
- test/workspace-import.js
- test/workspace-graph.js
- test/workspace-coverage.js
- test/msp-demo.js

Server persistence (DB file)
- .data/ventureos-db.json (created by runtime)

Frontend — src/
- app/
  - App.tsx
  - routes.tsx
  - providers/
    - QueryProvider.tsx
    - ThemeProvider.tsx
    - SessionProvider.tsx
- layout/
  - MainLayout.tsx
  - MspLayout.tsx
  - WorkspaceLayout.tsx
- modules/
  - msp/
    - MspDashboardPage.tsx
    - MspHeader.tsx
    - MspMetricsGrid.tsx
    - MspWorkspaceTable.tsx
    - MspExecutiveSummaryPanel.tsx
    - MspAlertsPanel.tsx
    - MspBillingPanel.tsx
    - hooks/useMsp.ts
    - services/msp.ts
  - workspace/
    - WorkspaceDashboardPage.tsx
    - WorkspaceHeader.tsx
    - WorkspaceMetricsGrid.tsx
    - WorkspaceTabs.tsx
    - hooks/useWorkspace.ts
    - services/workspace.ts
  - graph/
    - GraphPage.tsx
    - GraphCanvas.tsx
    - GraphControls.tsx
    - GraphNodeInspector.tsx
    - GraphLegend.tsx
    - hooks/useGraph.ts
    - services/graph.ts
  - coverage/
    - CoveragePage.tsx
    - CoverageScoreDial.tsx
    - CoverageDistributionBar.tsx
    - CoverageGapList.tsx
    - CoverageCriticalBanner.tsx
    - hooks/useCoverage.ts
    - services/coverage.ts
  - risk/
    - RiskPage.tsx
    - RiskScoreCard.tsx
    - RiskEventTimeline.tsx
    - RiskClusterMap.tsx
    - hooks/useRisk.ts
    - services/risk.ts
  - staleness/
    - StalenessPage.tsx
    - StalenessScoreCard.tsx
    - ActivityTimeline.tsx
    - AgingAssetList.tsx
    - hooks/useStaleness.ts
    - services/staleness.ts
  - onboarding/
    - OnboardingPage.tsx
    - GuidedSetupPage.tsx
    - SetupStepList.tsx
    - SetupStepCard.tsx
    - SetupCompletionBanner.tsx
    - hooks/useOnboarding.ts
    - services/onboarding.ts
  - import/
    - ImportPage.tsx
    - UploadPanel.tsx
    - ImportStatusPanel.tsx
    - hooks/useImport.ts
    - services/import.ts
  - reports/
    - ReportsPage.tsx
    - ReportSection.tsx
    - DeltaIndicator.tsx
    - ReportCharts.tsx
    - hooks/useReports.ts
    - services/reports.ts
  - export/
    - ExportPage.tsx
    - ExportCard.tsx
    - hooks/useExport.ts
    - services/export.ts
  - demo/
    - DemoPage.tsx
    - DemoBanner.tsx
    - DemoWorkspaceList.tsx
    - DemoExecutivePanel.tsx
    - DemoIntelligencePanel.tsx
    - DemoExportPanel.tsx
    - hooks/useDemo.ts
    - services/demo.ts
  - billing/
    - ModeBanner.tsx
    - RestrictionOverlay.tsx
    - hooks/useBillingMode.ts
    - services/billing.ts
- shared/
  - ui/
    - Button.tsx
    - Card.tsx
    - MetricCard.tsx
    - DistributionBar.tsx
    - Table/
      - Table.tsx
      - WorkspaceTable.tsx
    - Modal.tsx
    - Toast.tsx
    - Tooltip.tsx
    - Spinner.tsx
    - EmptyState.tsx
    - ErrorState.tsx
  - design-system/
    - theme.ts
    - tokens.css
    - typography.css
    - layout.css
    - colors.css
  - hooks/
    - useApi.ts
    - useSession.ts
    - usePolling.ts
  - api/
    - client.ts
    - endpoints.ts
  - types/
    - index.ts
    - msp.ts
    - workspace.ts
    - graph.ts
    - coverage.ts
    - risk.ts
    - onboarding.ts
    - import.ts
    - export.ts

Frontend tests
- src/__tests__/MspDashboard.test.tsx
- src/__tests__/WorkspaceDashboard.test.tsx
- src/__tests__/GraphCanvas.test.tsx
- src/__tests__/Coverage.test.tsx

Storybook (optional)
- .storybook/main.js
- .storybook/preview.js
- stories/
  - Button.stories.tsx
  - MetricCard.stories.tsx
  - GraphCanvas.stories.tsx

Build artifacts
- dist/

Devops / CI
- .github/workflows/ci.yml
- scripts/
  - start-dev.sh
  - test.sh

Notes
- Each `services/*.ts` file maps directly to backend endpoints defined in `api-router.js` and returns typed payloads matching `shared/types/`.
- Tests should use `mutateDb` from `lib/server/data-store.js` to seed and verify backend state.
- The server and client share `types/` definitions for alignment; consider generating types from a single source if desired.


What I will do next if you confirm:
- Scaffold component code templates for core design-system primitives and one screen (e.g., `MspDashboardPage` + `WorkspaceDashboardPage`).
- Or generate the typed API client (`shared/api/*` and `lib/server` route stubs) instead.

Choose: "scaffold components" or "generate API client". (I'll start with the chosen task.)
