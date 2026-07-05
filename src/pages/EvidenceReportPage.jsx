import React from "react";
import VerifiedFact from "../components/VerifiedFact.jsx";
import { useAssetReport } from "../hooks/useAssetReport.js";

export default function EvidenceReportPage({ assetId, onBack }) {
  const { data, error, loading } = useAssetReport(assetId);

  if (loading) {
    return (
      <div className="provenance-page-shell">
        <div className="provenance-empty-state">
          <div className="empty-title">Loading evidence report</div>
          <div className="empty-copy">Fetching verified evidence and provenance details…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="provenance-page-shell">
        <div className="provenance-empty-state error-state">
          <div className="empty-title">⚠️ Evidence Error</div>
          <div className="empty-copy">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="provenance-page-shell">
        <div className="provenance-empty-state">
          <div className="empty-title">🔍 Asset Not Found</div>
          <div className="empty-copy">The requested software asset does not exist in the verified registry layer.</div>
        </div>
      </div>
    );
  }

  const { facts, summary, assetName, report } = data;
  const complianceState = report?.verdict || report?.status || "Verified evidence";
  const complianceBadge = String(complianceState).toUpperCase();

  return (
    <div className="provenance-page-shell">
      <div className="provenance-summary-panel">
        <div className="summary-header">
          <div>
            <div className="summary-label">Evidence Report</div>
            <h1>{assetName}</h1>
          </div>
          <button className="summary-back-button" onClick={onBack}>Back to evidence list</button>
        </div>
        <div className="summary-grid">
          <div className="summary-card">
            <span className="summary-card-title">Compliance Summary</span>
            <div className="summary-card-value">{complianceBadge}</div>
            <p>{summary}</p>
          </div>
          <div className="summary-card">
            <span className="summary-card-title">Provenance Assurance</span>
            <p>All facts shown here were verified to include provenance source and cryptographic seal information.</p>
          </div>
        </div>
      </div>

      <div className="fact-list-grid">
        {facts.length === 0 ? (
          <div className="provenance-empty-state">
            <div className="empty-title">No evidence records found</div>
            <div className="empty-copy">This asset exists, but no evidence facts were reported with provenance.</div>
          </div>
        ) : (
          facts.map((fact) => (
            <VerifiedFact key={fact.id || fact.factId || fact.title || fact.source || fact.provenance?.cryptographic_seal} fact={fact} assetName={assetName} />
          ))
        )}
      </div>
    </div>
  );
}
