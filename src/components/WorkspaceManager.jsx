import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api-client.js";

const styles = {
  shell: { display: "grid", gap: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 24, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 14, color: "#8F8A84", marginTop: 4 },
  card: { background: "#0A0A0A", border: "1px solid #141414", borderRadius: 16, padding: 20 },
  button: { background: "#C9A86A", color: "#000", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #252525", background: "#070707", color: "#F8F9FA" },
  list: { display: "grid", gap: 12 },
  item: { background: "#0A0A0A", border: "1px solid #252525", borderRadius: 14, padding: 16, cursor: "pointer" },
  badge: { display: "inline-flex", borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, background: "#141414", color: "#C9A86A" },
};

export default function WorkspaceManager({ route = "list", workspaceId, onNavigate }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState("");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoadState("loading");
    setError("");
    apiJson("/api/workspaces")
      .then((data) => {
        if (!alive) return;
        setWorkspaces(data.workspaces || []);
        setLoadState("ready");
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || "Unable to load workspaces.");
        setLoadState("error");
      });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (route !== "detail" || !workspaceId) {
      setSelectedWorkspace(null);
      setMembers([]);
      return;
    }

    let alive = true;
    setError("");
    Promise.all([
      apiJson(`/api/workspaces/${encodeURIComponent(workspaceId)}`, { workspaceId }),
      apiJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, { workspaceId }),
    ])
      .then(([workspaceData, membersData]) => {
        if (!alive) return;
        setSelectedWorkspace(workspaceData.workspace || null);
        setMembers(membersData.members || []);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message || "Unable to load workspace details.");
      });

    return () => {
      alive = false;
    };
  }, [route, workspaceId]);

  const primaryWorkspace = useMemo(() => workspaces[0] || null, [workspaces]);
  const workspaceCount = workspaces.length;

  const handleCreateWorkspace = async () => {
    if (!createName.trim()) {
      setError("Workspace name is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const response = await apiJson("/api/workspaces", { method: "POST", body: JSON.stringify({ name: createName.trim() }) });
      if (response.workspace) {
        setCreateName("");
        setRefreshKey((prev) => prev + 1);
        onNavigate?.(`/workspaces/${encodeURIComponent(response.workspace.id)}`);
      }
    } catch (err) {
      setError(err.message || "Unable to create workspace.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={styles.shell}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Workspaces</h1>
          <p style={styles.subtitle}>Manage client workspaces, team membership, and SPR tenant contexts.</p>
        </div>
        <button style={styles.button} onClick={() => onNavigate?.("/workspaces/new")}>Create workspace</button>
      </div>

      {error ? <div style={{ ...styles.card, color: "#F87171" }}>{error}</div> : null}

      {route === "new" ? (
        <div style={styles.card}>
          <div style={{ fontSize: 13, color: "#8F8A84", marginBottom: 12 }}>Create a new workspace for a client or team.</div>
          <input
            style={styles.input}
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            placeholder="Workspace name"
          />
          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={styles.button} onClick={handleCreateWorkspace} disabled={creating}>
              {creating ? "Creating…" : "Create workspace"}
            </button>
            <button
              type="button"
              style={{ ...styles.button, background: "transparent", color: "#F8F9FA", border: "1px solid #252525" }}
              onClick={() => onNavigate?.("/workspaces")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : route === "detail" && selectedWorkspace ? (
        <div style={styles.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0 }}>{selectedWorkspace.name}</h2>
              <p style={{ margin: "6px 0 0", color: "#8F8A84" }}>Workspace ID {selectedWorkspace.id}</p>
            </div>
            <span style={styles.badge}>{selectedWorkspace.role || "Member"}</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 20 }}>
            <div style={{ background: "#050505", border: "1px solid #252525", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#8F8A84", marginBottom: 8 }}>Created</div>
              <div style={{ fontSize: 14 }}>{selectedWorkspace.createdAt ? new Date(selectedWorkspace.createdAt).toLocaleDateString() : "Unknown"}</div>
            </div>
            <div style={{ background: "#050505", border: "1px solid #252525", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#8F8A84", marginBottom: 8 }}>Members</div>
              <div style={{ fontSize: 14 }}>{members.length}</div>
            </div>
            <div style={{ background: "#050505", border: "1px solid #252525", borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#8F8A84", marginBottom: 8 }}>Workspace scope</div>
              <div style={{ fontSize: 14 }}>{selectedWorkspace.workspaceId || selectedWorkspace.id}</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: "#8F8A84", marginBottom: 10 }}>Members</div>
            {members.length ? (
              <div style={styles.list}>
                {members.map((member) => (
                  <div key={member.id || member.userId} style={{ ...styles.item, cursor: "default" }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{member.email || member.userId || "Member"}</div>
                    <div style={{ fontSize: 12, color: "#B4B0AA" }}>{member.role || "Viewer"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "#8F8A84", fontSize: 13 }}>No members are defined for this workspace yet.</div>
            )}
          </div>

          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={styles.button} onClick={() => onNavigate?.("/workspaces")}>Back to workspaces</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={styles.card}>
            <div style={{ fontSize: 13, color: "#8F8A84", marginBottom: 12 }}>Client workspace summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div style={{ background: "#050505", border: "1px solid #252525", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#8F8A84" }}>Workspaces</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{loadState === "loading" ? "…" : workspaceCount}</div>
              </div>
              <div style={{ background: "#050505", border: "1px solid #252525", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#8F8A84" }}>Primary workspace</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{primaryWorkspace?.name || "None"}</div>
              </div>
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 18, margin: 0 }}>Workspace list</h2>
                <div style={{ fontSize: 12, color: "#8F8A84" }}>Select a workspace to inspect membership and context.</div>
              </div>
            </div>

            {loadState === "loading" ? (
              <div style={{ color: "#8F8A84" }}>Loading workspaces…</div>
            ) : workspaces.length === 0 ? (
              <div style={{ color: "#8F8A84" }}>No workspaces found. Create one to begin onboarding clients.</div>
            ) : (
              <div style={styles.list}>
                {workspaces.map((workspace) => (
                  <div
                    key={workspace.id}
                    style={styles.item}
                    onClick={() => onNavigate?.(`/workspaces/${encodeURIComponent(workspace.id)}`)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{workspace.name}</div>
                        <div style={{ fontSize: 12, color: "#8F8A84" }}>{workspace.id}</div>
                      </div>
                      <span style={styles.badge}>{workspace.role || "Owner"}</span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#B4B0AA" }}>
                      {workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "Created date unavailable"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
