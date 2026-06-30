import { useEffect, useState } from 'react';

export function PassportDashboard({ workspaceId, vendorId }) {
  const [evidence, setEvidence] = useState([]);
  const [score, setScore] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const e = await fetch(`/api/workspaces/${workspaceId}/vendors/${vendorId}/evidence`).then((r) => r.json());
        const s = await fetch(`/api/workspaces/${workspaceId}/vendors/${vendorId}/trust-score`).then((r) => r.json());
        if (!alive) return;
        setEvidence(Array.isArray(e.items) ? e.items : e);
        setScore(s);
      } catch (err) {
        console.error('Failed to load passport data', err);
      }
    }
    load();
    return () => { alive = false; };
  }, [workspaceId, vendorId]);

  if (!score) return <div>Loading Passport...</div>;

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
