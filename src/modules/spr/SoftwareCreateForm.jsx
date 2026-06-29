import { useState } from "react";

const C = {
  bg: "#000000",
  surface: "#0A0A0A",
  border: "#141414",
  text: "#F8F9FA",
  muted: "#B4B0AA",
  dim: "#8F8A84",
  accent: "#C9A86A",
  green: "#00C27A",
  indigo: "#4753E6",
};

const styles = {
  form: { display: "flex", flexDirection: "column", gap: 12 },
  input: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.text,
    padding: "10px 12px",
    fontSize: 13,
    fontFamily: "inherit",
  },
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  button: { background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  hint: { fontSize: 12, color: C.dim },
};

export default function SoftwareCreateForm({ vendors = [], onCreate, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    vendorId: vendors[0]?.id || "",
    repositoryUrl: "",
    packageName: "",
    version: "",
    ecosystem: "npm",
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onCreate?.({ ...form });
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <div style={styles.row}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Software name</span>
          <input required style={styles.input} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Example software" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Vendor</span>
          <select required style={styles.input} value={form.vendorId} onChange={(event) => setForm((current) => ({ ...current, vendorId: event.target.value }))}>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div style={styles.row}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Repository URL</span>
          <input style={styles.input} value={form.repositoryUrl} onChange={(event) => setForm((current) => ({ ...current, repositoryUrl: event.target.value }))} placeholder="https://github.com/example/repo" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Package name</span>
          <input style={styles.input} value={form.packageName} onChange={(event) => setForm((current) => ({ ...current, packageName: event.target.value }))} placeholder="@scope/package" />
        </label>
      </div>
      <div style={styles.row}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Version</span>
          <input style={styles.input} value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} placeholder="1.2.3" />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={styles.hint}>Ecosystem</span>
          <input style={styles.input} value={form.ecosystem} onChange={(event) => setForm((current) => ({ ...current, ecosystem: event.target.value }))} placeholder="npm" />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={onCancel} style={{ ...styles.button, background: "transparent", border: `1px solid ${C.border}`, color: C.text }}>
          Cancel
        </button>
        <button type="submit" style={styles.button}>Add software</button>
      </div>
    </form>
  );
}
