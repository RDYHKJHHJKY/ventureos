import { useEffect, useState } from "react";
import { apiJson } from "../api-client.js";

function createIncidentId() {
  return `incident-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function verifyFactProvenance(fact) {
  const provenance = fact.provenance || {};
  const source = provenance.source || provenance.source_url || fact.source || fact.source_url;
  const seal = provenance.cryptographic_seal || provenance.provenance_hash || provenance.evidence_hash || fact.provenance_hash || fact.evidence_hash;
  return Boolean(source && seal);
}

export function useAssetReport(assetId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assetId) {
      setData(null);
      setError({ code: "NO_ASSET", message: "Asset ID is required." });
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const payload = await apiJson("/api/spr/software");
        const software = Array.isArray(payload.software) ? payload.software : payload.assets || [];
        const report = software.find((item) => String(item.id || item.softwareId || item.name) === String(assetId));
        if (!report) {
          throw new Error("Asset not found.");
        }

        const evidence = Array.isArray(report.evidence) ? report.evidence : report.evidenceItems || report.evidenceList || [];
        const facts = evidence.map((fact) => {
          if (!verifyFactProvenance(fact)) {
            throw new Error(`Data integrity violation: Server returned facts without provenance. Incident: ${createIncidentId()}`);
          }
          return fact;
        });

        if (facts.length === 0) {
          const summary = report.summary || report.verdict || "No evidence facts were found for this asset.";
          setData({ report, facts: [], summary, assetName: report.name || report.assetName || report.softwareName || assetId });
        } else {
          setData({ report, facts, summary: report.summary || report.verdict || "Verified evidence report.", assetName: report.name || report.assetName || report.softwareName || assetId });
        }
      } catch (err) {
        const message = err.message || "Unable to load asset report.";
        if (!cancelled) setError({ code: "EVIDENCE_ERROR", message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadReport();

    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return { data, error, loading };
}
