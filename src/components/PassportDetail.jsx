import { useState, useEffect } from 'react';
import { apiJson } from '../api-client.js';

export default function PassportDetail({ id }) {
  const [passport, setPassport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const pid = id || (window.location.pathname.match(/\/passport\/([^/]+)/) || [])[1];
    if (!pid) return;
    let cancelled = false;
    apiJson(`/api/passports/${encodeURIComponent(pid)}`).then((res) => {
      if (cancelled) return;
      if (res && res.passport) setPassport(res.passport);
      else setError('Passport not found');
    }).catch((e) => {
      if (cancelled) return;
      setError(e?.message || String(e));
    });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <div style={{ padding: 12, color: 'var(--danger, #b00)' }}>Error: {error}</div>;
  if (!passport) return <div style={{ padding: 12 }}>Loading passport…</div>;

  return (
    <div style={{ padding: 12 }}>
      <h2>{passport.assetName || passport.assetId || 'Passport'}</h2>
      <p><strong>Trust Score:</strong> {passport.trustScore ?? passport.badgeStatus?.score ?? '—'}</p>
      <p><strong>Verdict:</strong> {passport.verdict || passport.badgeStatus?.verdict || '—'}</p>
      <h3>Evidence Summary</h3>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 8 }}>{JSON.stringify(passport.evidenceSummary || passport, null, 2)}</pre>
    </div>
  );
}
