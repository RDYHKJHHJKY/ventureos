import React, { useEffect, useState } from 'react';
import { apiJson } from '../api-client.js';

export default function PassportViewer() {
  const [passports, setPassports] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const res = await apiJson('/api/passports');
      setPassports(res.passports || []);
      // try to fetch current workspace id for report export
      try {
        const session = await apiJson('/api/auth/session');
        setWorkspaceId(session.workspace?.id || null);
      } catch (e) {}
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading passports…</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>Passports</h2>
      {workspaceId && <div style={{ marginBottom: 12 }}><button onClick={() => window.open(`/api/reports/workspace/${workspaceId}/procurement`, '_blank')}>Export Procurement Report</button></div>}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>Id</th><th>Asset</th><th>Trust</th><th>Verdict</th><th>Issued</th></tr>
        </thead>
        <tbody>
          {passports.map(p => (
            <tr key={p.passportId} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{p.passportId}</td>
              <td style={{ padding: 8 }}><a href={`/passport/${encodeURIComponent(p.passportId)}`}>{p.assetName}</a></td>
              <td style={{ padding: 8 }}>{p.trustScore}</td>
              <td style={{ padding: 8 }}>{p.verdict}</td>
              <td style={{ padding: 8 }}>{p.issuedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
