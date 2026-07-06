import React, { useEffect, useState } from 'react';
import { apiJson } from '../api-client.js';

export default function EvidenceViewer() {
  const [passports, setPassports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiJson('/api/passports');
      setPassports(res.passports || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading…</div>;

  return (
    <div>
      <h2>Evidence Viewer</h2>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: '0 0 380px' }}>
          <h4>Passports</h4>
          <ul>
            {passports.map(p => (
              <li key={p.passportId} style={{ marginBottom: 8 }}>
                <button onClick={() => setSelected(p)} style={{ width: '100%', textAlign: 'left' }}>{p.assetName} — {p.trustScore}</button>
              </li>
            ))}
          </ul>
        </div>
        <div style={{ flex: 1 }}>
          {selected ? (
            <div>
              <h3>{selected.assetName}</h3>
              <div><strong>Trust</strong>: {selected.trustScore}</div>
              <div style={{ marginTop: 12 }}><strong>Evidence Summary</strong></div>
              <pre style={{ background: '#fff', color: '#000', padding: 12 }}>{selected.evidenceSummary || 'No summary available.'}</pre>
            </div>
          ) : (
            <div>Select a passport to view evidence.</div>
          )}
        </div>
      </div>
    </div>
  );
}
