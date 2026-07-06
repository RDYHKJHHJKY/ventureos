import React, { useEffect, useState } from 'react';
import { apiJson } from '../api-client.js';

export default function Integrations() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingType, setAddingType] = useState('github');

  async function load() {
    try {
      setLoading(true);
      const r = await apiJson('/api/integrations');
      setList(r.integrations || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    try {
      await apiJson('/api/integrations', { method: 'POST', body: JSON.stringify({ type: addingType }) });
      await load();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  async function handleRotate(workspaceId) {
    try {
      await apiJson('/api/integrations/rotate-key', { method: 'POST', body: JSON.stringify({ workspaceId }) });
      await load();
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  return (
    <div>
      <h2>Integrations</h2>
      <div style={{ marginBottom: 12 }}>
        <label>Type: </label>
        <select value={addingType} onChange={(e) => setAddingType(e.target.value)}>
          <option value="github">GitHub</option>
          <option value="generic">Generic</option>
        </select>
        <button onClick={handleAdd} style={{ marginLeft: 8 }}>Add Integration</button>
      </div>
      {loading ? <div>Loading integrations…</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th>Id</th><th>Type</th><th>Workspace</th><th>API Key</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{i.id}</td>
                <td style={{ padding: 8 }}>{i.type}</td>
                <td style={{ padding: 8 }}>{i.workspaceId}</td>
                <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>{i.apiKey}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => handleRotate(i.workspaceId)}>Rotate Key</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
