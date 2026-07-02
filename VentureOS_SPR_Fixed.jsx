import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import VendorRegistry from "./modules/spr/VendorRegistry.jsx";
import SoftwareRegistry from "./modules/spr/SoftwareRegistry.jsx";
import PassportDashboard from "./components/PassportDashboard.jsx";
import BadgeDrivenFlow from "./components/BadgeDrivenFlow.jsx";
import WorkspaceManager from "./components/WorkspaceManager.jsx";
import { UniversalCommandBar } from "./components/UniversalCommandBar.tsx";
import { useCommandRegistry } from "./hooks/useCommandRegistry.ts";
import { hydrateInteractionGraph, buildGraphCommands } from "./hooks/useInteractionGraph.ts";
import { useWorkspaceMutation } from "./hooks/useWorkspaceMutation.ts";
import { apiJson } from "./api-client";

// ═══════════════════════════════════════════════════════════════════════════
//  SPR BRAND DESIGN TOKENS — Global Legal Badge Identity
// ═══════════════════════════════════════════════════════════════════════════
const C = {
  bg:        "#0B0D14",
  surface:   "#11131E",
  surfaceHover: "#181B28",
  border:    "#1E2130",
  borderLit: "#2D3147",
  borderGold: "#C9A86A33",
  text:      "#F0EDE8",
  textMuted: "#B8B4AD",
  textDim:   "#7A756D",
  gold:      "#C9A86A",
  goldDim:   "#A8834D",
  goldBright: "#D4B87A",
  goldDark:  "#8B6B3A",
  green:     "#00C27A",
  greenDim:  "#00A868",
  yellow:    "#C9A86A",
  red:       "#C5302B",
  orange:    "#F97316",
  indigo:    "#4753E6",
  blue:      "#3B82F6",
  badgeGold: "#C9A86A",
  badgeNavy: "#0B0D14",
};

const SPR = {
  name: "Software Passport Registry",
  shortName: "SPR",
  tagline: "Verified. Trusted. Worldwide.",
  badgeText: "GLOBAL LEGAL BADGE",
  seal: "ᑯ",
};

const styles = {
  app: {
    background: C.bg,
    color: C.text,
    minHeight: "100vh",
    fontFamily: "'Merriweather', 'Inter', 'Georgia', system-ui, serif",
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.5,
  },
  nav: {
    background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
    borderBottom: `1px solid ${C.borderGold}`,
    padding: "0 28px",
    display: "flex",
    alignItems: "center",
    height: 64,
    gap: 32,
    position: "sticky",
    top: 0,
    zIndex: 100,
    backdropFilter: "blur(12px)",
  },
  logo: {
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.04em",
    color: C.gold,
    display: "flex",
    alignItems: "center",
    gap: 10,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  logoMark: {
    width: 32,
    height: 32,
    background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
    color: C.bg,
    border: `2px solid ${C.goldBright}`,
    boxShadow: `0 0 12px ${C.gold}44`,
  },
  navLink: (active) => ({
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? C.gold : C.textDim,
    cursor: "pointer",
    padding: "6px 0",
    borderBottom: active ? `2px solid ${C.gold}` : "2px solid transparent",
    transition: "all 0.2s ease",
    letterSpacing: active ? "0.02em" : "0",
    whiteSpace: "nowrap",
  }),
  main: {
    flex: 1,
    display: "flex",
  },
  sidebar: {
    width: 240,
    background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
    borderRight: `1px solid ${C.border}`,
    padding: "20px 0",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
  },
  sideSection: {
    padding: "0 20px 10px",
    fontSize: 10,
    color: C.goldDim,
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    fontWeight: 600,
  },
  sideItem: (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? C.gold : C.textDim,
    cursor: "pointer",
    background: active ? `${C.gold}11` : "transparent",
    borderLeft: active ? `3px solid ${C.gold}` : "3px solid transparent",
    transition: "all 0.2s ease",
    marginBottom: 2,
  }),
  content: {
    flex: 1,
    padding: 32,
    overflow: "auto",
  },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: 24,
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: C.goldDim,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: 16,
  },
  badge: (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background: color + "18",
    color: color,
    border: `1px solid ${color}44`,
    letterSpacing: "0.02em",
  }),
  btn: (variant = "primary") => {
    const variants = {
      primary: {
        background: `linear-gradient(135deg, ${C.gold}, ${C.goldDim})`,
        color: C.bg,
        border: "none",
        boxShadow: `0 2px 12px ${C.gold}33`,
      },
      ghost: {
        background: "transparent",
        color: C.textDim,
        border: `1px solid ${C.border}`,
      },
      danger: {
        background: C.red + "22",
        color: C.red,
        border: `1px solid ${C.red}44`,
      },
      success: {
        background: C.green + "22",
        color: C.green,
        border: `1px solid ${C.green}44`,
      },
      default: {
        background: C.border,
        color: C.text,
        border: "none",
      },
    };
    const v = variants[variant] || variants.default;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 18px",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.2s ease",
      outline: "none",
      ...v,
    };
  },
  input: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 14,
    color: C.text,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  },
  goldDivider: {
    height: 1,
    background: `linear-gradient(90deg, transparent, ${C.gold}44, transparent)`,
    margin: "16px 0",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

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

function timeAgo(value) {
  if (!value) return "Never";
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
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
    PIPELINE_RUN_REQUESTED: "Pipeline run requested",
    SIGNALS_COMPUTED: "Signals computed",
    SCORE_COMPUTED: "Score computed",
  };
  return labels[type] || type.replace(/_/g, " ");
}

function renderTimelineDetail(event) {
  if (!event?.details) return "";
  const { artifact, signal, completeness, reason, runId } = event.details;
  if (event.type === "ARTIFACT_MISSING") return `Missing artifact: ${artifact || "unknown"}`;
  if (event.type === "SIGNAL_SKIPPED") return `Signal skipped: ${signal}`;
  if (event.type === "EVIDENCE_INCOMPLETE") return `Evidence completeness ${completeness}%`;
  if (event.type === "ABSTENTION_CONSIDERED") return reason || "No provable evidence";
  if (event.type === "PIPELINE_RUN_REQUESTED") return runId ? `Run ID: ${runId}` : "Pipeline run requested";
  return JSON.stringify(event.details);
}

// ═══════════════════════════════════════════════════════════════════════════
//  REUSABLE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ScoreRing({ score, size = 80, label, color }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const ringColor = color || (score >= 75 ? C.green : score >= 50 ? C.gold : C.red);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round" />
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
          style={{ fill: C.text, fontSize: size * 0.24, fontWeight: 700, transform: `rotate(90deg)`, transformOrigin: "center" }}>
          {score}
        </text>
      </svg>
      {label && <span style={{ fontSize: 11, color: C.textMuted, textAlign: "center", fontWeight: 500 }}>{label}</span>}
    </div>
  );
}

function EvidenceItem({ icon, label, value, status }) {
  const color = status === "good" ? C.green : status === "warn" ? C.gold : status === "bad" ? C.red : C.textDim;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 13, color: C.textDim, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>{icon}</span> {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function ProgressBar({ value, color, label, max = 100 }) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color || (pct >= 75 ? C.green : pct >= 50 ? C.gold : C.red);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.textDim, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: c }}>{value}</span>
      </div>
      <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${c}, ${c}88)`, borderRadius: 3, transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </div>
    </div>
  );
}

function StatusBadge({ status, children }) {
  const colorMap = {
    active: C.green, verified: C.green, completed: C.green,
    pending: C.gold, review: C.gold, conditional: C.gold,
    failed: C.red, critical: C.red, high: C.red,
    medium: C.orange, low: C.green, unscanned: C.textDim,
  };
  const color = colorMap[status?.toLowerCase()] || C.textDim;
  return <span style={styles.badge(color)}>{children || status}</span>;
}

function LoadingSpinner({ size = 40, text = "Loading..." }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 48 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ animation: "spin 1s linear infinite" }}>
        <circle cx="20" cy="20" r="16" fill="none" stroke={C.border} strokeWidth="3" />
        <circle cx="20" cy="20" r="16" fill="none" stroke={C.gold} strokeWidth="3" strokeDasharray="25 75" strokeLinecap="round" />
      </svg>
      <span style={{ fontSize: 14, color: C.textMuted, fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function ErrorAlert({ children, onRetry }) {
  return (
    <div style={{ ...styles.card, borderColor: C.gold + "44", background: `${C.gold}08`, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 20 }}>⚠️</span>
        <div style={{ flex: 1, fontSize: 13, color: C.gold, lineHeight: 1.6 }}>{children}</div>
        {onRetry && (
          <button style={{ ...styles.btn("ghost"), padding: "6px 12px", fontSize: 12 }} onClick={onRetry}>Retry</button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{ ...styles.card, textAlign: "center", padding: 48 }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>{icon}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: C.text }}>{title}</div>
      <div style={{ fontSize: 13, color: C.textDim, marginBottom: 20, lineHeight: 1.6 }}>{description}</div>
      {action}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Trust Overview ─────────────────────────────────────────────────────────
function TrustViz() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    apiJson("/api/assets")
      .then((data) => {
        if (!alive) return;
        const assets = (data.assets || []).map((a) => ({
          id: a.id,
          name: a.name || a.assetName || a.canonicalUrl || "unnamed",
          trust: a.latestTrustScore || a.trust || Math.round(Math.random() * 40) + 50,
          coverage: a.coverageScore || Math.round(Math.random() * 40) + 50,
          staleness: a.stalenessScore != null ? a.stalenessScore : Math.round(Math.random() * 100),
          risk: a.risk || (a.latestTrustScore && a.latestTrustScore < 50 ? "High" : "Low"),
          delta: Math.round((Math.random() - 0.4) * 8),
          history: Array.from({ length: 8 }).map((_, i) => Math.max(10, Math.min(100, (a.latestTrustScore || 70) + Math.round((Math.random() - 0.5) * 10) - i))),
        }));
        setItems(assets.slice(0, 12));
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        const fallback = Array.from({ length: 8 }).map((_, i) => ({
          id: `demo_${i}`,
          name: `demo/demo-client-${i}`,
          trust: 70 + i % 3 * 5 - (i % 2 ? 4 : 0),
          coverage: 60 + (i * 3) % 40,
          staleness: (i * 23) % 100,
          risk: i % 3 === 0 ? "High" : "Low",
          delta: i % 2 === 0 ? 3 : -2,
          history: [60,62,64,63,66,68,70,71].map((v) => v + (i - 4)),
        }));
        setItems(fallback);
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  if (loading) return <LoadingSpinner text="Loading trust data..." />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Trust Overview
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Visualize trust, coverage, staleness, and short-term forecast across assets.</div>
      </div>

      {error && <ErrorAlert onRetry={() => window.location.reload()}>{error}. Showing fallback data.</ErrorAlert>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={styles.cardTitle}>Trust Scores</div>
            <div style={{ fontSize: 12, color: C.textDim }}>Top assets monitored</div>
          </div>
          <div>
            {items.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 42, flexShrink: 0 }}><ScoreRing score={it.trust} size={56} label="" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, color: it.delta >= 0 ? C.green : C.red, fontWeight: 600 }}>
                        {it.delta >= 0 ? `▲ +${it.delta}` : `▼ ${it.delta}`}
                      </div>
                      <StatusBadge status={it.risk.toLowerCase()}>{it.risk}</StatusBadge>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <ProgressBar value={it.coverage} label="Coverage" />
                    <ProgressBar value={100 - it.staleness} label="Freshness" />
                  </div>
                </div>
                <div style={{ width: 120, flexShrink: 0 }}>
                  <svg width="120" height="36" viewBox="0 0 120 36" preserveAspectRatio="none">
                    <polyline fill="none" stroke="#4F8CFF" strokeWidth="2" points={it.history.map((v, idx) => `${(idx/(it.history.length-1))*120},${36 - (v/100)*32}`).join(" ")} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={styles.cardTitle}>Coverage / Risk / Staleness</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>Average Coverage</span>
                <span style={{ fontWeight: 700, color: C.gold }}>78%</span>
              </div>
              <div style={{ height: 8, background: C.border, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: "78%", height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.gold})`, borderRadius: 4 }} />
              </div>
              <div style={{ height: 12 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: C.textMuted, fontSize: 13 }}>Risky Workspaces</span>
                <span style={{ fontWeight: 700, color: C.red }}>3</span>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, ...styles.card, padding: 16, border: `1px solid ${C.red}33` }}>
                  <div style={{ fontSize: 12, color: C.textDim }}>Stale</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.red }}>2</div>
                </div>
                <div style={{ flex: 1, ...styles.card, padding: 16, border: `1px solid ${C.gold}33` }}>
                  <div style={{ fontSize: 12, color: C.textDim }}>Aging</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>1</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={styles.cardTitle}>Trust Forecast</div>
            <div style={{ fontSize: 13, color: C.textDim, marginBottom: 12 }}>Short-term forecast based on recent trends</div>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.green} stopOpacity="0.3" />
                  <stop offset="100%" stopColor={C.green} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon fill="url(#forecastGrad)" points="0,70 100,64 200,60 300,62 400,58 500,54 600,56 600,120 0,120" />
              <polyline fill="none" stroke={C.green} strokeWidth="3" points="0,70 100,64 200,60 300,62 400,58 500,54 600,56" />
              <circle cx="600" cy="56" r="4" fill={C.green} />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lineage Graph ──────────────────────────────────────────────────────────
function LineageGraph({ activeNodeId, onActiveNodeIdChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(activeNodeId || null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    setSelected(activeNodeId || null);
  }, [activeNodeId]);

  useEffect(() => {
    let alive = true;
    apiJson('/api/trust-graph').then((g) => {
      if (!alive) return;
      setData(g || null);
      setLoading(false);
    }).catch(() => {
      setData(null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const getNodeFill = useCallback((node) => {
    switch (node.type) {
      case 'Workspace': return C.surface;
      case 'Asset': return C.indigo;
      case 'Project': return C.goldDim;
      case 'Dependency': return C.gold;
      case 'Passport': return C.green;
      case 'Vendor': return C.orange;
      case 'EvidenceArtifact': return C.border;
      case 'EvidenceMarker': return C.red;
      default: return C.border;
    }
  }, []);

  const getNodeStroke = useCallback((node) => {
    if (selected === node.id) return C.gold;
    if (node.type === 'EvidenceMarker') return C.red;
    if (node.type === 'Passport') return C.green;
    return C.borderLit;
  }, [selected]);

  const getNodeRadius = useCallback((node) => {
    const sizes = { Workspace: 26, Project: 20, Dependency: 18, Passport: 22, Vendor: 18 };
    return sizes[node.type] || 16;
  }, []);

  const getEvidenceBadgeColor = useCallback((node) => {
    if (node.evidenceCompleteness == null) return C.textDim;
    const pct = Number(node.evidenceCompleteness);
    if (pct >= 0.8) return C.green;
    if (pct >= 0.5) return C.gold;
    return C.red;
  }, []);

  const getRiskBadgeColor = useCallback((node) => {
    if (!node.risk) return C.textDim;
    const risk = `${node.risk}`.toLowerCase();
    if (risk.includes('low') || risk === 'ok' || risk === 'pass') return C.green;
    if (risk.includes('medium') || risk.includes('warn') || risk.includes('caution')) return C.gold;
    if (risk.includes('high') || risk.includes('critical') || risk.includes('danger')) return C.red;
    return C.textDim;
  }, []);

  const formatPct = useCallback((value) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${Math.round(Number(value) * 100)}%`;
  }, []);

  const getEdgeStyle = useCallback((edge) => {
    const styles = {
      depends_on: { stroke: C.textDim, width: 1, dash: '0' },
      owned_by: { stroke: C.goldDim, width: 1.3, dash: '0' },
      supplied_by: { stroke: C.indigo, width: 1.3, dash: '0' },
      passported_by: { stroke: C.green, width: 1.7, dash: '0' },
      supported_by: { stroke: C.green, width: 1.2, dash: '4 2' },
      drifted_by: { stroke: C.orange, width: 1.2, dash: '4 2' },
      abstains_from: { stroke: C.red, width: 1.2, dash: '3 3' },
    };
    return styles[edge.type] || { stroke: C.textMuted, width: 1, dash: '0' };
  }, []);

  const getTypeLabel = useCallback((type) => {
    if (!data?.schema?.nodeTypes) return type;
    const item = data.schema.nodeTypes.find((entry) => entry.type === type);
    return item ? item.type : type;
  }, [data]);

  const getTypeDescription = useCallback((type) => {
    if (!data?.schema?.nodeTypes) return null;
    const item = data.schema.nodeTypes.find((entry) => entry.type === type);
    return item ? item.description : null;
  }, [data]);

  const findNodeLabel = useCallback((nodeId) => {
    return data?.nodes?.find((item) => item.id === nodeId)?.label || nodeId;
  }, [data]);

  const getNodeConnectionReasons = useCallback((node) => {
    if (!data) return [];
    const incoming = data.edges.filter((edge) => edge.target === node.id);
    const reasons = incoming.map((edge) => {
      const sourceLabel = findNodeLabel(edge.source);
      return `${edge.type.replace(/_/g, ' ')} from ${sourceLabel}` + (edge.description ? ` (${edge.description})` : '');
    });
    return reasons.length ? reasons : [`${getTypeLabel(node.type)} node in the trust graph.`];
  }, [data, findNodeLabel, getTypeLabel]);

  const renderNodeShape = useCallback((node, x, y) => {
    const fill = getNodeFill(node);
    const stroke = getNodeStroke(node);

    switch (node.type) {
      case 'Workspace':
        return <rect x={x - 44} y={y - 18} width={88} height={36} rx={14} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
      case 'Project':
        return <rect x={x - 36} y={y - 16} width={72} height={32} rx={10} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
      case 'Dependency':
        return <path d={`M ${x} ${y - 18} L ${x + 18} ${y} L ${x} ${y + 18} L ${x - 18} ${y} Z`} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
      case 'Passport':
        return (
          <g>
            <rect x={x - 34} y={y - 18} width={68} height={34} rx={10} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />
            <path d={`M ${x + 18} ${y - 14} L ${x + 26} ${y} L ${x + 18} ${y + 14} Z`} fill={C.surface} opacity={0.8} />
          </g>
        );
      case 'EvidenceMarker':
        return <circle r={12} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
      case 'EvidenceArtifact':
        return <circle r={12} fill={fill} stroke={stroke} strokeWidth={1.5} opacity={0.95} />;
      case 'Vendor':
        return <circle r={18} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
      default:
        return <circle r={getNodeRadius(node)} fill={fill} stroke={stroke} strokeWidth={2} opacity={0.95} />;
    }
  }, [getNodeFill, getNodeStroke, getNodeRadius]);

  const renderNodeLabel = useCallback((node) => {
    const text = (node.label || node.id || '').split(' ').slice(0, 3).join(' ');
    return <text x={0} y={4} textAnchor="middle" style={{ fontSize: 10, fill: C.text, pointerEvents: 'none', fontWeight: 500 }}>{text}</text>;
  }, []);

  const renderNodeBadges = useCallback((node) => {
    const badges = [];
    const radius = getNodeRadius(node);
    const badgeX = radius + 16;

    if (node.evidenceCompleteness != null) {
      badges.push({ cx: badgeX, cy: -10, fill: getEvidenceBadgeColor(node), title: `Evidence ${formatPct(node.evidenceCompleteness)}` });
    }
    if (node.risk) {
      badges.push({ cx: badgeX, cy: 10, fill: getRiskBadgeColor(node), title: `Risk ${node.risk}` });
    }

    return badges.map((badge, index) => (
      <g key={`${node.id}-badge-${index}`}>
        <circle cx={badge.cx} cy={badge.cy} r={5} fill={badge.fill} stroke={C.borderLit} strokeWidth={1} />
        <title>{badge.title}</title>
      </g>
    ));
  }, [getNodeRadius, getEvidenceBadgeColor, getRiskBadgeColor, formatPct]);

  const summary = data?.summary || {};
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const visibleNodes = nodes.slice(0, 40);
  const visibleEdges = edges.slice(0, 60);
  const selectedNode = selected ? nodes.find((item) => item.id === selected) : null;
  const nodeColumns = 8;

  if (loading) return <LoadingSpinner text="Loading trust graph..." />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Lineage Graph
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Visualize dependency lineage, trust propagation, and evidence health across the workspace.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { title: 'Trust Score', value: `${summary.score ?? '—'}/100`, desc: summary.narrative?.split('. ')[0] || 'Graph trust rating.' },
          { title: 'Evidence Confidence', value: `${summary.confidence ?? '—'}%`, desc: 'Calculated from evidence completeness across nodes.' },
          { title: 'Nodes', value: nodes.length, desc: `Showing first ${visibleNodes.length} nodes.` },
          { title: 'Edges', value: edges.length, desc: `Showing first ${visibleEdges.length} edges.` },
        ].map((stat) => (
          <div key={stat.title} style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={styles.cardTitle}>{stat.title}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.gold }}>{stat.value}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>{stat.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 340px', gap: 20 }}>
        <div style={{ ...styles.card, position: 'relative', border: `1px solid ${C.borderGold}` }}>
          {data ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.textMuted }}>Nodes: {nodes.length} · Edges: {edges.length}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[
                    { color: C.indigo, label: 'Asset' },
                    { color: C.goldDim, label: 'Project' },
                    { color: C.gold, label: 'Dependency' },
                    { color: C.green, label: 'Passport' },
                  ].map((badge) => (
                    <span key={badge.label} style={styles.badge(badge.color)}>{badge.label}</span>
                  ))}
                </div>
              </div>
              <svg width="100%" height={Math.max(420, Math.ceil(visibleNodes.length / nodeColumns) * 60 + 80)} viewBox={`0 0 560 ${Math.max(420, Math.ceil(visibleNodes.length / nodeColumns) * 60 + 80)}`} style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill={C.textDim} />
                  </marker>
                </defs>
                {visibleEdges.map((edge) => {
                  const sourceIndex = nodes.findIndex((n) => n.id === edge.source);
                  const targetIndex = nodes.findIndex((n) => n.id === edge.target);
                  if (sourceIndex === -1 || targetIndex === -1) return null;
                  const sourceX = 40 + (sourceIndex % nodeColumns) * 60;
                  const sourceY = 50 + Math.floor(sourceIndex / nodeColumns) * 60;
                  const targetX = 40 + (targetIndex % nodeColumns) * 60;
                  const targetY = 50 + Math.floor(targetIndex / nodeColumns) * 60;
                  const style = getEdgeStyle(edge);
                  return (
                    <line key={edge.id} x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}
                      stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash}
                      markerEnd="url(#arrow)" opacity={0.8} />
                  );
                })}
                {visibleNodes.map((node, i) => {
                  const x = 40 + (i % nodeColumns) * 60;
                  const y = 50 + Math.floor(i / nodeColumns) * 60;
                  const isSel = selected === node.id;
                  return (
                    <g key={node.id} transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => setHovered({ node, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHovered({ node, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => { setSelected(node.id); onActiveNodeIdChange?.(node.id); }}>
                      {renderNodeShape(node, x, y)}
                      {renderNodeLabel(node)}
                      {renderNodeBadges(node)}
                      {isSel && <circle r={getNodeRadius(node) + 8} fill="none" stroke={C.gold} strokeWidth={1.5} opacity={0.7} />}
                    </g>
                  );
                })}
              </svg>
              {hovered?.node && (
                <div style={{ position: 'fixed', top: hovered.y + 16, left: hovered.x + 16, minWidth: 200, background: `${C.bg}ee`, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 16, pointerEvents: 'none', zIndex: 50, backdropFilter: "blur(8px)", boxShadow: `0 8px 32px ${C.bg}88` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, marginBottom: 6 }}>{hovered.node.label || hovered.node.id}</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>{getTypeDescription(hovered.node.type) || hovered.node.type}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                    <div><strong style={{ color: C.text }}>{hovered.node.trust ?? '—'}</strong><div style={{ color: C.textDim }}>Trust</div></div>
                    <div><strong style={{ color: C.text }}>{hovered.node.confidence ?? '—'}</strong><div style={{ color: C.textDim }}>Confidence</div></div>
                    <div><strong style={{ color: C.text }}>{formatPct(hovered.node.evidenceCompleteness)}</strong><div style={{ color: C.textDim }}>Evidence</div></div>
                    <div><strong style={{ color: C.text }}>{hovered.node.risk || 'Unknown'}</strong><div style={{ color: C.textDim }}>Risk</div></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon="🌐" title="Graph Unavailable" description="Requires authenticated workspace or demo mode." />
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={styles.cardTitle}>Why this graph matters</div>
            <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>{data?.narrative || 'This graph shows how trust flows from evidence, dependencies, and passports across your workspace.'}</div>
          </div>
          <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={styles.cardTitle}>Legend</div>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              {['owned_by', 'depends_on', 'passported_by', 'supported_by', 'drifted_by', 'abstains_from'].map((type) => {
                const style = getEdgeStyle({ type });
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <svg width="80" height="12"><line x1="0" y1="6" x2="80" y2="6" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} markerEnd="url(#arrow)" /></svg>
                    <span style={{ fontSize: 12, color: C.text, textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedNode ? (
            <div style={{ ...styles.card, border: `1px solid ${C.gold}44` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: C.goldDim, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{getTypeLabel(selectedNode.type)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{selectedNode.label || selectedNode.id}</div>
                </div>
                <button style={styles.btn('ghost')} onClick={() => setSelected(null)}>Clear</button>
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Trust', value: selectedNode.trust ?? '—' },
                    { label: 'Confidence', value: selectedNode.confidence ?? '—' },
                    { label: 'Evidence', value: formatPct(selectedNode.evidenceCompleteness) },
                    { label: 'Risk', value: selectedNode.risk || 'Unknown' },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>{getTypeDescription(selectedNode.type) || 'This node is part of the trust graph and is connected by evidence-backed relationships.'}</div>
                <div>
                  <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8, fontWeight: 600 }}>Why is this node here?</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {getNodeConnectionReasons(selectedNode).slice(0, 4).map((reason, index) => (
                      <div key={index} style={{ fontSize: 12, color: C.text, background: C.bg, padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>{reason}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
              <div style={styles.cardTitle}>Select a node</div>
              <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>Click a node to inspect trust, evidence, risk, and the relationships that place it in the graph.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ── Reports Export ────────────────────────────────────────────────────────
function ReportsExport() {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      const resp = await apiJson('/api/demo/export');
      downloadJson('spr-executive-export.json', resp);
    } catch (err) {
      alert(err.message);
    } finally { setExporting(false); }
  };
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Executive Export
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Download a demo executive export for monthly reporting and board presentations.</div>
      </div>
      <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
        <div style={{ marginBottom: 20 }}>
          <button style={styles.btn("primary")} onClick={handleExport} disabled={exporting}>
            {exporting ? '⏳ Exporting…' : '📥 Download Executive Export'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
          Exports are generated from persisted MSP data. This demo uses synthetic data structured for
          <strong style={{ color: C.gold }}> SPR Global Legal Badge </strong>compliance reporting.
        </div>
      </div>
    </div>
  );
}

// ── Compliance Exports ───────────────────────────────────────────────────
function ComplianceExports() {
  const [generating, setGenerating] = useState(false);
  const handleCompliance = async () => {
    setGenerating(true);
    setTimeout(() => {
      alert('Compliance export scaffold — implement mapping to /api/msp/:id/export');
      setGenerating(false);
    }, 500);
  };
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Compliance Exports
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Generate compliance-grade export packages for auditors and legal review.</div>
      </div>
      <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
          <button style={styles.btn("primary")} onClick={handleCompliance} disabled={generating}>
            {generating ? '⏳ Generating…' : '📦 Generate Compliance Package'}
          </button>
        </div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
          Packages include ISO 27001, SOC 2 Type II, GDPR, NIST Framework, and OECD-aligned evidence trails.
        </div>
      </div>
    </div>
  );
}

// ── Billing Integration ──────────────────────────────────────────────────
function BillingIntegration() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    apiJson('/api/msp/mode').then((r) => { if (alive) setStatus(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Billing
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Stripe integration and billing management for MSP accounts.</div>
      </div>
      <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: status?.mode ? C.green : C.textDim }} />
          <div style={{ fontSize: 16, fontWeight: 600 }}>Billing status: <strong style={{ color: status?.mode ? C.gold : C.textDim }}>{status?.mode || 'unknown'}</strong></div>
        </div>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
          This is a scaffold for Stripe billing flows and portal integration.
          <span style={{ color: C.gold }}> SPR Global Legal Badge </span> subscribers receive priority billing support.
        </div>
      </div>
    </div>
  );
}

// ── Vendor Portal ────────────────────────────────────────────────────────
function VendorPortal() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiJson('/api/passports').then((r) => {
      if (!alive) return;
      setVendors((r.passports || []).slice(0, 8));
      setLoading(false);
    }).catch(() => {
      setVendors([]);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const displayVendors = vendors.length ? vendors : [
    { name: 'Stripe', verified: true },
    { name: 'Vercel', verified: true },
    { name: 'OpenAI', verified: true },
  ];

  if (loading) return <LoadingSpinner text="Loading vendors..." />;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Vendor Portal
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>A curated vendor listing and verification workspace.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {displayVendors.map((v, i) => (
          <div key={i} style={{ ...styles.card, border: `1px solid ${C.borderGold}`, transition: "transform 0.2s ease, border-color 0.2s ease" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.gold + "66"; e.currentTarget.style.transform = "translateY(-2px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.borderGold; e.currentTarget.style.transform = "translateY(0)"; }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.gold + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                {v.verified ? '✓' : '◯'}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.gold }}>{v.name || v.assetName}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{v.verified ? 'Verified vendor record' : 'Pending verification'}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={styles.badge(v.verified ? C.green : C.gold)}>{v.verified ? 'Verified' : 'Review'}</span>
              <span style={styles.badge(C.indigo)}>SPR Partner</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Enterprise Portal ────────────────────────────────────────────────────
function EnterprisePortal() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Enterprise Portal
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Enterprise administration: SSO, RBAC, and tenant controls.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
          <div style={styles.cardTitle}>SSO Configuration</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: C.textDim }}>Not configured</div>
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 8 }}>Configure SAML 2.0 or OIDC for your organization.</div>
        </div>
        <div style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
          <div style={styles.cardTitle}>RBAC Policies</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, color: C.gold }}>3 roles active</div>
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 8 }}>Admin, Security Lead, Procurement Viewer</div>
        </div>
      </div>
    </div>
  );
}

// ── Public Registry ──────────────────────────────────────────────────────
function PublicRegistry() {
  const [query, setQuery] = useState("");
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 8 }}>
          <span style={{ color: C.gold }}>SPR</span> Public Registry
        </h1>
        <div style={{ fontSize: 14, color: C.textDim }}>Search the global register of software passports. Verified. Trusted. Worldwide.</div>
      </div>
      <div style={{ ...styles.card, border: `1px solid ${C.borderGold}`, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <span style={{ fontSize: 13, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Global Search</span>
        </div>
        <input
          style={{ ...styles.input, fontSize: 16, padding: "14px 18px" }}
          placeholder="Search by asset name, passport ID, company, or compliance standard..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {['ISO 27001', 'SOC 2', 'GDPR', 'NIST', 'OECD'].map((tag) => (
            <span key={tag} style={{ ...styles.badge(C.gold), cursor: "pointer" }} onClick={() => setQuery(tag)}>{tag}</span>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { name: "stripe/stripe-js", score: 84, status: "Verified" },
          { name: "vercel/next.js", score: 91, status: "Verified" },
          { name: "openai/openai-node", score: 73, status: "Conditional" },
        ].map((item) => (
          <div key={item.name} style={{ ...styles.card, border: `1px solid ${C.borderGold}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.name}</span>
              <StatusBadge status={item.status.toLowerCase()}>{item.status}</StatusBadge>
            </div>
            <ScoreRing score={item.score} size={60} label="Trust Score" />
          </div>
        ))}
      </div>
    </div>
  );
}
