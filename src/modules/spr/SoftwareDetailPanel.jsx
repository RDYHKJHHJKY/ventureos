import { useMemo, useState } from "react";
import { issuePassport } from "../../shared/api/index.js";

const C = {
  bg: "#000000",
  surface: "#0A0A0A",
  border: "#141414",
  text: "#F8F9FA",
  muted: "#B4B0AA",
  dim: "#8F8A84",
  accent: "#C9A86A",
  green: "#00C27A",
  yellow: "#C9A86A",
  red: "#C5302B",
  indigo: "#4753E6",
};

const styles = {
  panel: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    minHeight: 480,
  },
  title: { fontSize: 20, fontWeight: 700, color: C.text },
  subtitle: { fontSize: 13, color: C.dim, marginTop: 4 },
  section: { borderTop: `1px solid ${C.border}`, paddingTop: 12 },
  label: { fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 },
  value: { fontSize: 14, color: C.text, lineHeight: 1.45 },
  pill: (color) => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: color + "22", color, border: `1px solid ${color}44` }),
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
};

function scoreColor(score) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.yellow;
  return C.red;
}

export default function SoftwareDetailPanel({ software }) {
  const [passport, setPassport] = useState(null);
  const [loadingPassport, setLoadingPassport] = useState(false);
  const [passportError, setPassportError] = useState("");

  const evidenceSummary = useMemo(() => {
    const count = software?.score?.evidenceCount || 0;
    return count > 0 ? `${count} evidence record(s)` : "No evidence yet";
  }, [software?.score]);

  const handleIssuePassport = async () => {
    if (!software?.id) return;
    setLoadingPassport(true);
    setPassportError("");
    try {
      const response = await issuePassport(software.id);
      if (response.passport) setPassport(response.passport);
    } catch (error) {
      setPassportError(error.message || "Unable to issue passport.");
    } finally {
      setLoadingPassport(false);
    }
  };

  if (!software) {
    return (
      <div style={styles.panel}>
        <div style={styles.title}>Select a software record</div>
        <div style={styles.subtitle}>Choose a package from the list to inspect identity, evidence, and trust signals.</div>
      </div>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={styles.title}>{software.name}</div>
          <div style={styles.subtitle}>{software.vendor?.name || software.vendorName || "Unknown vendor"}</div>
        </div>
        <span style={styles.pill(scoreColor(software.score?.trustScore || 0))}>{software.score?.trustScore ?? "—"} trust</span>
      </div>

      <div style={styles.grid}>
        <div style={styles.section}>
          <div style={styles.label}>Identity</div>
          <div style={styles.value}>{software.packageName || software.name}</div>
        </div>
        <div style={styles.section}>
          <div style={styles.label}>Repository</div>
          <div style={styles.value}>{software.repositoryUrl || "No repository shared"}</div>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Evidence bundle summary</div>
        <div style={styles.value}>{evidenceSummary}</div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Monitoring signals</div>
        <div style={styles.value}>{software.score?.riskCategory || "No signals"}</div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Trust score breakdown</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <span style={styles.pill(C.indigo)}>Version {software.version || "—"}</span>
          <span style={styles.pill(C.green)}>Ecosystem {software.ecosystem || "unknown"}</span>
          <span style={styles.pill(C.yellow)}>Confidence {software.score?.confidenceScore ?? "—"}</span>
        </div>
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Passport actions</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <button type="button" onClick={handleIssuePassport} style={{ ...styles.pill(C.accent), background: C.accent + "22", border: `1px solid ${C.accent}44`, cursor: "pointer" }}>
            {loadingPassport ? "Issuing…" : "Generate Passport"}
          </button>
        </div>
        {passportError ? <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{passportError}</div> : null}
        {passport ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={styles.pill(scoreColor(passport.trustScore || 0))}>{passport.trustScore ?? "—"} score</span>
              <span style={styles.pill(C.indigo)}>{passport.riskCategory || "Unknown"}</span>
              <span style={styles.pill(C.green)}>{passport.issuedAt || "Issued"}</span>
            </div>
            <div style={styles.value}>{passport.evidenceSummary || "Passport created"}</div>
            <div style={{ fontSize: 12, color: C.muted }}>Version {passport.passportEnvelopeVersion || 1}</div>
          </div>
        ) : (
          <div style={styles.value}>Issue a passport to surface trust score, risk band, and evidence summary.</div>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.label}>Audit summary</div>
        <div style={styles.value}>Registry entry created {software.createdAt ? new Date(software.createdAt).toLocaleDateString() : "recently"}.</div>
      </div>
    </div>
  );
}
