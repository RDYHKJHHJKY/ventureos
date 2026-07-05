import React, { useEffect, useState } from "react";
import { apiJson } from "../api-client.js";

export default function EvidenceListPage({ onSelectAsset }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadAssets() {
      setLoading(true);
      setError(null);
      try {
        const payload = await apiJson("/api/spr/software");
        const software = payload.software || payload.assets || [];
        if (!cancelled) {
          setItems(Array.isArray(software) ? software : []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Unable to load evidence list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAssets();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="provenance-page-shell">
      <div className="provenance-summary-panel">
        <div className="summary-header">
          <div>
            <div className="summary-label">Evidence Browser</div>
            <h1>Verified evidence assets</h1>
          </div>
        </div>
        <p className="summary-copy">Browse software assets and inspect evidence provenance for every verified fact.</p>
      </div>

      {loading ? (
        <div className="provenance-empty-state">
          <div className="empty-title">Loading evidence browser</div>
          <div className="empty-copy">Fetching software assets and provenance summaries…</div>
        </div>
      ) : error ? (
        <div className="provenance-empty-state error-state">
          <div className="empty-title">Unable to load evidence browser</div>
          <div className="empty-copy">{error}</div>
        </div>
      ) : (
        <div className="asset-table">
          <div className="asset-table-row asset-table-header">
            <div>Asset</div>
            <div>Status</div>
            <div>Evidence records</div>
            <div>Verified provenance</div>
          </div>
          {items.map((asset) => {
            const evidence = Array.isArray(asset.evidence) ? asset.evidence : asset.evidenceItems || [];
            const provenanceCount = evidence.filter((fact) => Boolean((fact.provenance || {}).source) && Boolean((fact.provenance || {}).cryptographic_seal)).length;
            const assetStatus = asset.verdict || asset.status || "Unknown";
            const badgeClass = provenanceCount === evidence.length && evidence.length > 0 ? "badge-good" : evidence.length === 0 ? "badge-neutral" : "badge-warn";

            return (
              <button key={asset.id || asset.softwareId || asset.name} className="asset-table-row asset-row-button" onClick={() => onSelectAsset(asset.id || asset.softwareId || asset.name)}>
                <div>{asset.name || asset.assetName || asset.softwareName || asset.id}</div>
                <div>{assetStatus}</div>
                <div>{evidence.length}</div>
                <div><span className={`asset-badge ${badgeClass}`}>{provenanceCount}/{evidence.length}</span></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
