import { useEffect, useState } from 'react';
import { apiJson } from '../api-client.js';

export function PassportDashboard({ workspaceId, vendorId }) {
  const [evidence, setEvidence] = useState([]);
  const [score, setScore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const e = await apiJson(`/api/workspaces/${workspaceId}/vendors/${vendorId}/evidence`, {
          workspaceId,
        });
        const s = await apiJson(`/api/workspaces/${workspaceId}/vendors/${vendorId}/trust-score`, {
          workspaceId,
        });
        if (!alive) return;
        setEvidence(Array.isArray(e.items) ? e.items : e.items || []);
        setScore(s);
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load passport data', err);
        setError(err instanceof Error ? err.message : 'Failed to load passport data');
      } finally {
        if (!alive) return;
        setIsLoading(false);
      }
    }
    if (workspaceId && vendorId) {
      load();
    } else {
      setIsLoading(false);
      setEvidence([]);
      setScore(null);
    }
    return () => { alive = false; };
  }, [workspaceId, vendorId]);

  if (isLoading) return <div>Loading Passport...</div>;
  if (error) return <div style={{ color: 'var(--red, #c5302b)' }}>Passport load error: {error}</div>;
  if (!score) return <div>No passport data available.</div>;

  return (
    <div>
      <h2>Trust Passport</h2>
      <h3>Score: {score.score} ({score.band})</h3>
      <p>Confidence: {(score.confidence * 100).toFixed(0)}%</p>

      <h3>Evidence</h3>
      <ul>
        {evidence.map((e) => (
          <li key={e.id}>
            {e.type}: {e.title} — {e.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PassportDashboard;
