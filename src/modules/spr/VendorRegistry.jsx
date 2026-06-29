import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../../shared/api/index.js";

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
  shell: { display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 24, fontWeight: 700, color: C.text, margin: 0 },
  subtitle: { fontSize: 14, color: C.dim, marginTop: 4 },
  button: { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 },
  item: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  name: { fontSize: 15, fontWeight: 700, color: C.text },
  meta: { fontSize: 12, color: C.dim },
  pill: (color) => ({ display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: color + "22", color, border: `1px solid ${color}44` }),
};

export default function VendorRegistry() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await apiJson("/api/spr/vendors");
        if (!alive) return;
        setVendors(response.vendors || []);
      } catch (err) {
        if (!alive) return;
        setError(err.message || "Unable to load vendor registry.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const content = useMemo(() => {
    if (loading) return <div style={styles.card}>Loading vendors…</div>;
    if (error) return <div style={{ ...styles.card, color: C.red }}>{error}</div>;
    if (!vendors.length) return <div style={styles.card}>No vendors have been registered yet.</div>;
    return (
      <div style={styles.grid}>
        {vendors.map((vendor) => (
          <div key={vendor.id} style={styles.item}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={styles.name}>{vendor.name}</div>
              <span style={styles.pill(C.green)}>Verified</span>
            </div>
            <div style={styles.meta}>{vendor.domain || "No domain"}</div>
            <div style={styles.meta}>{vendor.email || "No email"}</div>
            <div style={styles.meta}>{(vendor.complianceClaims || []).join(", ") || "No compliance claims"}</div>
          </div>
        ))}
      </div>
    );
  }, [error, loading, vendors]);

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Vendor Registry</h1>
          <p style={styles.subtitle}>Curated organizations and their verified software identities</p>
        </div>
        <button style={styles.button} onClick={() => window.location.reload()}>Refresh</button>
      </div>
      {content}
    </div>
  );
}
