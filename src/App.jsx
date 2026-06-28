import { useEffect, useState, useRef } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:        "#0A0C10",
  surface:   "#0F1318",
  border:    "#1C2230",
  borderLit: "#2A3448",
  text:      "#E8EDF5",
  muted:     "#5A6478",
  dim:       "#8B96AA",
  accent:    "#3B7BF5",
  accentDim: "#1A3A7A",
  green:     "#22C55E",
  yellow:    "#EAB308",
  red:       "#EF4444",
  orange:    "#F97316",
  indigo:    "#818CF8",
};

const styles = {
  app: {
    background: C.bg,
    color: C.text,
    minHeight: "100vh",
    fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  nav: {
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    padding: "0 24px",
    display: "flex",
    alignItems: "center",
    height: 56,
    gap: 32,
    position: "sticky",
    top: 0,
    zIndex: 100,
  },
  logo: {
    fontWeight: 700,
    fontSize: 16,
    letterSpacing: "-0.02em",
    color: C.text,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logoMark: {
    width: 24,
    height: 24,
    background: `linear-gradient(135deg, ${C.accent}, ${C.indigo})`,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 800,
    color: "#fff",
  },
  navLink: (active) => ({
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? C.text : C.dim,
    cursor: "pointer",
    padding: "4px 0",
    borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
    transition: "all 0.15s",
  }),
  main: {
    flex: 1,
    display: "flex",
  },
  sidebar: {
    width: 220,
    background: C.surface,
    borderRight: `1px solid ${C.border}`,
    padding: "16px 0",
    flexShrink: 0,
  },
  sideItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? C.text : C.dim,
    cursor: "pointer",
    background: active ? C.accentDim + "44" : "transparent",
    borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
    transition: "all 0.15s",
  }),
  content: {
    flex: 1,
    padding: 28,
    overflow: "auto",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: 20,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 12,
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    background: color + "22",
    color: color,
    border: `1px solid ${color}44`,
  }),
  btn: (variant = "primary") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    transition: "all 0.15s",
    background: variant === "primary" ? C.accent : variant === "ghost" ? "transparent" : C.border,
    color: variant === "primary" ? "#fff" : variant === "ghost" ? C.dim : C.text,
    outline: "none",
  }),
  input: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 14,
    color: C.text,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
};

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie.split(";").find((item) => item.trim().startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=")[1] || "") : "";
}

function getCsrfToken() {
  return getCookie("ventureos_csrf");
}

function getAppOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return import.meta.env.VITE_PUBLIC_APP_URL || "";
}

function buildAssetId(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash.toString(36).padStart(8, "0");
}

function buildBadgeEmbed(assetId) {
  const origin = getAppOrigin().replace(/\/$/, "");
  if (!origin) return `<script src="/api/badge.js" data-asset="${assetId}"></script>`;
  return `<script src="${origin}/api/badge.js" data-asset="${assetId}"></script>`;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}
function buildNarrative(asset, r) {
  const mediumFindings = r.findings.filter((f) => f.severity === "medium").map((f) => f.title);
  return `${asset || "This asset"} is conditionally trusted with a ${r.trust}/100 trust score and ${r.confidence}% confidence. Engineering and product signals are strong, led by active maintainers and a healthy release profile. The verdict remains conditional because ${mediumFindings.join(" and ").toLowerCase()} need remediation before unrestricted production use.`;
}

async function apiJson(path, options = {}) {
  const opts = { ...options };
  const workspaceId = opts.workspaceId || (typeof window !== "undefined" ? window.__VENTUREOS_WORKSPACE_ID__ : null);
  delete opts.workspaceId;
  const headers = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const method = (opts.method || "GET").toUpperCase();
  if (method !== "GET") {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
  }
  if (workspaceId) {
    headers["x-workspace-id"] = workspaceId;
  }
  const response = await fetch(path, {
    credentials: "include",
    ...opts,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || "VentureOS API request failed.");
  return payload;
}

function timeAgo(value) {
  if (!value) return "Never";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
// ── Score ring ─────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 80, label, color }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const ringColor = color || (score >= 75 ? C.green : score >= 50 ? C.yellow : C.red);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          style={{ fill: C.text, fontSize: size * 0.22, fontWeight: 700, transform: `rotate(90deg)`, transformOrigin: "center" }}>
          {score}
        </text>
      </svg>
      {label && <span style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>{label}</span>}
    </div>
  );
}

// ── Evidence item ──────────────────────────────────────────────────────────
function EvidenceItem({ icon, label, value, status }) {
  const color = status === "good" ? C.green : status === "warn" ? C.yellow : status === "bad" ? C.red : C.dim;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.dim }}>{icon} {label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

// ── Progress bar ───────────────────────────────────────────────────────────
function ProgressBar({ value, color, label, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color || (pct >= 75 ? C.green : pct >= 50 ? C.yellow : C.red);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.dim }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: c }}>{value}</span>
      </div>
      <div style={{ height: 4, background: C.border, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: c, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ onAnalyze }) {
  const [assets, setAssets] = useState([]);
  const [scans, setScans] = useState([]);
  const [passports, setPassports] = useState([]);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    let alive = true;
    async function loadDashboard() {
      try {
        const [assetData, scanData, passportData] = await Promise.all([
          apiJson("/api/assets"),
          apiJson("/api/scans"),
          apiJson("/api/passports"),
        ]);
        if (!alive) return;
        setAssets(assetData.assets || []);
        setScans(scanData.scans || []);
        setPassports(passportData.passports || []);
        setLoadState("ready");
      } catch {
        if (alive) setLoadState("fallback");
      }
    }
    loadDashboard();
    return () => { alive = false; };
  }, []);

  const fallbackScans = [
    { assetName: "stripe/stripe-js", trustScore: 84, risk: "Low", status: "completed", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { assetName: "vercel/next.js", trustScore: 91, risk: "Low", status: "completed", createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() },
    { assetName: "openai/openai-node", trustScore: 73, risk: "Medium", status: "completed", createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
  ];
  const recentScans = (scans.length ? scans : fallbackScans).slice(0, 5);
  const assetCount = assets.length || 47;
  const avgScore = assets.length ? Math.round(assets.reduce((sum, a) => sum + (a.trust || 0), 0) / assets.length) : 72;
  const activeAlerts = assets.filter((a) => ["High", "Critical"].includes(a.risk)).length || 6;
  const passportCount = passports.length || 31;
  const riskColor = (r) => r === "Low" ? C.green : r === "Medium" ? C.yellow : r === "High" ? C.orange : C.red;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Software trust intelligence overview</p>
      </div>

      {loadState === "fallback" && (
        <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>
          API unavailable. Showing fallback portfolio data until the backend responds.
        </div>
      )}

      <div className="metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Assets Analyzed", value: loadState === "loading" ? "..." : assetCount, sub: "persisted registry", color: C.accent },
          { label: "Avg Trust Score", value: loadState === "loading" ? "..." : avgScore, sub: "from latest scans", color: C.green },
          { label: "Active Alerts", value: activeAlerts, sub: "risk-derived queue", color: C.red },
          { label: "Passports Issued", value: passportCount, sub: "server records", color: C.indigo },
        ].map((s) => (
          <div key={s.label} style={{ ...styles.card }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={styles.cardTitle}>Recent Analyses</div>
            <button style={styles.btn("ghost")} onClick={onAnalyze}>+ New Analysis</button>
          </div>
          <div className="table-scroll"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Asset", "Trust Score", "Risk", "Status", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: 11, color: C.muted, fontWeight: 600, padding: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentScans.map((s) => (
                <tr key={s.id || s.assetName} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 500 }}>{s.assetName}</td>
                  <td style={{ padding: "12px 0" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: s.trustScore >= 75 ? C.green : s.trustScore >= 50 ? C.yellow : C.red }}>{s.trustScore}</span>
                  </td>
                  <td style={{ padding: "12px 0" }}><span style={styles.badge(riskColor(s.risk))}>{s.risk}</span></td>
                  <td style={{ padding: "12px 0", fontSize: 12, color: C.dim }}>{timeAgo(s.createdAt)}</td>
                  <td style={{ padding: "12px 0" }}><span style={{ fontSize: 12, color: C.accent }}>Persisted</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Active Alerts</div>
          {(assets.filter((a) => ["High", "Critical"].includes(a.risk)).slice(0, 4).length ? assets.filter((a) => ["High", "Critical"].includes(a.risk)).slice(0, 4) : [
            { name: "acme-corp/internal-api", risk: "High", updatedAt: new Date().toISOString() },
            { name: "legacy-payments/sdk", risk: "Critical", updatedAt: new Date().toISOString() },
          ]).map((a) => (
            <div key={a.id || a.name} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 14 }}>{a.risk === "Critical" ? "🔴" : "🟡"}</span>
              <div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{a.risk} trust event detected for {a.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{timeAgo(a.updatedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Analysis workflow ──────────────────────────────────────────────────────
function Analysis({ onComplete }) {
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [discovered, setDiscovered] = useState(null);
  const [progress, setProgress] = useState({});
  const [results, setResults] = useState(null);
  const [scanRun, setScanRun] = useState(null);
  const [aiExplanation, setAiExplanation] = useState("");
  const [lastAction, setLastAction] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const intervalRef = useRef(null);

  const steps = ["Input", "Discovery", "Configure", "Analysis", "Results"];
  const tabs = ["overview", "security", "engineering", "business", "evidence"];

  const fallbackDiscover = (value) => {
    const clean = value.replace(/https?:\/\//, "").replace(/\/$/, "");
    const isGH = clean.includes("github.com");
    const parts = clean.split("/");
    return {
      name: isGH && parts.length >= 3 ? `${parts[1]}/${parts[2]}` : clean,
      type: isGH ? "GitHub Repository" : "SaaS Product",
      company: isGH ? parts[1] : clean.split(".")[0],
      domains: [parts[0]],
      repos: isGH ? [`https://${clean}`] : [],
      tech: ["TypeScript", "Node.js", "PostgreSQL"],
      founded: "2019",
    };
  };

  const handleDiscover = async () => {
    if (!url.trim()) return;
    setError("");
    setLastAction("");
    setStep(1);
    try {
      const data = await apiJson("/api/assets", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      setDiscovered({ ...data.asset, tech: data.asset.tech || ["TypeScript", "Node.js", "PostgreSQL"], founded: data.asset.founded || "2019" });
      setStep(2);
    } catch (err) {
      setDiscovered(fallbackDiscover(url));
      setError(`${err.message} Using local discovery preview.`);
      setStep(2);
    }
  };

  const handleRunScan = async () => {
    setStep(3);
    setError("");
    const engines = ["Security", "Engineering", "Business", "Product", "Trust"];
    const prog = {};
    engines.forEach((e) => (prog[e] = 0));
    setProgress({ ...prog });

    let tick = 0;
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      tick += 1;
      setProgress((p) => {
        const next = { ...p };
        engines.forEach((engine, index) => {
          if (tick > index * 2) next[engine] = Math.min(92, next[engine] + 14);
        });
        return next;
      });
    }, 250);

    try {
      const data = await apiJson("/api/scans", {
        method: "POST",
        body: JSON.stringify({ url, asset: discovered }),
      });
      clearInterval(intervalRef.current);
      const done = {};
      engines.forEach((e) => (done[e] = 100));
      setProgress(done);
      setDiscovered({ ...data.asset, tech: data.asset.tech || discovered.tech || [], founded: data.asset.founded || discovered.founded || "2019" });
      setScanRun(data.scan);
      setResults(data.results);
      setAiExplanation(data.explanation || buildNarrative(url, data.results));
      setStep(4);
    } catch (err) {
      clearInterval(intervalRef.current);
      setError(err.message);
      setStep(2);
    }
  };

  const generatePassport = async () => {
    if (!scanRun) {
      setLastAction("Run a persisted scan before issuing a passport.");
      return;
    }
    try {
      const data = await apiJson("/api/passports", {
        method: "POST",
        body: JSON.stringify({ scanRunId: scanRun.id, assetId: scanRun.assetId }),
      });
      setLastAction(`Passport issued for ${data.passport.name}.`);
      onComplete?.(data.passport);
    } catch (err) {
      setLastAction(err.message);
    }
  };

  const exportReport = () => {
    const assetName = (discovered?.name || "ventureos-analysis").replace(/[^\w.-]+/g, "-");
    const assetId = discovered?.id || buildAssetId(discovered?.name || assetName);
    downloadJson(`${assetName}-trust-report.json`, {
      asset: discovered,
      scanRun,
      sourceUrl: url,
      generatedAt: new Date().toISOString(),
      results,
      explanation: aiExplanation,
      badge_embed: buildBadgeEmbed(assetId),
    });
    setLastAction("Report downloaded as JSON.");
  };

  const verdictColor =
    results?.verdict?.includes("TRUSTED") && !results?.verdict?.includes("NOT")
      ? results?.verdict?.includes("CONDITIONALLY")
        ? C.yellow
        : C.green
      : C.red;

  return (
    <div>
      <div className="stepper" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: i < step ? C.green : i === step ? C.accent : C.border, color: i <= step ? "#fff" : C.muted }}>
              {i < step ? "✓" : i + 1}
            </div>
            <span style={{ fontSize: 12, color: i === step ? C.text : C.muted, fontWeight: i === step ? 600 : 400 }}>{s}</span>
            {i < steps.length - 1 && <div style={{ width: 24, height: 1, background: C.border }} />}
          </div>
        ))}
      </div>

      {error && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {step === 0 && (
        <div style={styles.card}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Analyze a Software Asset</div>
          <div style={{ fontSize: 14, color: C.dim, marginBottom: 20 }}>Enter a GitHub repo, website, or SaaS product URL</div>
          <div className="input-row" style={{ display: "flex", gap: 10 }}>
            <input style={{ ...styles.input, flex: 1 }} placeholder="https://github.com/org/repo or https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleDiscover()} />
            <button style={styles.btn("primary")} onClick={handleDiscover}>Discover →</button>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["github.com/stripe/stripe-js", "github.com/vercel/next.js", "github.com/anthropics/anthropic-sdk-python"].map((ex) => (
              <span key={ex} style={{ fontSize: 12, color: C.accent, cursor: "pointer", padding: "4px 10px", border: `1px solid ${C.accentDim}`, borderRadius: 4 }} onClick={() => setUrl("https://" + ex)}>{ex}</span>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={{ ...styles.card, textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 16, animation: "spin 1s linear infinite" }}>⟳</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Persisting asset...</div>
          <div style={{ fontSize: 13, color: C.dim }}>Creating or updating the asset record</div>
        </div>
      )}

      {step === 2 && discovered && (
        <div className="two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Discovered Asset</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{discovered.name}</div>
            <span style={styles.badge(C.accent)}>{discovered.type}</span>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <EvidenceItem icon="🏢" label="Organization" value={discovered.company} />
              <EvidenceItem icon="🌐" label="Domain" value={discovered.domains?.[0] || "Unknown"} />
              <EvidenceItem icon="⚙️" label="Tech Stack" value={(discovered.tech || []).join(", ") || "Detected during scan"} />
              <EvidenceItem icon="📅" label="Est." value={discovered.founded || "2019"} />
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Analysis Modules</div>
            {[
              { key: "security", label: "🔒 Security Engine", desc: "CVEs, dependencies, secrets, SSL" },
              { key: "engineering", label: "⚙️ Engineering Engine", desc: "Code quality, activity, contributors" },
              { key: "business", label: "📊 Business Engine", desc: "Funding, team, market signals" },
              { key: "product", label: "📦 Product Engine", desc: "Docs, releases, support quality" },
              { key: "trust", label: "🏆 Trust Engine", desc: "Aggregate scoring, verdict" },
            ].map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: C.green + "33", border: `2px solid ${C.green}`, flexShrink: 0 }} />
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div><div style={{ fontSize: 11, color: C.muted }}>{m.desc}</div></div>
              </div>
            ))}
            <button style={{ ...styles.btn("primary"), marginTop: 16, width: "100%", justifyContent: "center" }} onClick={handleRunScan}>Run Persisted Analysis →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={styles.card}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Analysis in progress...</div>
          {Object.entries(progress).map(([engine, pct]) => (
            <div key={engine} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, color: pct === 100 ? C.green : C.text }}>{engine} Engine {pct === 100 ? "✓" : ""}</span><span style={{ fontSize: 12, color: C.dim }}>{Math.round(pct)}%</span></div>
              <div style={{ height: 6, background: C.border, borderRadius: 3 }}><div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? C.green : C.accent, borderRadius: 3, transition: "width 0.3s ease" }} /></div>
            </div>
          ))}
        </div>
      )}

      {step === 4 && results && (
        <div>
          <div className="result-hero" style={{ ...styles.card, marginBottom: 16, display: "flex", alignItems: "center", gap: 24 }}>
            <ScoreRing score={results.trust} size={90} label="Trust Score" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Verdict</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: verdictColor, letterSpacing: "-0.01em" }}>{results.verdict}</div>
              <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>Confidence: {results.confidence}% · Scan ID: {scanRun?.id}</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 10, lineHeight: 1.6, maxWidth: 500 }}>{aiExplanation}</div>
            </div>
            <div className="score-strip" style={{ display: "flex", gap: 12 }}>
              <ScoreRing score={results.security} size={56} label="Security" />
              <ScoreRing score={results.engineering} size={56} label="Eng." />
              <ScoreRing score={results.business} size={56} label="Business" />
              <ScoreRing score={results.product} size={56} label="Product" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: `1px solid ${C.border}` }}>
            {tabs.map((t) => <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: activeTab === t ? 600 : 400, color: activeTab === t ? C.text : C.dim, background: "none", border: "none", borderBottom: activeTab === t ? `2px solid ${C.accent}` : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
          </div>

          {activeTab === "overview" && (
            <div className="two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={styles.card}><div style={styles.cardTitle}>Score Breakdown</div><ProgressBar value={results.security} label="Security" /><ProgressBar value={results.engineering} label="Engineering" /><ProgressBar value={results.business} label="Business" /><ProgressBar value={results.product} label="Product" /></div>
              <div style={styles.card}><div style={styles.cardTitle}>Key Findings</div>{results.findings.map((f, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: i < results.findings.length - 1 ? `1px solid ${C.border}` : "none" }}><span style={{ fontSize: 12 }}>{f.severity === "good" ? "✅" : f.severity === "medium" ? "⚠️" : "🔴"}</span><div><div style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</div><div style={{ fontSize: 11, color: C.muted }}>{f.detail}</div></div></div>)}</div>
            </div>
          )}

          {activeTab === "evidence" && <div style={styles.card}><div style={styles.cardTitle}>Evidence Trail - persisted evidence items</div>{results.evidence.map((e, i) => <EvidenceItem key={e.id || i} label={e.label} value={e.value} status={e.status} />)}</div>}

          {["security", "engineering", "business"].includes(activeTab) && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Analysis</div>
              {results.findings.filter((f) => f.engine.toLowerCase() === activeTab).map((f, i) => <div key={i} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}><span>{f.severity === "good" ? "✅" : f.severity === "medium" ? "⚠️" : "🔴"}</span><div><div style={{ fontSize: 13, fontWeight: 600 }}>{f.title}</div><div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{f.detail}</div><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Engine: {f.engine}</div></div></div>)}
              {results.findings.filter((f) => f.engine.toLowerCase() === activeTab).length === 0 && <div style={{ fontSize: 13, color: C.dim, padding: "12px 0" }}>No {activeTab} findings generated in this scan.</div>}
            </div>
          )}

          <div className="action-row" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button style={styles.btn("primary")} onClick={generatePassport}>📋 Generate Passport</button>
            <button style={styles.btn()} onClick={exportReport}>📄 Export Report</button>
            <button style={styles.btn("ghost")} onClick={() => { setStep(0); setUrl(""); setResults(null); setAiExplanation(""); setLastAction(""); setScanRun(null); }}>New Analysis</button>
            {lastAction && <span style={{ fontSize: 12, color: lastAction.includes("issued") ? C.green : C.yellow }}>{lastAction}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Passport ───────────────────────────────────────────────────────────────
function Passport({ generated = [] }) {
  const [passports, setPassports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    let alive = true;
    apiJson("/api/passports")
      .then((data) => {
        if (!alive) return;
        setPassports(data.passports || []);
        setLoadState("ready");
      })
      .catch(() => {
        if (alive) setLoadState("fallback");
      });
    return () => { alive = false; };
  }, [generated.length]);

  const fallbackPassports = [
    { assetId: "asset_stripe_js", name: "stripe/stripe-js", company: "Stripe", trust: 84, version: "v3.2.1", issued: "2026-06-01", status: "Active" },
    { assetId: "asset_next_js", name: "vercel/next.js", company: "Vercel", trust: 91, version: "v14.2.0", issued: "2026-05-20", status: "Active" },
    { assetId: "asset_openai_node", name: "openai/openai-node", company: "OpenAI", trust: 73, version: "v4.0.0", issued: "2026-05-10", status: "Review" },
  ];
  const allPassports = passports.length ? passports : [...generated, ...fallbackPassports];

  if (selected !== null) {
    const p = allPassports[selected];
    const badgeEmbed = p.badge_embed || buildBadgeEmbed(p.assetId || buildAssetId(p.name));
    const exportPayload = { ...p, assetId: p.assetId || buildAssetId(p.name), badge_embed: badgeEmbed };
    const publicUrl = p.publicUrl || (p.assetId ? `/passport/${p.id}` : null);
    return (
      <div>
        <button style={{ ...styles.btn("ghost"), marginBottom: 20 }} onClick={() => setSelected(null)}>← Back to Passports</button>
        <div className="passport-detail-grid" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
          <div>
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div><div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 13, color: C.dim }}>{p.company}</div></div>
                <span style={styles.badge(p.status === "Active" ? C.green : C.yellow)}>{p.status}</span>
              </div>
              <ScoreRing score={p.trust} size={100} label="Trust Score" />
              <div style={{ marginTop: 16 }}>
                <EvidenceItem label="Version" value={p.version} />
                <EvidenceItem label="Issued" value={p.issued} status="good" />
                <EvidenceItem label="Confidence" value={`${p.confidence || 80}%`} status="good" />
                <EvidenceItem label="Public URL" value={publicUrl || "Not public"} status={publicUrl ? "good" : "warn"} />
              </div>
              {publicUrl && (
                <div style={{ marginTop: 12 }}>
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, fontSize: 12 }}>View public passport</a>
                </div>
              )}
            </div>
            <button style={{ ...styles.btn("primary"), width: "100%", justifyContent: "center" }} onClick={() => downloadJson(`${p.name.replace(/[^\w.-]+/g, "-")}-passport.json`, exportPayload)}>Export Passport</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Embed Badge</div>
              <textarea readOnly value={badgeEmbed} style={{ ...styles.input, minHeight: 76, resize: "vertical", lineHeight: 1.5 }} />
              <button style={{ ...styles.btn(), marginTop: 10 }} onClick={() => copyText(badgeEmbed)}>Copy Embed Code</button>
            </div>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Evidence Summary</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{p.evidenceSummary || "Passport is backed by the latest persisted scan run and evidence records."}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div><h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Software Passports</h1><p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Verified trust records for analyzed assets</p></div>
      </div>
      {loadState === "fallback" && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>API unavailable. Showing fallback passport records.</div>}
      <div className="passport-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {allPassports.map((p, i) => (
          <div key={p.id || p.name} style={{ ...styles.card, cursor: "pointer", transition: "border-color 0.15s" }} onClick={() => setSelected(i)}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <div><div style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 12, color: C.dim }}>{p.company}</div></div>
              <span style={styles.badge(p.status === "Active" ? C.green : C.yellow)}>{p.status}</span>
            </div>
            <ScoreRing score={p.trust} size={70} label="Trust Score" />
            <div style={{ marginTop: 12, fontSize: 11, color: C.muted }}>Issued {p.issued} · {p.version}</div>
            <div style={{ marginTop: 12, fontSize: 12, color: C.accent }}>View Passport →</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Registry ───────────────────────────────────────────────────────────────
function Registry() {
  const [assets, setAssets] = useState([]);
  const [query, setQuery] = useState("");
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    let alive = true;
    apiJson("/api/assets")
      .then((data) => {
        if (!alive) return;
        setAssets(data.assets || []);
        setLoadState("ready");
      })
      .catch(() => {
        if (alive) setLoadState("fallback");
      });
    return () => { alive = false; };
  }, []);

  const fallbackAssets = [
    { name: "stripe/stripe-js", type: "Library", industry: "Fintech", trust: 84, risk: "Low", monitored: true },
    { name: "vercel/next.js", type: "Framework", industry: "DevTools", trust: 91, risk: "Low", monitored: true },
    { name: "openai/openai-node", type: "SDK", industry: "AI", trust: 73, risk: "Medium", monitored: false },
    { name: "acme-corp/internal-api", type: "Service", industry: "Internal", trust: 41, risk: "High", monitored: true },
    { name: "legacy-payments/sdk", type: "SDK", industry: "Fintech", trust: 38, risk: "Critical", monitored: false },
  ];
  const rows = (assets.length ? assets : fallbackAssets).filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  const riskColor = (r) => ({ Low: C.green, Medium: C.yellow, High: C.orange, Critical: C.red, Unscanned: C.dim }[r] || C.dim);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Asset Registry</h1>
          <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>All analyzed software assets</p>
        </div>
        <input style={{ ...styles.input, width: 260 }} placeholder="Search assets..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {loadState === "fallback" && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>API unavailable. Showing fallback registry rows.</div>}
      <div style={styles.card}>
        <div className="table-scroll"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Asset", "Type", "Industry", "Trust Score", "Risk", "Monitoring", "Last Scan"].map((h) => <th key={h} style={{ textAlign: "left", fontSize: 11, color: C.muted, fontWeight: 600, padding: "0 12px 10px 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id || a.name} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "14px 12px 14px 0", fontSize: 13, fontWeight: 600 }}>{a.name}</td>
                <td style={{ padding: "14px 12px 14px 0" }}><span style={styles.badge(C.indigo)}>{a.type}</span></td>
                <td style={{ padding: "14px 12px 14px 0", fontSize: 13, color: C.dim }}>{a.industry}</td>
                <td style={{ padding: "14px 12px 14px 0" }}><span style={{ fontSize: 15, fontWeight: 700, color: a.trust >= 75 ? C.green : a.trust >= 50 ? C.yellow : a.trust > 0 ? C.red : C.dim }}>{a.trust || "--"}</span></td>
                <td style={{ padding: "14px 12px 14px 0" }}><span style={styles.badge(riskColor(a.risk))}>{a.risk}</span></td>
                <td style={{ padding: "14px 12px 14px 0" }}><span style={{ fontSize: 12, color: a.monitored ? C.green : C.muted }}>{a.monitored ? "● Active" : "○ Off"}</span></td>
                <td style={{ padding: "14px 0", fontSize: 12, color: C.dim }}>{timeAgo(a.lastScannedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function safeParseJson(value) {
if (!value || typeof value !== "string") return null;
try {
  return JSON.parse(value);
} catch {
  return null;
}
}

function readFileAsText(file) {
return new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("Failed to read file."));
  reader.readAsText(file);
});
}

function formatPercentage(value) {
  if (value == null || typeof value !== "number" || Number.isNaN(value)) return "No data";
  return `${Math.round(value * 100)}%`;
}

function renderTimelineLabel(type) {
  const labels = {
    ARTIFACT_MISSING: "Missing artifact",
    SIGNAL_SKIPPED: "Skipped signal",
    EVIDENCE_INCOMPLETE: "Evidence incomplete",
    ABSTENTION_CONSIDERED: "Abstention considered",
    SIGNALS_COMPUTED: "Signals computed",
    SCORE_COMPUTED: "Score computed",
  };
  return labels[type] || type.replace(/_/g, " ");
}

function renderTimelineDetail(event) {
  if (!event?.details) return "";
  const { artifact, signal, completeness, reason } = event.details;
  if (event.type === "ARTIFACT_MISSING") return `Missing artifact: ${artifact || "unknown"}`;
  if (event.type === "SIGNAL_SKIPPED") return `Signal skipped: ${signal}`;
  if (event.type === "EVIDENCE_INCOMPLETE") return `Evidence completeness ${completeness}%`;
  if (event.type === "ABSTENTION_CONSIDERED") return reason || "No provable evidence";
  return JSON.stringify(event.details);
}

function Projects({ route, onNavigate }) {
const [projects, setProjects] = useState([]);
const [loadState, setLoadState] = useState("loading");
const [query, setQuery] = useState("");
const [error, setError] = useState("");
const [refreshKey, setRefreshKey] = useState(0);

useEffect(() => {
  let alive = true;
  setLoadState("loading");
  apiJson("/api/projects")
    .then((data) => {
      if (!alive) return;
      setProjects(data.projects || []);
      setLoadState("ready");
    })
    .catch((err) => {
      if (alive) {
        setError(err.message);
        setLoadState("fallback");
      }
    });
  return () => { alive = false; };
}, [refreshKey]);

const filteredProjects = projects.filter((project) => project.name.toLowerCase().includes(query.toLowerCase()));
const hasProjects = filteredProjects.length > 0;

if (route === "new") {
  return <NewProjectForm onCreated={(project) => {
    setRefreshKey((current) => current + 1);
    onNavigate(`/projects/${project.id}`);
  }} onCancel={() => onNavigate("/projects")} />;
}

if (route && route !== "list") {
  return <ProjectDetail projectId={route} onNavigate={onNavigate} refreshProjects={() => setRefreshKey((current) => current + 1)} />;
}

return (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Projects</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Create and monitor trust pipelines for customer projects.</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={styles.btn("primary")} onClick={() => onNavigate("/projects/new")}>+ New Project</button>
      </div>
    </div>

    <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects..." style={{ ...styles.input, width: 280 }} />
    </div>

    {loadState === "fallback" && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>Unable to load projects. Refresh to retry.</div>}
    {error && <div style={{ ...styles.card, borderColor: C.red, color: C.red, marginBottom: 16, fontSize: 13 }}>{error}</div>}

    <div style={styles.card}>
      <div className="table-scroll"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {[
              "Name",
              "Vendor",
              "Sector",
              "Repo",
              "Dependencies",
              "Last updated",
              "Score",
            ].map((label) => (
              <th key={label} style={{ textAlign: "left", fontSize: 11, color: C.muted, fontWeight: 600, padding: "0 12px 10px 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!hasProjects && (
            <tr>
              <td colSpan={7} style={{ padding: 20, fontSize: 13, color: C.dim }}>No projects found. Click New Project to get started.</td>
            </tr>
          )}
          {filteredProjects.map((project) => (
            <tr key={project.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => onNavigate(`/projects/${project.id}`)}>
              <td style={{ padding: "14px 12px 14px 0", fontSize: 13, fontWeight: 600 }}>{project.name}</td>
              <td style={{ padding: "14px 12px 14px 0", color: C.dim }}>{project.vendor || "—"}</td>
              <td style={{ padding: "14px 12px 14px 0", color: C.dim }}>{project.sector || "—"}</td>
              <td style={{ padding: "14px 12px 14px 0", color: C.accent, fontSize: 12 }}>{project.repoUrl ? project.repoUrl.replace(/^https?:\/\//, "") : "No repo"}</td>
              <td style={{ padding: "14px 12px 14px 0", color: C.text }}>{project.dependencyCount || project.dependencies?.length || 0}</td>
              <td style={{ padding: "14px 12px 14px 0", color: C.dim }}>{project.lastUpdated?.slice(0, 10) || project.updatedAt?.slice(0, 10) || "—"}</td>
              <td style={{ padding: "14px 0", color: project.latestScore?.riskBand === "Stable" ? C.green : project.latestScore?.riskBand === "Elevated" ? C.yellow : project.latestScore?.riskBand === "Concerning" ? C.orange : C.red }}>{project.latestScore?.score ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  </div>
);
}

function NewProjectForm({ onCreated, onCancel }) {
const [name, setName] = useState("");
const [vendor, setVendor] = useState("");
const [sector, setSector] = useState("");
const [repoUrl, setRepoUrl] = useState("");
const [metadataJson, setMetadataJson] = useState("");
const [sbomFile, setSbomFile] = useState(null);
const [packageFile, setPackageFile] = useState(null);
const [error, setError] = useState("");
const [saving, setSaving] = useState(false);

const handleSubmit = async (event) => {
  event.preventDefault();
  if (!name.trim()) {
    setError("Project name is required.");
    return;
  }
  let metadata = null;
  if (metadataJson.trim()) {
    metadata = safeParseJson(metadataJson);
    if (metadata === null) {
      setError("Metadata must be valid JSON.");
      return;
    }
  }

  setSaving(true);
  setError("");

  try {
    const artifacts = [];
    if (sbomFile) {
      artifacts.push({ type: "SBOM", originalName: sbomFile.name, content: await readFileAsText(sbomFile) });
    }
    if (packageFile) {
      artifacts.push({ type: "PACKAGE_LIST", originalName: packageFile.name, content: await readFileAsText(packageFile) });
    }
    if (metadata) {
      artifacts.push({ type: "METADATA", originalName: "metadata.json", content: metadata });
    }

    const payload = { name: name.trim(), vendor: vendor.trim(), sector: sector.trim(), repoUrl: repoUrl.trim(), artifacts };
    const data = await apiJson("/api/projects", { method: "POST", body: JSON.stringify(payload) });
    onCreated(data.project);
  } catch (err) {
    setError(err.message || "Unable to create project.");
  } finally {
    setSaving(false);
  }
};

return (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>New Project</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Attach artifacts and run your first trust pipeline.</p>
      </div>
      <button style={styles.btn("ghost")} onClick={onCancel}>Back to projects</button>
    </div>

    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <div style={styles.card}>
        <div style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Project information</div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Project name
            <input value={name} onChange={(event) => setName(event.target.value)} style={styles.input} placeholder="Acme Software" />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Vendor name
            <input value={vendor} onChange={(event) => setVendor(event.target.value)} style={styles.input} placeholder="Acme Inc." />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Sector
            <input value={sector} onChange={(event) => setSector(event.target.value)} style={styles.input} placeholder="Fintech" />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Repo URL
            <input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} style={styles.input} placeholder="https://github.com/acme/app" />
          </label>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>Artifacts</div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            SBOM upload (JSON or XML)
            <input type="file" accept=".json,.xml" onChange={(event) => setSbomFile(event.target.files?.[0] || null)} />
            {sbomFile && <span style={{ fontSize: 12, color: C.text }}>Selected: {sbomFile.name}</span>}
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Package list upload
            <input type="file" accept=".json,.txt" onChange={(event) => setPackageFile(event.target.files?.[0] || null)} />
            {packageFile && <span style={{ fontSize: 12, color: C.text }}>Selected: {packageFile.name}</span>}
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, color: C.muted }}>
            Metadata JSON
            <textarea value={metadataJson} onChange={(event) => setMetadataJson(event.target.value)} style={{ ...styles.input, minHeight: 120, fontFamily: "inherit" }} placeholder='{"hasSecurityPolicy": true, "securityPolicy": "ISO 27001"}' />
          </label>
        </div>
      </div>

      {error && <div style={{ color: C.yellow, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" style={styles.btn("primary")} disabled={saving}>{saving ? "Creating…" : "Create Project"}</button>
        <button type="button" style={styles.btn("ghost")} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  </div>
);
}

function ProjectDetail({ projectId, onNavigate, refreshProjects }) {
const [project, setProject] = useState(null);
const [loadState, setLoadState] = useState("loading");
const [error, setError] = useState("");
const [metadataText, setMetadataText] = useState("");
const [editingMetadata, setEditingMetadata] = useState(false);
const [actionError, setActionError] = useState("");
const [busy, setBusy] = useState(false);
const sbomInputRef = useRef(null);
const packageInputRef = useRef(null);

const loadProject = async () => {
  setLoadState("loading");
  setError("");
  try {
    const data = await apiJson(`/api/projects/${encodeURIComponent(projectId)}`);
    setProject(data);
    setMetadataText(JSON.stringify(data.metadata || {}, null, 2));
    setLoadState("ready");
  } catch (err) {
    setError(err.message || "Unable to load project.");
    setLoadState("error");
  }
};

useEffect(() => {
  loadProject();
}, [projectId]);

const pushProjectUpdate = async (artifacts) => {
  setBusy(true);
  setActionError("");
  try {
    const data = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/artifacts`, { method: "POST", body: JSON.stringify({ artifacts }) });
    setProject(data);
    refreshProjects();
  } catch (err) {
    setActionError(err.message || "Unable to upload artifacts.");
  } finally {
    setBusy(false);
  }
};

const handleRunPipeline = async () => {
  setBusy(true);
  setActionError("");
  try {
    const data = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/run-pipeline`, { method: "POST" });
    setProject(data.project);
    refreshProjects();
  } catch (err) {
    setActionError(err.message || "Pipeline run failed.");
  } finally {
    setBusy(false);
  }
};

const handleUploadFile = (type) => async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const content = await readFileAsText(file);
    await pushProjectUpdate([{ type, originalName: file.name, content }]);
  } catch (err) {
    setActionError(err.message || "Failed to read uploaded file.");
  }
};

const handleSaveMetadata = async () => {
  const metadata = safeParseJson(metadataText);
  if (metadata === null) {
    setActionError("Metadata must be valid JSON.");
    return;
  }
  await pushProjectUpdate([{ type: "METADATA", originalName: "metadata.json", content: metadata }]);
  setEditingMetadata(false);
};

const latestScore = project?.latestScore;
const scoreLabel = latestScore ? `${latestScore.score}` : "—";
const confidenceLabel = latestScore ? (latestScore.confidence >= 80 ? "High" : latestScore.confidence >= 60 ? "Medium" : "Low") : "None";
const riskBand = latestScore?.riskBand || "None";
const modelVersion = latestScore?.modelVersion || "v1";

if (loadState === "loading") {
  return <div style={styles.card}><div style={{ fontSize: 18, fontWeight: 700 }}>Loading project…</div></div>;
}

if (loadState === "error") {
  return <div style={styles.card}><div style={{ fontSize: 18, fontWeight: 700, color: C.yellow }}>{error}</div><button style={{ ...styles.btn("ghost"), marginTop: 16 }} onClick={() => onNavigate("/projects")}>Back to projects</button></div>;
}

const artifactTypes = new Set((project.artifacts || []).map((artifact) => artifact.type));

return (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{project.name}</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>{project.vendor || "No vendor specified"} · {project.sector || "No sector specified"}</p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={styles.btn("ghost")} onClick={() => onNavigate("/projects")}>← Back to projects</button>
        <button style={styles.btn("primary")} onClick={handleRunPipeline} disabled={busy}>{busy ? "Running…" : "Run pipeline"}</button>
      </div>
    </div>

    {actionError && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16 }}>{actionError}</div>}

    <div className="two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 16 }}>
      <div style={styles.card}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Score panel</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Trust Score</div><div style={{ fontSize: 30, fontWeight: 700, color: C.text }}>{scoreLabel}</div></div>
            <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Confidence</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{confidenceLabel}</div></div>
            <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Risk band</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{riskBand}</div></div>
            <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Model version</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{modelVersion}</div></div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Artifacts</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span style={styles.badge(artifactTypes.has("SBOM") ? C.green : C.dim)}>{artifactTypes.has("SBOM") ? "SBOM attached" : "SBOM missing"}</span>
              <span style={styles.badge(artifactTypes.has("PACKAGE_LIST") ? C.green : C.dim)}>{artifactTypes.has("PACKAGE_LIST") ? "Package list attached" : "Package list missing"}</span>
              <span style={styles.badge(artifactTypes.has("METADATA") ? C.green : C.dim)}>{artifactTypes.has("METADATA") ? "Metadata provided" : "Metadata missing"}</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button style={styles.btn()} type="button" onClick={() => sbomInputRef.current?.click()}>Upload SBOM</button>
            <button style={styles.btn()} type="button" onClick={() => packageInputRef.current?.click()}>Upload package list</button>
            <button style={styles.btn()} type="button" onClick={() => setEditingMetadata((value) => !value)}>{editingMetadata ? "Hide metadata" : "Edit metadata"}</button>
          </div>
          <input ref={sbomInputRef} type="file" accept=".json,.xml" style={{ display: "none" }} onChange={handleUploadFile("SBOM")} />
          <input ref={packageInputRef} type="file" accept=".json,.txt" style={{ display: "none" }} onChange={handleUploadFile("PACKAGE_LIST")} />
          {editingMetadata && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 12, color: C.muted }}>Metadata JSON</div>
              <textarea value={metadataText} onChange={(event) => setMetadataText(event.target.value)} style={{ ...styles.input, minHeight: 160, fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" style={styles.btn("primary")} onClick={handleSaveMetadata} disabled={busy}>Save metadata</button>
                <button type="button" style={styles.btn("ghost")} onClick={() => setEditingMetadata(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {latestScore?.narrative && (
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Narrative</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text }}>{latestScore.narrative}</div>
      </div>
    )}

    <div className="two-col-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Signal breakdown</div>
        {project.latestSignals ? (
          Object.entries(project.latestSignals.signals).map(([key, value]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 13, color: C.text }}>{key}</span>
              <span style={{ fontSize: 13, color: C.accent }}>{formatPercentage(value)}</span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 13, color: C.dim }}>No signals have been computed for this project yet.</div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Artifact inventory</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>SBOM</span><span>{artifactTypes.has("SBOM") ? "Yes" : "No"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>Package list</span><span>{artifactTypes.has("PACKAGE_LIST") ? "Yes" : "No"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>Metadata</span><span>{artifactTypes.has("METADATA") ? "Yes" : "No"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>Dependencies</span><span>{project.dependencies?.length ?? 0}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.dim }}>Last updated</span><span>{project.lastUpdated?.slice(0, 10) || project.updatedAt?.slice(0, 10) || "—"}</span></div>
        </div>
      </div>
    </div>

    <div style={styles.card}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>Timeline</div>
      {project.events?.length ? (
        project.events.map((event) => (
          <div key={event.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{renderTimelineLabel(event.type)}</div>
            <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>{new Date(event.timestamp).toLocaleString()}</div>
            <div style={{ fontSize: 12, color: C.accent }}>{renderTimelineDetail(event)}</div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 13, color: C.dim }}>No events recorded yet.</div>
      )}
    </div>
  </div>
);
}

function WorkspacePage({ type }) {
  const config = {
    monitoring: {
      title: "Monitoring",
      subtitle: "Live health checks for watched assets",
      items: ["Daily dependency scans", "Domain and SSL expiry watch", "Trust score drift alerts"],
      metric: "12 active monitors",
    },
    reports: {
      title: "Reports",
      subtitle: "Board-ready exports and diligence packets",
      items: ["3 reports generated this week", "JSON exports enabled", "Passport evidence included"],
      metric: "31 reports archived",
    },
    alerts: {
      title: "Alerts",
      subtitle: "Prioritized risk events across your portfolio",
      items: ["2 critical security events", "4 medium remediation tasks", "Owner notifications ready"],
      metric: "6 open alerts",
    },
    team: {
      title: "Team",
      subtitle: "Review ownership and audit workflow",
      items: ["Keith Ross - Admin", "Security Lead - Reviewer", "Procurement - Viewer"],
      metric: "3 seats active",
    },
  }[type];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{config.title}</h1>
        <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>{config.subtitle}</p>
      </div>
      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Status</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.accent, marginBottom: 8 }}>{config.metric}</div>
          <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>Workspace data is wired into the local product shell so these sections behave like real navigation targets.</div>
        </div>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Queue</div>
          {config.items.map((item, i) => (
            <EvidenceItem key={item} label={item} value={i === 0 ? "Now" : "Ready"} status={i === 0 ? "warn" : "good"} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MspPage({ mspList, selectedMspId, setSelectedMspId, details, loading, error }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>MSP Dashboard</h1>
          <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Manage MSP accounts, workspaces, and billing visibility.</p>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>MSP accounts</div>
          {loading && <div style={{ color: C.dim, fontSize: 13 }}>Loading MSP accounts…</div>}
          {error && <div style={{ color: C.yellow, fontSize: 13 }}>{error}</div>}
          {mspList.length === 0 && !loading && <div style={{ fontSize: 13, color: C.dim }}>No MSP accounts assigned to your user yet.</div>}
          {mspList.map((msp) => (
            <button
              key={msp.id}
              style={{
                width: "100%",
                textAlign: "left",
                background: selectedMspId === msp.id ? C.borderLit : "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 10,
                color: C.text,
                cursor: "pointer",
              }}
              onClick={() => setSelectedMspId(msp.id)}
            >
              <div style={{ fontSize: 13, fontWeight: 600 }}>{msp.name}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{msp.role || "Member"}</div>
            </button>
          ))}
        </div>
        <div style={styles.card}>
          <div style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Selected MSP</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{details?.msp?.name || "Select an MSP account"}</div>
            </div>
          </div>
          {details ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={styles.card}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Plan</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{details.msp.plan}</div>
                </div>
                <div style={styles.card}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Status</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{details.msp.active ? "Active" : "Inactive"}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div style={styles.card}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Workspaces</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{details.workspaces.length}</div>
                </div>
                <div style={styles.card}>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Billing events</div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{details.billing?.usage?.length || 0}</div>
                </div>
              </div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Billing summary</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total amount</span>
                    <strong>${((details.billing?.totals?.totalAmountCents || 0) / 100).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total quantity</span>
                    <strong>{details.billing?.totals?.totalQuantity || 0}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Subscription</span>
                    <strong>{details.billing?.subscription?.plan || "starter"}</strong>
                  </div>
                </div>
              </div>
              <div style={styles.card}>
                <div style={styles.cardTitle}>Workspace provisioning</div>
                <div style={{ fontSize: 13, color: C.text }}>
                  {details.workspaces.length > 0 ? (
                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                      {details.workspaces.map((workspace) => (
                        <li key={workspace.id} style={{ marginBottom: 6 }}>{workspace.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ color: C.dim }}>No workspaces provisioned yet.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: C.dim }}>Select an MSP account to see billing and workspace details.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicPassport({ passportId, onClose }) {
  const [passport, setPassport] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function fetchPassport() {
      try {
        const data = await apiJson(`/api/passports/${encodeURIComponent(passportId)}/public`);
        if (!alive) return;
        setPassport(data);
        setLoadState("ready");
      } catch (err) {
        if (!alive) return;
        setError(err.message || "Unable to load public passport.");
        setLoadState("error");
      }
    }
    fetchPassport();
    return () => {
      alive = false;
    };
  }, [passportId]);

  if (loadState === "loading") {
    return (
      <div style={{ ...styles.main, justifyContent: "center", alignItems: "center", display: "flex" }}>
        <div style={{ ...styles.card, width: 420, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Loading passport</div>
          <div style={{ fontSize: 13, color: C.dim }}>Fetching public verification details...</div>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Passport verification failed</h1>
            <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>The public passport could not be loaded.</p>
          </div>
          <button style={styles.btn("ghost")} onClick={onClose}>Close</button>
        </div>
        <div style={{ color: C.yellow, fontSize: 13 }}>{error}</div>
      </div>
    );
  }

  const statusLabel = passport.revoked ? "Revoked" : passport.badgeStatus?.status?.replace(/^(.)/, (m) => m.toUpperCase()) || "Unknown";
  const statusColor = passport.revoked ? C.red : passport.badgeStatus?.status === "verified" ? C.green : passport.badgeStatus?.status === "conditional" ? C.yellow : C.orange;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{passport.assetName}</h1>
          <p style={{ fontSize: 14, color: C.dim, margin: "4px 0 0" }}>Public verification for passport {passport.passportId}</p>
        </div>
        <button style={styles.btn("ghost")} onClick={onClose}>Back to app</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 24 }}>
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Trust score</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: C.text }}>{passport.trustScore}</div>
            </div>
            <span style={styles.badge(statusColor)}>{statusLabel}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={styles.card}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Verdict</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{passport.verdict}</div>
            </div>
            <div style={styles.card}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Version</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>v{passport.version}</div>
            </div>
            <div style={styles.card}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Issued</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{passport.issuedAt}</div>
            </div>
          </div>
          <div style={styles.card}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Evidence Summary</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text }}>{passport.evidenceSummary || "No evidence summary available."}</div>
          </div>
        </div>
        <div style={styles.card}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Badge status</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: statusColor }}>{passport.badgeStatus?.status || "Unknown"}</div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ ...styles.card, padding: 14 }}><strong>Score</strong> {passport.badgeStatus?.score ?? passport.trustScore}</div>
            <div style={{ ...styles.card, padding: 14 }}><strong>Verdict</strong> {passport.badgeStatus?.verdict || passport.verdict}</div>
            <div style={{ ...styles.card, padding: 14 }}><strong>Last updated</strong> {passport.badgeStatus?.lastUpdated || passport.issuedAt}</div>
            <div style={{ ...styles.card, padding: 14 }}><strong>Revoked</strong> {passport.revoked ? "Yes" : "No"}</div>
            {passport.revoked && <div style={{ ...styles.card, padding: 14, color: C.yellow }}>Revoked at {passport.revokedAt || "unknown"}</div>}
          </div>
        </div>
      </div>
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={styles.cardTitle}>Passport versions</div>
        {passport.versions?.map((version) => (
          <div key={version.passportId} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{version.version}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{version.verdict} · Issued {version.issuedAt}</div>
            </div>
            <div style={{ fontSize: 12, color: C.accent }}>{version.revoked ? "Revoked" : "Active"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VentureOS() {
  const [page, setPage] = useState("dashboard");
  const [publicPassportId, setPublicPassportId] = useState(null);
  const [generatedPassports, setGeneratedPassports] = useState([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [role, setRole] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [mspMemberships, setMspMemberships] = useState([]);
  const [mspList, setMspList] = useState([]);
  const [selectedMspId, setSelectedMspId] = useState(null);
  const [mspDetails, setMspDetails] = useState(null);
  const [mspLoading, setMspLoading] = useState(false);
  const [mspError, setMspError] = useState("");
  const [loadState, setLoadState] = useState("loading");
  const [authError, setAuthError] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const navigateProjectPath = (path) => {
    if (typeof window !== "undefined" && window.history?.pushState) {
      window.history.pushState({}, "", path);
    }
    if (path === "/projects") {
      setPage("projects");
      setProjectRoute("list");
      return;
    }
    if (path === "/projects/new") {
      setPage("projects");
      setProjectRoute("new");
      return;
    }
    if (path.startsWith("/projects/")) {
      const id = path.split("/")[2];
      setPage("projects");
      setProjectRoute(decodeURIComponent(id));
    }
  };
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authWorkspaceName, setAuthWorkspaceName] = useState("");

  const loadWorkspaces = async () => {
    try {
      const data = await apiJson("/api/workspaces");
      setWorkspaces(data.workspaces || []);
    } catch {
      setWorkspaces([]);
    }
  };

  const loadMspList = async () => {
    setMspLoading(true);
    setMspError("");
    try {
      const data = await apiJson("/api/msps");
      setMspList(data.msps || []);
      if (data.msps && data.msps.length && !selectedMspId) {
        setSelectedMspId(data.msps[0].id);
      }
    } catch (err) {
      setMspError(err.message || "Unable to load MSPs.");
      setMspList([]);
      setSelectedMspId(null);
    } finally {
      setMspLoading(false);
    }
  };

  const loadMspDetails = async (mspId) => {
    if (!mspId) return;
    setMspLoading(true);
    setMspError("");
    try {
      const data = await apiJson(`/api/msp/${encodeURIComponent(mspId)}`);
      setMspDetails(data);
    } catch (err) {
      setMspError(err.message || "Unable to load MSP details.");
      setMspDetails(null);
    } finally {
      setMspLoading(false);
    }
  };

  useEffect(() => {
    if (page === "msp" && authenticated) {
      loadMspList();
    }
  }, [page, authenticated]);

  useEffect(() => {
    if (selectedMspId) {
      loadMspDetails(selectedMspId);
    }
  }, [selectedMspId]);

  const refreshSession = async (workspaceId) => {
    const data = await apiJson("/api/auth/session", { workspaceId });
    setAuthenticated(true);
    setUser(data.user);
    setWorkspace(data.workspace);
    setRole(data.role);
    setMemberships(data.memberships || []);
    setMspMemberships(data.mspMemberships || []);
    if (typeof window !== "undefined") {
      window.__VENTUREOS_WORKSPACE_ID__ = data.workspace?.id || "";
    }
    await loadWorkspaces();
    setLoadState("ready");
    setAuthError("");
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError("");
    try {
      const payload = authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { name: authName, email: authEmail, password: authPassword, workspaceName: authWorkspaceName };
      const url = authMode === "login" ? "/api/auth/login" : "/api/auth/signup";
      await apiJson(url, { method: "POST", body: JSON.stringify(payload) });
      await refreshSession();
      setPage("dashboard");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
      setAuthenticated(false);
      setUser(null);
      setWorkspace(null);
      setWorkspaces([]);
      setRole(null);
      setMemberships([]);
      if (typeof window !== "undefined") {
        window.__VENTUREOS_WORKSPACE_ID__ = "";
      }
      setLoadState("unauthenticated");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleWorkspaceSwitch = async (workspaceId) => {
    if (!workspaceId || workspaceId === workspace?.id) return;
    try {
      await refreshSession(workspaceId);
      setPage("dashboard");
    } catch (err) {
      setAuthError(err.message);
    }
  };

  useEffect(() => {
    async function hydrateSession() {
      try {
        await refreshSession();
      } catch (err) {
        setAuthenticated(false);
        setUser(null);
        setWorkspace(null);
        setRole(null);
        setMemberships([]);
        setWorkspaces([]);
        window.__VENTUREOS_WORKSPACE_ID__ = "";
        setLoadState("unauthenticated");
      }
    }
    hydrateSession();
  }, []);

  const [projectRoute, setProjectRoute] = useState("list");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleRoute = () => {
      const pathname = window.location.pathname;
      const passportMatch = pathname.match(/^\/passport\/([^/]+)$/);
      if (passportMatch) {
        setPublicPassportId(decodeURIComponent(passportMatch[1]));
        return;
      }
      setPublicPassportId(null);

      if (pathname === "/projects/new") {
        setPage("projects");
        setProjectRoute("new");
        return;
      }

      const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
      if (projectMatch) {
        setPage("projects");
        setProjectRoute(decodeURIComponent(projectMatch[1]));
        return;
      }

      if (pathname === "/projects") {
        setPage("projects");
        setProjectRoute("list");
      }
    };

    handleRoute();
    window.addEventListener("popstate", handleRoute);
    return () => window.removeEventListener("popstate", handleRoute);
  }, []);

  useEffect(() => {
    const pageLabels = {
      dashboard: "Dashboard",
      analyze: "Analyze",
      projects: "Projects",
      registry: "Registry",
      passports: "Passports",
      monitoring: "Monitoring",
      reports: "Reports",
      alerts: "Alerts",
      team: "Team",
    };

    if (typeof window.gtag === "function") {
      window.gtag("config", "AW-18232630878", {
        page_title: `VentureOS - ${pageLabels[page] || page}`,
        page_path: `/${page}`,
      });
    }
  }, [page]);

  const nav = [
    { id: "dashboard", label: "Dashboard" },
    { id: "analyze", label: "Analyze" },
    { id: "projects", label: "Projects" },
    { id: "registry", label: "Registry" },
    { id: "passports", label: "Passports" },
  ];

  return (
    <div style={styles.app}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        button:hover { opacity: 0.88; }
        .table-scroll { overflow-x: auto; }
        @media (max-width: 1100px) {
          .metric-grid, .passport-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .dashboard-grid, .two-col-grid, .passport-detail-grid { grid-template-columns: 1fr !important; }
          .result-hero { align-items: flex-start !important; flex-direction: column; }
        }
        @media (max-width: 760px) {
          nav { gap: 14px !important; padding: 0 14px !important; overflow-x: auto; }
          aside { display: none; }
          main { padding: 16px !important; }
          .metric-grid, .passport-grid { grid-template-columns: 1fr !important; }
          .input-row, .stepper { flex-wrap: wrap; }
          .input-row button { width: 100%; justify-content: center; }
          .score-strip { flex-wrap: wrap; }
        }
      `}</style>

      <nav style={styles.nav}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>V</div>
          VentureOS
        </div>
        <div style={{ display: "flex", gap: 24, flex: 1 }}>
          {nav.map((n) => (
            <span key={n.id} style={styles.navLink(page === n.id)} onClick={() => {
              if (n.id === "projects") {
                navigateProjectPath("/projects");
              } else {
                setPage(n.id);
              }
            }}>{n.label}</span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {authenticated ? (
            <>
              <select
                value={workspace?.id || ""}
                onChange={(event) => handleWorkspaceSwitch(event.target.value)}
                style={{ background: C.surface, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px" }}
              >
                {workspaces.map((item) => (
                  <option key={item.workspaceId || item.id} value={item.workspaceId || item.id}>
                    {(item.name || item.workspace?.name || item.name) + (item.role ? ` (${item.role})` : "")}
                  </option>
                ))}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.text }}>{user?.name || user?.email}</span>
                <button style={styles.btn("ghost")} onClick={handleLogout}>Logout</button>
              </div>
            </>
          ) : (
            <button style={styles.btn("primary")} onClick={() => setAuthMode("login")}>Sign in</button>
          )}
        </div>
      </nav>

      {publicPassportId ? (
        <main style={styles.content}>
          <PublicPassport passportId={publicPassportId} onClose={() => {
            setPublicPassportId(null);
            if (typeof window !== "undefined" && window.history?.pushState) {
              window.history.pushState({}, "", "/");
            }
          }} />
        </main>
      ) : loadState === "loading" ? (
        <div style={{ ...styles.main, justifyContent: "center", alignItems: "center", display: "flex" }}>
          <div style={{ ...styles.card, width: 420, textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Loading VentureOS</div>
            <div style={{ fontSize: 13, color: C.dim }}>Checking session and workspace access...</div>
          </div>
        </div>
      ) : !authenticated ? (
        <div style={{ ...styles.main, justifyContent: "center", alignItems: "center", display: "flex" }}>
          <form onSubmit={handleAuthSubmit} style={{ ...styles.card, width: 420, display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{authMode === "login" ? "Sign in to VentureOS" : "Create your VentureOS account"}</div>
              <div style={{ fontSize: 13, color: C.dim }}>{authMode === "login" ? "Use your workspace credentials to continue." : "Start with a new account and workspace."}</div>
            </div>
            {authMode === "signup" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, color: C.dim }}>Name</label>
                <input style={styles.input} value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12, color: C.dim }}>Email</label>
              <input style={styles.input} type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12, color: C.dim }}>Password</label>
              <input style={styles.input} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Minimum 8 characters" />
            </div>
            {authMode === "signup" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 12, color: C.dim }}>Workspace name</label>
                <input style={styles.input} value={authWorkspaceName} onChange={(event) => setAuthWorkspaceName(event.target.value)} placeholder="My Company Workspace" />
              </div>
            )}
            {authError && <div style={{ color: C.yellow, fontSize: 13 }}>{authError}</div>}
            <button style={styles.btn("primary")} type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: C.dim }}>
              <span>{authMode === "login" ? "New to VentureOS?" : "Already have an account?"}</span>
              <button type="button" style={{ ...styles.btn("ghost"), padding: "8px 12px" }} onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setAuthError("");
              }}>
                {authMode === "login" ? "Create account" : "Sign in"}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div style={styles.main}>
          <aside style={styles.sidebar}>
            <div style={{ padding: "0 16px 12px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Platform</div>
            {[
              { id: "dashboard", icon: "⊞", label: "Dashboard" },
              { id: "analyze", icon: "⟳", label: "New Analysis" },
              { id: "projects", icon: "▣", label: "Projects" },
              { id: "registry", icon: "◫", label: "Asset Registry" },
              { id: "passports", icon: "◈", label: "Passports" },
              { id: "msp", icon: "⚡", label: "MSP" },
            ].map((i) => (
              <div key={i.id} style={styles.sideItem(page === i.id)} onClick={() => {
                if (i.id === "projects") {
                  navigateProjectPath("/projects");
                } else {
                  setPage(i.id);
                }
              }}>
                <span style={{ fontSize: 14 }}>{i.icon}</span>
                <span>{i.label}</span>
              </div>
            ))}
            <div style={{ padding: "20px 16px 8px", fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Workspace</div>
            {[
              { id: "monitoring", icon: "◉", label: "Monitoring" },
              { id: "reports", icon: "□", label: "Reports" },
              { id: "alerts", icon: "△", label: "Alerts" },
              { id: "team", icon: "◎", label: "Team" },
            ].map((i) => (
              <div key={i.id} style={styles.sideItem(page === i.id)} onClick={() => setPage(i.id)}>
                <span style={{ fontSize: 14 }}>{i.icon}</span>
                <span>{i.label}</span>
              </div>
            ))}
          </aside>

          <main style={styles.content}>
            {page === "dashboard" && <Dashboard onAnalyze={() => setPage("analyze")} />}
            {page === "analyze" && <Analysis onComplete={(passport) => { if (passport) setGeneratedPassports((items) => [passport, ...items]); setPage("passports"); }} />}
            {page === "projects" && <Projects route={projectRoute} onNavigate={navigateProjectPath} />}
            {page === "registry" && <Registry />}
            {page === "passports" && <Passport generated={generatedPassports} />}
            {page === "msp" && <MspPage mspList={mspList} selectedMspId={selectedMspId} setSelectedMspId={setSelectedMspId} details={mspDetails} loading={mspLoading} error={mspError} />}
            {["monitoring", "reports", "alerts", "team"].includes(page) && <WorkspacePage type={page} />}
          </main>
        </div>
      )}
    </div>
  );
}





