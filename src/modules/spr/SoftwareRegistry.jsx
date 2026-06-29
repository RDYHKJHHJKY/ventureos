import { useEffect, useMemo, useState } from "react";
import SoftwareCard from "./SoftwareCard.jsx";
import SoftwareCreateForm from "./SoftwareCreateForm.jsx";
import SoftwareDetailPanel from "./SoftwareDetailPanel.jsx";
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
};

const styles = {
  shell: { display: "flex", flexDirection: "column", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 24, fontWeight: 700, color: C.text, margin: 0 },
  subtitle: { fontSize: 14, color: C.dim, marginTop: 4 },
  button: { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  body: { display: "grid", gridTemplateColumns: "minmax(320px, 40%) minmax(0, 60%)", gap: 16, alignItems: "start" },
  listPanel: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12, maxHeight: 720, overflow: "hidden" },
  list: { display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", paddingRight: 4 },
  empty: { padding: 16, border: `1px dashed ${C.border}`, borderRadius: 10, color: C.dim, fontSize: 13 },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 },
};

function useSoftwareRegistry() {
  const [software, setSoftware] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [softwareData, vendorData] = await Promise.all([
          apiJson("/api/spr/software"),
          apiJson("/api/spr/vendors"),
        ]);
        if (!alive) return;
        setSoftware(softwareData.software || []);
        setVendors(vendorData.vendors || []);
        setLoading(false);
      } catch (err) {
        if (!alive) return;
        setError(err.message || "Unable to load SPR registry data.");
        setLoading(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return { software, vendors, loading, error, refresh: () => setRefreshKey((value) => value + 1) };
}

export default function SoftwareRegistry() {
  const { software, vendors, loading, error, refresh } = useSoftwareRegistry();
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const sortedSoftware = useMemo(() => [...software].sort((a, b) => (a.name || "").localeCompare(b.name || "")), [software]);

  useEffect(() => {
    if (!selected && sortedSoftware.length) {
      setSelected(sortedSoftware[0]);
    }
  }, [selected, sortedSoftware]);

  const handleCreate = async (payload) => {
    try {
      setCreating(true);
      setFormError("");
      const response = await apiJson("/api/spr/software", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (response.software) {
        setShowCreate(false);
        setSelected(response.software);
        refresh();
      }
    } catch (err) {
      setFormError(err.message || "Unable to create software entry.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>SPR Software Catalog</h1>
          <p style={styles.subtitle}>Registered software identities with verified lineage and trust scores</p>
        </div>
        <button style={styles.button} onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close" : "Add Software"}</button>
      </div>

      {error ? <div style={{ ...styles.card, borderColor: C.red, color: C.red }}>{error}</div> : null}

      {showCreate ? (
        <div style={{ ...styles.card }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Create a software record</div>
          {formError ? <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{formError}</div> : null}
          <SoftwareCreateForm vendors={vendors} onCreate={handleCreate} onCancel={() => setShowCreate(false)} />
          {creating ? <div style={{ fontSize: 12, color: C.dim, marginTop: 8 }}>Saving…</div> : null}
        </div>
      ) : null}

      <div style={styles.body}>
        <div style={styles.listPanel}>
          <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Software list</div>
          {loading ? (
            <div style={styles.empty}>Loading software catalog…</div>
          ) : sortedSoftware.length === 0 ? (
            <div style={styles.empty}>No software records yet. Add the first one above.</div>
          ) : (
            <div style={styles.list}>
              {sortedSoftware.map((item) => (
                <SoftwareCard key={item.id} software={item} active={selected?.id === item.id} onSelect={setSelected} />
              ))}
            </div>
          )}
        </div>

        <SoftwareDetailPanel software={selected} />
      </div>
    </div>
  );
}
