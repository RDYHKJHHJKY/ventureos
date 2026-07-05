import React from "react";

function formatIso(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function compactUrl(url) {
  if (!url) return "";
  return url.length > 60 ? `${url.slice(0, 40)}…${url.slice(-18)}` : url;
}

export default function VerifiedFact({ fact, assetName }) {
  const provenance = fact.provenance || {};
  const source = provenance.source || provenance.source_url || fact.source || fact.source_url;
  const seal = provenance.cryptographic_seal || provenance.provenance_hash || provenance.evidence_hash || fact.provenance_hash || fact.evidence_hash;

  if (!source || !seal) {
    return null;
  }

  const hasFactData = Boolean(fact.summary || fact.value || fact.status || fact.verificationStatus || fact.title);
  const title = fact.title || fact.name || "Security fact";
  const status = String(fact.verificationStatus || fact.status || fact.verification || "").toLowerCase();
  const verified = status === "verified" || status === "trusted" || status === "compliant";
  const badgeText = verified ? "COMPLIANT" : hasFactData ? "VERIFIED" : "NO DATA";
  const badgeType = verified ? "good" : hasFactData ? "warn" : "neutral";

  return (
    <article className="verified-fact-card">
      <div className="fact-card-header">
        <span className={`fact-badge ${badgeType}`}>[{badgeText}]</span>
        <div className="fact-title-group">
          <h2 className="fact-title">{title}</h2>
          <div className="fact-subtitle">Asset: {assetName || fact.assetName || "unknown"}</div>
        </div>
      </div>

      <div className="fact-body">
        {hasFactData ? (
          <div className="fact-value">{fact.summary || fact.value || "No recorded evidence details."}</div>
        ) : (
          <div className="fact-empty-state">
            <div className="empty-icon">⚠️</div>
            <div>
              <strong>No data recorded</strong>
              <p>This is not a default — it means no scanner has reported a status.</p>
            </div>
          </div>
        )}

        <div className="provenance-panel">
          <div className="provenance-header">🔐 Verified Origin</div>
          <div className="provenance-row">
            <span>Source:</span>
            <a className="source-link" href={source} target="_blank" rel="noreferrer">
              {compactUrl(source)}
            </a>
          </div>
          <div className="provenance-row">
            <span>Discovered By:</span>
            <span>{provenance.discovered_by || provenance.discoveredBy || "unknown"}</span>
          </div>
          <div className="provenance-row">
            <span>Cryptographic Seal:</span>
            <span className="seal">{seal}</span>
          </div>
          <div className="provenance-row">
            <span>Observed At:</span>
            <span>{formatIso(provenance.timestamp || provenance.observed_at || provenance.observedAt)}</span>
          </div>
          <div className="provenance-row">
            <span>Ingested By:</span>
            <span>{provenance.ingested_by || provenance.ingestedBy || "unknown"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
