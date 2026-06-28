VentureOS — React Component Architecture

Purpose: definitive component map for the VentureOS UI that aligns with the backend MSP subsystem. Use this doc to implement the React codebase under `src/`.

Guidelines
- All components are functional React + hooks.
- Styling: CSS Modules or Tailwind utility classes; central tokens in `design-system/theme.js`.
- All API calls use `src/api/client.js` hooks (`useSession`, `useMsp`, `useWorkspace`, etc.).
- Components are split into `design-system/` (primitives & tokens), `components/` (composed UI), and `screens/` (page containers).

Top-level pages (screens)
- `MspDashboardScreen` (/msp/:mspId)
  - Shows executive grid, top issues, workspace table, intelligence widgets
- `WorkspaceScreen` (/workspace/:workspaceId)
  - Tabs: Overview, Graph, Coverage, Risk, Timeline, Reports, Exports
- `GraphScreen` (/workspace/:id/graph)
- `CoverageScreen` (/workspace/:id/coverage)
- `RiskScreen` (/workspace/:id/risk)
- `TimelineScreen` (/workspace/:id/timeline)
- `ReportsScreen` (/workspace/:id/report)
- `ImportScreen` (/workspace/:id/import)
- `OnboardingScreen` (/msp/:id/onboard and workspace onboarding)
- `DemoScreen` (/demo)

Design system (src/design-system)
- `theme.js` — exports colors, spacing, typography tokens
- `Button.jsx` — props: `variant`('primary','secondary','ghost'), `size`, `onClick`, `disabled`
- `Card.jsx` — container with header/footer slots
- `MetricCard.jsx` — props: `title`, `value`, `trend`, `statusColor`
- `DistributionBar.jsx` — `segments: [{label, value, color}]`
- `Table/WorkspaceTable.jsx` — columns: Workspace, Health, Coverage, Risk, Staleness, Last Scan
- `Modal.jsx`, `Toast.jsx`, `Tooltip.jsx`
- `Icon/*` — generic icon set
- `GraphCanvas.jsx` — wraps graph renderer (e.g., cytoscape or visx), props: `nodes`, `edges`, `onNodeClick`, `onEdgeHover`
- `NodeInspector.jsx` — shows node details, passports, scans, relationships
- `CoverageDial.jsx` — circular gauge component, `score` prop
- `CoverageGapList.jsx` — list of missing passports/scans/fields
- `RiskTimeline.jsx` — event list with severity coloring
- `StepList.jsx` — guided setup step list
- `UploadPanel.jsx` — drag-n-drop with file validation

Components (src/components)
- layout/
  - `Header.jsx` — top nav with MSP selector, user menu
  - `Sidebar.jsx` — left navigation (MSP → Workspace → Intelligence → Graph → ...)
  - `PageContainer.jsx` — base page wrapper
- dashboard/
  - `ExecutiveGrid.jsx` — 2x3 grid of MetricCards
  - `TopIssues.jsx` — list of critical issues with quick actions
  - `WorkspaceTablePanel.jsx` — wraps `WorkspaceTable` with filters
  - `IntelligenceWidgets.jsx` — risk/staleness/coverage mini-cards
- graph/
  - `GraphView.jsx` — combines `GraphCanvas`, `GraphControls`, `NodeInspector`
  - `GraphControls.jsx` — zoom, center, toggle categories
- coverage/
  - `CoverageOverview.jsx` — score summary, distribution bar, gap list
  - `CoverageDetails.jsx` — per-node coverage list and filters
- risk/
  - `RiskOverview.jsx` — aggregated risk counts and timeline
  - `RiskDetails.jsx`
- onboarding/
  - `OnboardingWizard.jsx` — orchestrates steps, calls backend endpoints
  - `GuidedSetupSidebar.jsx` — shows progress and next actions
  - `StepCard.jsx` — individual step action card
- import/
  - `ImportPanel.jsx` — CSV/JSON upload UI
  - `ImportStatus.jsx` — progress and errors
- reports/
  - `ReportsPage.jsx` — report chooser + chart canvas
  - `ExportCard.jsx` — export types and download actions
- demo/
  - `DemoBanner.jsx` — show demo mode
  - `DemoWorkspaceList.jsx`

API hooks (src/api)
- `client.js` — fetch wrapper with `get`, `post`, `put`, `delete` and `useFetch` hook
- `hooks/useSession.js` — return session context, `refreshSession()`
- `hooks/useMsps.js` — list MSPS, get MSP summary
- `hooks/useWorkspaces.js` — list workspaces for MSP, workspace overview
- `hooks/useGraph.js` — build graph, get graph status, poll
- `hooks/useCoverage.js` — build baseline, get coverage status
- `hooks/useImport.js` — upload assets/passports/scans, get import status
- `hooks/useOnboarding.js` — start onboard, get onboarding status
- `hooks/useGuidedSetup.js` — get steps and perform actions

Routing and navigation
- `App.jsx` uses React Router.
- Top-level routes:
  - `/auth/*` — login/signup
  - `/msps` — MSP list
  - `/msp/:mspId` — MSP dashboard
  - `/workspace/:workspaceId/*` — workspace tabs
  - `/demo` — demo pages
- Navigation components call `useHistory()` and `useParams()`.

Accessibility
- All interactive elements keyboard accessible.
- Use ARIA roles for graph canvas, tooltips, modals.

Testing
- Component tests use React Testing Library + vitest (or Jest)
- Storybook recommended for visual QA (stories for each design-system component)

Implementation plan (order)
1. Implement `design-system/theme.js` and base primitives (`Button`, `Card`, `MetricCard`).
2. Implement `PageContainer`, `Header`, `Sidebar`.
3. Implement `ExecutiveGrid`, `WorkspaceTable`, `DistributionBar`.
4. Implement `GraphCanvas` + `GraphView` integration (stubbed nodes/edges).
5. Implement onboarding screens + `OnboardingWizard` wiring to `useOnboarding`.
6. Implement import screens & `ImportPanel`.
7. Implement coverage and risk screens.
8. Polish and connect hooks to real backend endpoints.

Deliverables I will create next (if you want):
- Scaffold `src/design-system` with `theme.js`, `Button.jsx`, `Card.jsx`, `MetricCard.jsx`, `GraphCanvas.jsx` placeholders.
- Scaffold `src/components/layout` and `src/screens` with entry points.

Choose: scaffold the component files now, or produce Storybook-ready component stubs?