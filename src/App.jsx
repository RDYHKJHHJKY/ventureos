import { useEffect, useState, useRef } from "react";
import VendorRegistry from "./modules/spr/VendorRegistry.jsx";
import SoftwareRegistry from "./modules/spr/SoftwareRegistry.jsx";
import PassportDashboard from "./components/PassportDashboard.jsx";
import { UniversalCommandBar } from "./components/UniversalCommandBar.tsx";
import { useCommandRegistry } from "./hooks/useCommandRegistry.ts";
import { hydrateInteractionGraph, buildGraphCommands } from "./hooks/useInteractionGraph.ts";
import { useWorkspaceMutation } from "./hooks/useWorkspaceMutation.ts";
import { apiJson } from "./api-client";

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:        "#000000", // Registry black (Premium/Lux)
  surface:   "#0A0A0A",
  border:    "#141414",
  borderLit: "#2A2A2A",
  text:      "#F8F9FA", // Compliance white
  muted:     "#B4B0AA",
  dim:       "#8F8A84",
  accent:    "#C9A86A", // Lineage gold (primary accent for Premium)
  accentDim: "#A8834D",
  green:     "#00C27A", // Verification green
  yellow:    "#C9A86A", // Lineage gold
  red:       "#C5302B", // Trust low / crimson
  orange:    "#F97316",
  indigo:    "#4753E6",
};

const styles = {
  app: {
    background: C.bg,
    color: C.text,
    minHeight: "100vh",
    fontFamily: "'Merriweather', 'Inter', system-ui, serif",
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

// ── Trust Visualization (new) ─────────────────────────────────────────────
function TrustViz() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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
      .catch(() => {
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

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Trust Overview</h1>
        <div style={{ fontSize: 13, color: C.dim }}>Visualize trust, coverage, staleness, and short-term forecast across assets.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={styles.cardTitle}>Trust Scores</div>
            <div style={{ fontSize: 12, color: C.dim }}>Top assets</div>
          </div>
          <div>
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : items.map((it) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 38 }}><ScoreRing score={it.trust} size={56} label="" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{it.name}</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, color: it.delta >= 0 ? C.green : C.red }}>{it.delta >= 0 ? `+${it.delta}` : `${it.delta}`}</div>
                      <div style={{ fontSize: 12, color: C.dim }}>{it.risk}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <ProgressBar value={it.coverage} label="Coverage" />
                    <ProgressBar value={100 - it.staleness} label="Freshness" />
                  </div>
                </div>
                <div style={{ width: 120 }}>
                  <svg width="120" height="36" viewBox="0 0 120 36" preserveAspectRatio="none">
                    <polyline fill="none" stroke="#4F8CFF" strokeWidth="2" points={it.history.map((v, idx) => `${(idx/(it.history.length-1))*120},${36 - (v/100)*32}`).join(" ")} />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Coverage / Risk / Staleness</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: C.muted }}>Average Coverage</span><span style={{ fontWeight: 700 }}>78%</span></div>
              <div style={{ height: 8, background: C.border, borderRadius: 4 }}><div style={{ width: "78%", height: "100%", background: C.green, borderRadius: 4 }} /></div>
              <div style={{ height: 10 }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span style={{ color: C.muted }}>Risky Workspaces</span><span style={{ fontWeight: 700 }}>3</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1, ...styles.card, padding: 12 }}>
                  <div style={{ fontSize: 12, color: C.muted }}>Stale</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.red }}>2</div>
                </div>
                <div style={{ flex: 1, ...styles.card, padding: 12 }}>
                  <div style={{ fontSize: 12, color: C.muted }}>Aging</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.yellow }}>1</div>
                </div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Trust Forecast</div>
            <div style={{ fontSize: 13, color: C.dim, marginBottom: 8 }}>Short-term forecast based on recent trends</div>
            <svg width="100%" height="120" viewBox="0 0 600 120" preserveAspectRatio="none">
              <polyline fill="none" stroke="#22C55E" strokeWidth="3" points="0,70 100,64 200,60 300,62 400,58 500,54 600,56" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lineage Graph Viewer (polished) ───────────────────────────────────────
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

  const getNodeFill = (node) => {
    switch (node.type) {
      case 'Workspace': return C.surface;
      case 'Asset': return C.indigo;
      case 'Project': return C.accentDim;
      case 'Dependency': return C.yellow;
      case 'Passport': return C.green;
      case 'Vendor': return C.orange;
      case 'EvidenceArtifact': return C.border;
      case 'EvidenceMarker': return C.red;
      default: return C.border;
    }
  };

  const getNodeStroke = (node) => {
    if (selected === node.id) return C.text;
    if (node.type === 'EvidenceMarker') return C.red;
    if (node.type === 'Passport') return C.green;
    return C.borderLit;
  };

  const getNodeRadius = (node) => {
    if (node.type === 'Workspace') return 26;
    if (node.type === 'Project') return 20;
    if (node.type === 'Dependency') return 18;
    if (node.type === 'Passport') return 22;
    if (node.type === 'Vendor') return 18;
    return 16;
  };

  const getEvidenceBadgeColor = (node) => {
    if (node.evidenceCompleteness == null) return C.dim;
    const pct = Number(node.evidenceCompleteness);
    if (pct >= 0.8) return C.green;
    if (pct >= 0.5) return C.yellow;
    return C.red;
  };

  const getRiskBadgeColor = (node) => {
    if (!node.risk) return C.dim;
    const risk = `${node.risk}`.toLowerCase();
    if (risk.includes('low') || risk === 'ok' || risk === 'pass') return C.green;
    if (risk.includes('medium') || risk.includes('warn') || risk.includes('caution')) return C.yellow;
    if (risk.includes('high') || risk.includes('critical') || risk.includes('danger')) return C.red;
    return C.dim;
  };

  const renderNodeBadges = (node) => {
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
  };

  const formatPct = (value) => {
    if (value == null || Number.isNaN(Number(value))) return '—';
    return `${Math.round(Number(value) * 100)}%`;
  };

  const getEdgeStyle = (edge) => {
    switch (edge.type) {
      case 'depends_on': return { stroke: C.dim, width: 1, dash: '0', marker: 'arrow' };
      case 'owned_by': return { stroke: C.accentDim, width: 1.3, dash: '0', marker: 'arrow' };
      case 'supplied_by': return { stroke: C.indigo, width: 1.3, dash: '0', marker: 'arrow' };
      case 'passported_by': return { stroke: C.green, width: 1.7, dash: '0', marker: 'arrow' };
      case 'supported_by': return { stroke: C.green, width: 1.2, dash: '4 2', marker: 'arrow' };
      case 'drifted_by': return { stroke: C.orange, width: 1.2, dash: '4 2', marker: 'arrow' };
      case 'abstains_from': return { stroke: C.red, width: 1.2, dash: '3 3', marker: 'arrow' };
      default: return { stroke: C.muted, width: 1, dash: '0', marker: 'arrow' };
    }
  };

  const getTypeLabel = (type) => {
    if (!data?.schema?.nodeTypes) return type;
    const item = data.schema.nodeTypes.find((entry) => entry.type === type);
    return item ? item.type : type;
  };

  const getTypeDescription = (type) => {
    if (!data?.schema?.nodeTypes) return null;
    const item = data.schema.nodeTypes.find((entry) => entry.type === type);
    return item ? item.description : null;
  };

  const findNodeLabel = (nodeId) => {
    return data?.nodes?.find((item) => item.id === nodeId)?.label || nodeId;
  };

  const getNodeConnectionReasons = (node) => {
    if (!data) return [];
    const incoming = data.edges.filter((edge) => edge.target === node.id);
    const reasons = incoming.map((edge) => {
      const sourceLabel = findNodeLabel(edge.source);
      return `${edge.type.replace(/_/g, ' ')} from ${sourceLabel}` + (edge.description ? ` (${edge.description})` : '');
    });
    return reasons.length ? reasons : [`${getTypeLabel(node.type)} node in the trust graph.`];
  };

  useEffect(() => {
    setSelected(activeNodeId || null);
  }, [activeNodeId]);

  const renderNodeShape = (node, x, y) => {
    const fill = getNodeFill(node);
    const stroke = getNodeStroke(node);
    const selectedBg = selected === node.id ? C.accentDim + '44' : 'transparent';

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
  };

  const renderNodeLabel = (node) => {
    const text = (node.label || node.id || '').split(' ').slice(0, 3).join(' ');
    return <text x={0} y={4} textAnchor="middle" style={{ fontSize: 10, fill: C.text, pointerEvents: 'none' }}>{text}</text>;
  };

  const summary = data?.summary || {};
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const visibleNodes = nodes.slice(0, 40);
  const visibleEdges = edges.slice(0, 60);
  const selectedNode = selected ? nodes.find((item) => item.id === selected) : null;
  const nodeColumns = 8;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Lineage Graph</h1>
          <div style={{ fontSize: 13, color: C.dim, marginTop: 6 }}>Visualize dependency lineage, trust propagation, and evidence health across the workspace.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={styles.card}><div style={styles.cardTitle}>Trust Score</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary.score ?? '—'}/100</div><div style={{ marginTop: 8, color: C.dim }}>{summary.narrative?.split('. ')[0] || 'Graph trust rating.'}</div></div>
        <div style={styles.card}><div style={styles.cardTitle}>Evidence Confidence</div><div style={{ fontSize: 28, fontWeight: 700 }}>{summary.confidence ?? '—'}%</div><div style={{ marginTop: 8, color: C.dim }}>Calculated from evidence completeness across nodes.</div></div>
        <div style={styles.card}><div style={styles.cardTitle}>Nodes</div><div style={{ fontSize: 28, fontWeight: 700 }}>{nodes.length}</div><div style={{ marginTop: 8, color: C.dim }}>Showing first {visibleNodes.length} nodes.</div></div>
        <div style={styles.card}><div style={styles.cardTitle}>Edges</div><div style={{ fontSize: 28, fontWeight: 700 }}>{edges.length}</div><div style={{ marginTop: 8, color: C.dim }}>Showing first {visibleEdges.length} edges.</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 320px', gap: 20 }}>
        <div style={{ ...styles.card, position: 'relative' }}>
          {loading ? <div style={{ color: C.dim }}>Loading graph…</div> : data ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: C.muted }}>Nodes: {nodes.length} · Edges: {edges.length}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...styles.badge(C.indigo) }}>Asset</span>
                  <span style={{ ...styles.badge(C.accentDim) }}>Project</span>
                  <span style={{ ...styles.badge(C.yellow) }}>Dependency</span>
                  <span style={{ ...styles.badge(C.green) }}>Passport</span>
                </div>
              </div>
              <svg width="100%" height="420" viewBox="0 0 560 420" style={{ background: C.surface, borderRadius: 12 }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                {visibleEdges.map((edge, i) => {
                  const sourceIndex = nodes.findIndex((n) => n.id === edge.source);
                  const targetIndex = nodes.findIndex((n) => n.id === edge.target);
                  if (sourceIndex === -1 || targetIndex === -1) return null;
                  const sourceX = 40 + (sourceIndex % nodeColumns) * 60;
                  const sourceY = 50 + Math.floor(sourceIndex / nodeColumns) * 60;
                  const targetX = 40 + (targetIndex % nodeColumns) * 60;
                  const targetY = 50 + Math.floor(targetIndex / nodeColumns) * 60;
                  const style = getEdgeStyle(edge);
                  return (
                    <line
                      key={edge.id}
                      x1={sourceX}
                      y1={sourceY}
                      x2={targetX}
                      y2={targetY}
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                      markerEnd="url(#arrow)"
                      opacity={0.8}
                    />
                  );
                })}
                {visibleNodes.map((node, i) => {
                  const x = 40 + (i % nodeColumns) * 60;
                  const y = 50 + Math.floor(i / nodeColumns) * 60;
                  const isSel = selected === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${x},${y})`}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(event) => setHovered({ node, x: event.clientX, y: event.clientY })}
                      onMouseMove={(event) => setHovered({ node, x: event.clientX, y: event.clientY })}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        setSelected(node.id);
                        if (onActiveNodeIdChange) onActiveNodeIdChange(node.id);
                      }}
                    >
                      {renderNodeShape(node, x, y)}
                      {renderNodeLabel(node)}
                      {renderNodeBadges(node)}
                      {isSel && <circle r={getNodeRadius(node) + 8} fill="none" stroke={C.accent} strokeWidth={1.5} opacity={0.7} />}
                    </g>
                  );
                })}
              </svg>
              {hovered && hovered.node && (
                <div style={{ position: 'absolute', top: hovered.y - 72, left: hovered.x - 28, minWidth: 180, background: '#111111dd', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, pointerEvents: 'none', zIndex: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{hovered.node.label || hovered.node.id}</div>
                  <div style={{ fontSize: 11, color: C.dim, margin: '6px 0 0' }}>{getTypeDescription(hovered.node.type) || hovered.node.type}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, fontSize: 11 }}>
                    <div><strong>{hovered.node.trust ?? '—'}</strong><div style={{ color: C.dim }}>Trust</div></div>
                    <div><strong>{hovered.node.confidence ?? '—'}</strong><div style={{ color: C.dim }}>Confidence</div></div>
                    <div><strong>{formatPct(hovered.node.evidenceCompleteness)}</strong><div style={{ color: C.dim }}>Evidence</div></div>
                    <div><strong>{hovered.node.risk || 'Unknown'}</strong><div style={{ color: C.dim }}>Risk</div></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ color: C.dim }}>Graph unavailable — requires authenticated workspace or demo mode.</div>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Why this graph matters</div>
            <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>{data?.narrative || 'This graph shows how trust flows from evidence, dependencies, and passports across your workspace.'}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Legend</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {['owned_by', 'depends_on', 'passported_by', 'supported_by', 'drifted_by', 'abstains_from'].map((type) => {
                const style = getEdgeStyle({ type });
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <svg width="80" height="12"><line x1="0" y1="6" x2="80" y2="6" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} markerEnd="url(#arrow)" /></svg>
                    <span style={{ fontSize: 12, color: C.text }}>{type.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {selectedNode ? (
            <div style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{getTypeLabel(selectedNode.type)}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedNode.label || selectedNode.id}</div>
                </div>
                <button style={styles.btn('ghost')} onClick={() => setSelected(null)}>Clear</button>
              </div>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ padding: 12, background: C.bg, borderRadius: 8 }}><div style={{ fontSize: 11, color: C.muted }}>Trust</div><div style={{ fontSize: 16, fontWeight: 700 }}>{selectedNode.trust ?? '—'}</div></div>
                  <div style={{ padding: 12, background: C.bg, borderRadius: 8 }}><div style={{ fontSize: 11, color: C.muted }}>Confidence</div><div style={{ fontSize: 16, fontWeight: 700 }}>{selectedNode.confidence ?? '—'}</div></div>
                  <div style={{ padding: 12, background: C.bg, borderRadius: 8 }}><div style={{ fontSize: 11, color: C.muted }}>Evidence</div><div style={{ fontSize: 16, fontWeight: 700 }}>{formatPct(selectedNode.evidenceCompleteness)}</div></div>
                  <div style={{ padding: 12, background: C.bg, borderRadius: 8 }}><div style={{ fontSize: 11, color: C.muted }}>Risk</div><div style={{ fontSize: 16, fontWeight: 700 }}>{selectedNode.risk || 'Unknown'}</div></div>
                </div>
                <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>{getTypeDescription(selectedNode.type) || 'This node is part of the trust graph and is connected by evidence-backed relationships.'}</div>
                <div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Why is this node here?</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {getNodeConnectionReasons(selectedNode).slice(0, 4).map((reason, index) => (
                      <div key={index} style={{ fontSize: 12, color: C.text, background: C.bg, padding: 10, borderRadius: 8, border: `1px solid ${C.border}` }}>{reason}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.card}>
              <div style={styles.cardTitle}>Select a node</div>
              <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.7 }}>Click a node to inspect trust, evidence, risk, and the relationships that place it in the graph.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Reports Export (scaffold) ───────────────────────────────────────────
function ReportsExport() {
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    try {
      setExporting(true);
      const resp = await apiJson('/api/demo/export');
      downloadJson('msp-executive-export.json', resp);
    } catch (err) {
      alert(err.message);
    } finally { setExporting(false); }
  };
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>MSP Executive Export</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>Download a demo executive export (CSV/JSON) for monthly reporting.</div>
      <div style={{ ...styles.card }}>
        <div style={{ marginBottom: 12 }}>
          <button style={styles.btn('primary')} onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting…' : 'Download Executive Export'}</button>
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>Exports are generated from persisted MSP data. This demo uses synthetic data.</div>
      </div>
    </div>
  );
}

// ── Compliance Exports (scaffold) ────────────────────────────────────────
function ComplianceExports() {
  const handleCompliance = () => {
    alert('Compliance export scaffold — implement mapping to /api/msp/:id/export');
  };
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Compliance Exports</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>Generate compliance-grade export packages for auditors.</div>
      <div style={{ ...styles.card }}>
        <button style={styles.btn('primary')} onClick={handleCompliance}>Generate Compliance Package</button>
      </div>
    </div>
  );
}

// ── Billing Integration (scaffold) ───────────────────────────────────────
function BillingIntegration() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let alive = true;
    apiJson('/api/msp/mode').then((r) => { if (alive) setStatus(r); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Billing</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>Stripe integration and billing management.</div>
      <div style={{ ...styles.card }}>
        <div style={{ marginBottom: 8 }}>Billing status: <strong>{status?.mode || 'unknown'}</strong></div>
        <div style={{ fontSize: 13, color: C.muted }}>This is a scaffold for Stripe billing flows and portal integration.</div>
      </div>
    </div>
  );
}

// ── Vendor Portal ─────────────────────────────────────────────────────────
function VendorPortal() {
  const [vendors, setVendors] = useState([]);
  useEffect(() => {
    let alive = true;
    // demo placeholder: load passports as vendor listings
    apiJson('/api/passports').then((r) => { if (!alive) return; setVendors((r.passports||[]).slice(0,8)); }).catch(()=>{});
    return () => { alive = false; };
  }, []);
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vendor Portal</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>A curated vendor listing and verification workspace.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {(vendors.length ? vendors : [{name:'Vendor A'},{name:'Vendor B'},{name:'Vendor C'}]).map((v,i)=> (
          <div key={i} style={styles.card}><div style={{fontSize:14,fontWeight:700}}>{v.name||v.assetName}</div><div style={{fontSize:12,color:C.dim,marginTop:8}}>Verified vendor record</div></div>
        ))}
      </div>
    </div>
  );
}

// ── Enterprise Portal ─────────────────────────────────────────────────────
function EnterprisePortal() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Enterprise Portal</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 12 }}>Enterprise administration: SSO, RBAC, and tenant controls.</div>
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: C.muted }}>SSO status</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>Not configured</div>
      </div>
    </div>
  );
}

// ── Public Registry (landing) ────────────────────────────────────────────
function PublicRegistry() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <img src="/logo-seal.svg" alt="seal" style={{ width: 48, height: 48 }} />
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Public Registry</h1>
          <div style={{ fontSize: 13, color: C.dim }}>Search the global register of software passports.</div>
        </div>
      </div>
      <div style={styles.card}>
        <div style={{ fontSize: 13, color: C.muted }}>Search</div>
        <input style={{ ...styles.input, marginTop: 8 }} placeholder="Search public registry by asset, passport id, or company" />
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ onAnalyze }) {
  const [assets, setAssets] = useState([]);
  const [scans, setScans] = useState([]);
  const [passports, setPassports] = useState([]);
  const [demoMsp, setDemoMsp] = useState(null);
  const [loadState, setLoadState] = useState("loading");

  useEffect(() => {
    let alive = true;
    async function loadDashboard() {
      try {
        const [assetData, scanData, passportData, mspData] = await Promise.all([
          apiJson("/api/assets"),
          apiJson("/api/scans"),
          apiJson("/api/passports"),
          apiJson("/api/demo/msp").catch(() => null),
        ]);
        if (!alive) return;
        setAssets(assetData.assets || []);
        setScans(scanData.scans || []);
        setPassports(passportData.passports || []);
        setDemoMsp(mspData?.demo || null);
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

  const recentScans = (scans.length ? scans : fallbackScans).slice(0, 6);
  const assetCount = assets.length || 47;
  const avgScore = assets.length ? Math.round(assets.reduce((sum, a) => sum + (a.trust || 0), 0) / assets.length) : 72;
  const highRiskCount = assets.filter((a) => ["High", "Critical"].includes(a.risk)).length || 3;
  const passportCount = passports.length || 31;
  const staleCount = Math.max(0, assetCount - passportCount + 2);
  const growthSignal = scans.length ? Math.max(1, Math.round(scans.length / Math.max(1, assetCount))) : 3;
  const riskColor = (r) => r === "Low" ? C.green : r === "Medium" ? C.yellow : r === "High" ? C.orange : C.red;

  const actions = [
    {
      title: "Close the highest-risk gaps",
      detail: `${highRiskCount} assets need immediate attention. Prioritize the weakest trust signals first.`,
      tone: C.red,
    },
    {
      title: "Issue or renew passports",
      detail: `${passportCount} passports are active, but ${staleCount} assets look under-covered and need renewal attention.`,
      tone: C.yellow,
    },
    {
      title: "Expand monitored coverage",
      detail: `Your platform is moving fast. Add monitoring to ${Math.max(1, Math.round(assetCount * 0.12))} more dependencies this week.`,
      tone: C.green,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>CEO Command Center</h1>
            <p style={{ fontSize: 14, color: C.dim, margin: "6px 0 0" }}>
              Every signal, alert, and growth opportunity in one place.
            </p>
          </div>
          <button style={styles.btn("primary")} onClick={onAnalyze}>+ New Analysis</button>
        </div>
      </div>

      {loadState === "fallback" && (
        <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16, fontSize: 13 }}>
          API unavailable. Showing fallback portfolio data until the backend responds.
        </div>
      )}

      <div className="metric-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        {[
          { label: "Assets under watch", value: loadState === "loading" ? "..." : assetCount, sub: "platform surface area", color: C.accent },
          { label: "Average trust", value: loadState === "loading" ? "..." : avgScore, sub: "from latest scans", color: C.green },
          { label: "High-risk signals", value: highRiskCount, sub: "needs board attention", color: C.red },
          { label: "Active passports", value: passportCount, sub: "issued and live", color: C.indigo },
        ].map((s) => (
          <div key={s.label} style={{ ...styles.card }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, marginBottom: 16 }}>
        <div style={{ ...styles.card }}>
          <div style={styles.cardTitle}>Growth pulse</div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: C.green }} />
            <div style={{ fontSize: 14, color: C.text }}>
              {growthSignal} new trust signals are moving through the platform this week.
            </div>
          </div>
          <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
            {demoMsp?.name ? `MSP posture: ${demoMsp.name}` : "The platform is healthy enough to scale."} Keep the trust loop active by closing risk gaps before they become public incidents.
          </div>
        </div>
        <div style={{ ...styles.card }}>
          <div style={styles.cardTitle}>What to do next</div>
          <div style={{ display: "grid", gap: 10 }}>
            {actions.map((action) => (
              <div key={action.title} style={{ padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: action.tone }}>{action.title}</div>
                <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{action.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={styles.cardTitle}>Recent analyses</div>
            <span style={{ fontSize: 12, color: C.muted }}>Live trust feed</span>
          </div>
          <div className="table-scroll"><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Asset", "Trust", "Risk", "When", "Status"].map((h) => (
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
                  <td style={{ padding: "12px 0", fontSize: 12, color: C.accent }}>Persisted</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Board-level alerts</div>
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
function Passport({ generated = [], activePassportId, onActivePassportIdChange }) {
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
          <div key={p.id || p.name} style={{ ...styles.card, cursor: "pointer", transition: "border-color 0.15s" }} onClick={() => {
            setSelected(i);
            onActivePassportIdChange?.(p.id);
          }}>
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
    const runId = `run-${Date.now()}`;
    const data = await apiJson(`/api/projects/${encodeURIComponent(projectId)}/run-pipeline`, { method: "POST", body: JSON.stringify({ runId }) });
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
const pipelineRuns = (project?.events || []).filter((event) => event.type === "PIPELINE_RUN_REQUESTED");
const lastPipelineEvent = pipelineRuns[0] || null;
const lastPipelineStatus = latestScore
  ? `Last score ${scoreLabel} (${riskBand}) computed ${timeAgo(lastPipelineEvent?.timestamp)}`
  : lastPipelineEvent
    ? `Pipeline started ${timeAgo(lastPipelineEvent.timestamp)}`
    : "No pipeline runs yet";
const pipelineRunCount = pipelineRuns.length;

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
        <div style={{ marginTop: 8, fontSize: 12, color: C.dim }}>{pipelineRunCount ? `${pipelineRunCount} pipeline run${pipelineRunCount === 1 ? "" : "s"}` : "No pipeline runs yet"}</div>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button style={styles.btn("ghost")} onClick={() => onNavigate("/projects")}>← Back to projects</button>
        <button style={styles.btn("primary")} onClick={handleRunPipeline} disabled={busy}>{busy ? "Running…" : "Run pipeline"}</button>
      </div>
    </div>

    {actionError && <div style={{ ...styles.card, borderColor: C.yellow, color: C.yellow, marginBottom: 16 }}>{actionError}</div>}
    <div style={{ ...styles.card, marginBottom: 16, borderColor: C.borderLit }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={styles.cardTitle}>Pipeline status</div>
        <div style={{ fontSize: 12, color: C.dim }}>{pipelineRunCount ? `${pipelineRunCount} run${pipelineRunCount === 1 ? "" : "s"}` : "No runs yet"}</div>
      </div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{lastPipelineStatus}</div>
      {lastPipelineEvent?.details?.runId && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.dim }}>Run ID: {lastPipelineEvent.details.runId}</div>
      )}
    </div>
    <div style={{ fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Score panel</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
      <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Trust Score</div><div style={{ fontSize: 30, fontWeight: 700, color: C.text }}>{scoreLabel}</div></div>
      <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Confidence</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{confidenceLabel}</div></div>
      <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Risk band</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{riskBand}</div></div>
      <div style={{ ...styles.card, padding: 16 }}><div style={{ fontSize: 12, color: C.muted }}>Model version</div><div style={{ fontSize: 24, fontWeight: 700, color: C.text }}>{modelVersion}</div></div>
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

// ── Authentication Page ────────────────────────────────────────────────────
function AuthPage({ mode, onModeChange, email, setEmail, password, setPassword, name, setName, workspaceName, setWorkspaceName, onSubmit, loading, error }) {
  return (
    <div style={{ ...styles.app }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, justifyContent: "center" }}>
            <div style={{ ...styles.logoMark, width: 32, height: 32, fontSize: 16 }}>ᑯ</div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>VentureOS</div>
          </div>

          {/* Form Card */}
          <div style={{ ...styles.card, marginBottom: 24 }}>
            {/* Heading */}
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, marginBottom: 8 }}>
                {mode === "login" ? "Sign in to VentureOS" : "Create your VentureOS account"}
              </h1>
              <p style={{ fontSize: 13, color: C.dim, margin: 0 }}>
                {mode === "login"
                  ? "Enter your credentials to access your workspace"
                  : "Set up your account and create your first workspace"}
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div style={{ ...styles.card, borderColor: C.red, color: C.yellow, marginBottom: 16, fontSize: 12, padding: 12 }}>
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
              {mode === "signup" && (
                <>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Full Name</span>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={styles.input}
                      required
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Workspace Name</span>
                    <input
                      type="text"
                      placeholder="Your organization or team name"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      style={styles.input}
                      required
                    />
                  </label>
                </>
              )}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={styles.input}
                  required
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={styles.input}
                  required
                />
              </label>

              <button
                type="submit"
                style={{ ...styles.btn("primary"), width: "100%", justifyContent: "center", marginTop: 8 }}
                disabled={loading}
              >
                {loading ? "Processing…" : mode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            {/* Mode Toggle */}
            <div style={{ marginTop: 20, textAlign: "center" }}>
              <span style={{ fontSize: 13, color: C.dim }}>
                {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: C.accent,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    padding: 0,
                  }}
                  onClick={() => {
                    onModeChange(mode === "login" ? "signup" : "login");
                    setEmail("");
                    setPassword("");
                    setName("");
                    setWorkspaceName("");
                  }}
                >
                  {mode === "login" ? "Sign up" : "Sign in"}
                </button>
              </span>
            </div>
          </div>

          {/* Demo Mode Info */}
          <div style={{ ...styles.card, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Demo Credentials</div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>
              <div>Email: <span style={{ color: C.text, fontFamily: "monospace" }}>demo@ventureos.local</span></div>
              <div>Password: <span style={{ color: C.text, fontFamily: "monospace" }}>demo123</span></div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, color: C.muted }}>
            <div style={{ marginBottom: 8 }}>Software Trust Intelligence Platform</div>
            <div>© 2026 VentureOS. All rights reserved.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EvidenceDetail({ evidenceId }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEvidence(null);

    if (!evidenceId) {
      setLoading(false);
      return () => { active = false; };
    }

    apiJson(`/api/spr/evidence/${encodeURIComponent(evidenceId)}`)
      .then((result) => {
        if (!active) return;
        setEvidence(result.evidence || null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Unable to load evidence details.');
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => { active = false; };
  }, [evidenceId]);

  if (loading) {
    return <div>Loading evidence details…</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  if (!evidence) {
    return <div>No evidence selected.</div>;
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Evidence details</h1>
      <div style={{ fontSize: 13, color: C.dim, marginBottom: 16 }}>Inspect evidence and related trust metadata.</div>
      <div style={styles.card}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={styles.cardTitle}>Title</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{evidence.title || evidence.id}</div>
          </div>
          <div>
            <div style={styles.cardTitle}>Type</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{evidence.type || 'Unknown'}</div>
          </div>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Verified</div>
            <div>{evidence.verificationStatus === 'verified' || evidence.verified ? 'Yes' : 'No'}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Visibility</div>
            <div>{evidence.visibility || 'public'}</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Source</div>
            <div>{evidence.source || 'Unknown'}</div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={styles.cardTitle}>Summary</div>
          <div style={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>{evidence.summary || 'No summary available.'}</div>
        </div>
        {evidence.uri ? (
          <div style={{ marginTop: 18 }}>
            <div style={styles.cardTitle}>URI</div>
            <a href={evidence.uri} target="_blank" rel="noreferrer" style={{ fontSize: 14, color: C.accent }}>{evidence.uri}</a>
          </div>
        ) : null}
        {evidence.softwareId ? (
          <div style={{ marginTop: 18 }}>
            <div style={styles.cardTitle}>Related software</div>
            <div style={{ fontSize: 14 }}>
              {evidence.softwareId}
            </div>
          </div>
        ) : null}
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
  const [activePassportId, setActivePassportId] = useState(null);
  const [activeEvidenceId, setActiveEvidenceId] = useState(null);
  const [activeGraphNodeId, setActiveGraphNodeId] = useState(null);
  const [currentRoute, setCurrentRoute] = useState(typeof window !== 'undefined' ? window.location.pathname : '/');
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
  
  // Command bar state
  const [isCommandBarOpen, setCommandBarOpen] = useState(false);
  const { refresh: refreshWorkspace, workspaceRefreshKey } = useWorkspaceMutation();
  const hydrateActiveEntity = () => {
    const route = currentRoute || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const passportMatch = route.match(/^\/passport\/([^/]+)$/);
    if (passportMatch) {
      return { entityId: decodeURIComponent(passportMatch[1]), entityType: 'passport' };
    }
    const evidenceMatch = route.match(/^\/evidence\/([^/]+)$/);
    if (evidenceMatch) {
      return { entityId: decodeURIComponent(evidenceMatch[1]), entityType: 'evidence' };
    }
    const graphMatch = route.match(/^\/lineage(?:\?|$)/);
    if (graphMatch) {
      const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
      const node = searchParams.get('node');
      if (node) {
        return { entityId: node, entityType: 'graph-node' };
      }
    }
    const fileMatch = route.match(/^\/files\/([^/]+)$/);
    if (fileMatch) {
      return { entityId: decodeURIComponent(fileMatch[1]), entityType: 'file' };
    }
    const integrationMatch = route.match(/^\/integrations\/([^/]+)$/);
    if (integrationMatch) {
      return { entityId: decodeURIComponent(integrationMatch[1]), entityType: 'integration' };
    }
    const userMatch = route.match(/^\/users\/([^/]+)$/);
    if (userMatch) {
      return { entityId: decodeURIComponent(userMatch[1]), entityType: 'user' };
    }
    if (activeEvidenceId) {
      return { entityId: activeEvidenceId, entityType: 'evidence' };
    }
    if (activePassportId) {
      return { entityId: activePassportId, entityType: 'passport' };
    }
    if (activeGraphNodeId) {
      return { entityId: activeGraphNodeId, entityType: 'graph-node' };
    }
    return undefined;
  };

  const activeEntity = hydrateActiveEntity();

  const workspaceId = workspace?.id || undefined;
  const activePassportContextId = activePassportId || publicPassportId || undefined;
  const activeEvidenceContextId = activeEvidenceId || (activeEntity?.entityType === 'evidence' ? activeEntity.entityId : undefined);

  const commandContext = {
    workspaceId,
    activeEntity,
    activePassportId: activePassportContextId,
    activeEvidenceId: activeEvidenceContextId,
    activeFileId: undefined,
    activeGraphNodeId: activeGraphNodeId || undefined,
    activeIntegrationId: undefined,
    activeUserId: user?.id || undefined,
    currentPage: page,
    currentRoute,
    refreshWorkspace,
    workspaceRefreshKey,
  };

  const [graphCommands, setGraphCommands] = useState([]);

  useEffect(() => {
    let active = true;
    if (!workspaceId) {
      setGraphCommands([]);
      return;
    }

    hydrateInteractionGraph(commandContext)
      .then((graph) => {
        if (!active) return;
        setGraphCommands(buildGraphCommands(graph, commandContext));
      })
      .catch((error) => {
        console.warn('Failed to hydrate interaction graph:', error);
        if (!active) return;
        setGraphCommands([]);
      });

    return () => {
      active = false;
    };
  }, [workspaceId, activeEntity?.entityId, activeEntity?.entityType, activePassportContextId, activeEvidenceContextId, activeGraphNodeId, workspaceRefreshKey]);

  const allCommands = [...useCommandRegistry(commandContext), ...graphCommands];

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

  // Keyboard binding for command bar (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handler = (e) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const isShortcut =
        (isMac && e.metaKey && e.key === 'k') ||
        (!isMac && e.ctrlKey && e.key === 'k');

      if (isShortcut) {
        e.preventDefault();
        setCommandBarOpen(open => !open);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const refreshSession = async (workspaceId) => {
    const data = await apiJson("/api/auth/session", { workspaceId });
    setAuthenticated(true);
    setUser(data.user);
    setWorkspace(data.workspace);
    setRole(data.role);
    setMemberships(data.memberships || []);
    setMspMemberships(data.mspMemberships || []);
    if (typeof window !== "undefined") {
      window.__VENTUREOS_WORKSPACE_ID__ = data.workspace?.id || null;
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
        window.__VENTUREOS_WORKSPACE_ID__ = null;
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
      setCurrentRoute(pathname);
      const passportMatch = pathname.match(/^\/passport\/([^/]+)$/);
      if (passportMatch) {
        setPublicPassportId(decodeURIComponent(passportMatch[1]));
      } else {
        setPublicPassportId(null);
      }

        const evidenceMatch = pathname.match(/^\/evidence\/([^/]+)$/);
      if (evidenceMatch) {
        setActiveEvidenceId(decodeURIComponent(evidenceMatch[1]));
        setPage('evidence');
      } else {
        setActiveEvidenceId(null);
      }

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
    { id: "trust", label: "Trust" },
    { id: "lineage", label: "Lineage" },
    { id: "analyze", label: "Analyze" },
    { id: "projects", label: "Projects" },
    { id: "registry", label: "Registry" },
    { id: "passports", label: "Passports" },
    { id: "reports", label: "Reports" },
    { id: "compliance", label: "Compliance" },
    { id: "billing", label: "Billing" },
    { id: "vendor", label: "Vendor" },
    { id: "enterprise", label: "Enterprise" },
    { id: "public-registry", label: "Public Registry" },
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
          <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src="/logo-seal.svg" alt="SPR seal" style={{ width: 26, height: 26 }} />
                  </div>
                  SOFTWARE PASSPORT REGISTRY
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
                {workspaces.map((item) => {
                  const id = String(item.workspaceId || item.id || "");
                  const label = String(item.name || item.workspace?.name || item.name || id);
                  return (
                    <option key={id} value={id}>
                      {label + (item.role ? ` (${item.role})` : "")}
                    </option>
                  );
                })}
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: C.text }}>{user?.name || user?.email}</span>
                <button style={styles.btn("ghost")} onClick={handleLogout}>Logout</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={styles.btn("primary")} onClick={() => setAuthMode("login")}>Sign in</button>
              <button style={styles.btn()} onClick={async () => {
                try {
                  await apiJson("/api/auth/demo-login", { method: "POST" });
                  await refreshSession();
                  setPage("dashboard");
                } catch (err) {
                  setAuthError(err.message);
                }
              }}>Try demo</button>
            </div>
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
            {page === "trust" && <TrustViz />}
            {page === "lineage" && <LineageGraph activeNodeId={activeGraphNodeId} onActiveNodeIdChange={setActiveGraphNodeId} />}
            {page === "reports" && <ReportsExport />}
            {page === "compliance" && <ComplianceExports />}
            {page === "billing" && <BillingIntegration />}
            {page === "vendor" && <VendorRegistry />}
            {page === "passport" && <PassportDashboard workspaceId={workspaces[0]?.id || 'demo_workspace'} vendorId={(vendors && vendors[0] && vendors[0].id) || 'demo_vendor'} />}
            {page === "enterprise" && <EnterprisePortal />}
            {page === "public-registry" && <PublicRegistry />}
            {page === "analyze" && <Analysis onComplete={(passport) => { if (passport) setGeneratedPassports((items) => [passport, ...items]); setPage("passports"); }} />}
            {page === "projects" && <Projects route={projectRoute} onNavigate={navigateProjectPath} />}
            {page === "registry" && <SoftwareRegistry />}
            {page === "passports" && <Passport generated={generatedPassports} activePassportId={activePassportId} onActivePassportIdChange={setActivePassportId} />}
            {page === "msp" && <MspPage mspList={mspList} selectedMspId={selectedMspId} setSelectedMspId={setSelectedMspId} details={mspDetails} loading={mspLoading} error={mspError} />}
            {["monitoring", "reports", "alerts", "team"].includes(page) && <WorkspacePage type={page} />}
          </main>
        </div>
      )}
      
      {/* Universal Command Bar */}
      {authenticated && (
        <UniversalCommandBar
          context={commandContext}
          isOpen={isCommandBarOpen}
          onClose={() => setCommandBarOpen(false)}
          allCommands={allCommands}
        />
      )}
    </div>
  );
}





