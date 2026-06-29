import { useMemo } from "react";

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
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    cursor: "pointer",
    transition: "border-color 0.15s ease, transform 0.15s ease",
  },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { fontSize: 15, fontWeight: 700, color: C.text },
  meta: { fontSize: 12, color: C.dim },
  pill: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    background: color + "22",
    color,
    border: `1px solid ${color}44`,
    alignSelf: "flex-start",
  }),
  link: { color: C.accent, fontSize: 12, textDecoration: "none" },
};

function scoreColor(score) {
  if (score >= 75) return C.green;
  if (score >= 50) return C.yellow;
  return C.red;
}

export default function SoftwareCard({ software, active, onSelect }) {
  const repoLabel = useMemo(() => {
    if (!software.repositoryUrl) return "No repository";
    return software.repositoryUrl.replace(/^https?:\/\//, "");
  }, [software.repositoryUrl]);

  return (
    <button
      type="button"
      onClick={() => onSelect(software)}
      style={{
        ...styles.card,
        borderColor: active ? C.accent : C.border,
        transform: active ? "translateY(-1px)" : "none",
        textAlign: "left",
        color: C.text,
      }}
    >
      <div style={styles.row}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.title}>{software.name || "Unnamed software"}</div>
          <div style={styles.meta}>{software.vendor?.name || software.vendorName || "Unknown vendor"}</div>
        </div>
        <span style={styles.pill(scoreColor(software.score?.trustScore || 0))}>{software.score?.trustScore ?? "—"}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={styles.pill(C.indigo)}>{software.vendor?.name ? "Vendor" : "Unverified"}</span>
        <span style={styles.pill(C.yellow)}>{software.ecosystem || "unknown"}</span>
        <span style={styles.pill(C.green)}>{software.version || "—"}</span>
      </div>
      <a href={software.repositoryUrl || "#"} target="_blank" rel="noreferrer" style={styles.link}>
        {repoLabel}
      </a>
      <div style={styles.meta}>Trust {software.score?.riskCategory || "Unknown"}</div>
    </button>
  );
}
