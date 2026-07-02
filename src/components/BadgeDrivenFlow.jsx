import React, { useEffect, useState } from 'react';
import { apiJson } from '../api-client.js';

const sections = [
  { id: 1, title: 'Verified Identity', description: 'View passport identity evidence and verification status.', target: 'passports' },
  { id: 2, title: 'Software Lineage', description: 'Inspect software registry, dependency lineage, and vendor metadata.', target: 'lineage' },
  { id: 3, title: 'Trust Score', description: 'Review trust score dashboards and asset confidence signals.', target: 'trust' },
  { id: 4, title: 'Evidence Pipeline', description: 'Open evidence intake and project pipeline workflow management.', target: 'projects' },
  { id: 5, title: 'Security Posture', description: 'Run analysis and review secure-by-design evidence.', target: 'analyze' },
  { id: 6, title: 'Workflow Logs', description: 'Inspect pipeline runs, audit history, and workflow events.', target: 'projects' },
  { id: 7, title: 'Compliance Evidence', description: 'Generate compliance export packages and review audit evidence.', target: 'compliance' },
  { id: 8, title: 'Registry Metadata', description: 'Browse the global SPR registry and registered software identities.', target: 'public-registry' },
];

function getStatusColor(status) {
  switch (status) {
    case 'complete': return '#22C55E';
    case 'warning': return '#FBBF24';
    case 'incomplete': return '#EF4444';
    default: return '#C9A86A';
  }
}

export default function BadgeDrivenFlow({ onNavigate }) {
  const [passportId, setPassportId] = useState('');
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!passportId) {
      setRequirements(null);
      setError(null);
      return;
    }
  }, [passportId]);

  const loadRequirements = async () => {
    if (!passportId) {
      setError('Enter a passport ID to evaluate badge requirements.');
      setRequirements(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await apiJson(`/api/spr/badge/${encodeURIComponent(passportId)}/requirements`);
      setRequirements(payload.requirements || null);
    } catch (err) {
      setRequirements(null);
      setError(err.message || 'Unable to load badge requirements.');
    } finally {
      setLoading(false);
    }
  };

  return (
    React.createElement('div', { style: { padding: 20, fontFamily: 'Inter, system-ui, sans-serif' } },
      React.createElement('h2', null, 'Badge Requirements Engine'),
      React.createElement('p', null, 'The badge now evaluates passport requirements and surfaces missing evidence for each section.'),
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640, marginTop: 20 } },
        React.createElement('label', { style: { color: '#F8F9FA', fontSize: 13, fontWeight: 600 } }, 'Passport ID'),
        React.createElement('div', { style: { display: 'flex', gap: 10 } },
          React.createElement('input', {
            value: passportId,
            onChange: (event) => setPassportId(event.target.value),
            placeholder: 'Enter passport ID',
            style: { flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #252525', background: '#070707', color: '#F8F9FA' },
          }),
          React.createElement('button', {
            type: 'button',
            style: { borderRadius: 10, border: 'none', background: '#C9A86A', color: '#000', padding: '10px 14px', cursor: 'pointer', fontWeight: 700 },
            onClick: loadRequirements,
          }, loading ? 'Loading…' : 'Evaluate')
        ),
        error && React.createElement('div', { style: { color: '#F87171', fontSize: 13 } }, error)
      ),

      requirements && React.createElement('div', { style: { marginTop: 24, display: 'grid', gridTemplateColumns: '1fr', gap: 16 } },
        React.createElement('div', {
          style: { background: '#0A0A0A', border: '1px solid #252525', borderRadius: 16, padding: 20 }
        },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' } },
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 6 } }, `Passport ${requirements.passportId}`),
              React.createElement('div', { style: { color: '#B4B0AA', fontSize: 13 } }, `${requirements.completedSections}/${requirements.sectionCount} sections complete · Overall ${requirements.overallStatus}`)
            ),
            React.createElement('div', {
              style: { alignSelf: 'center', padding: '8px 12px', borderRadius: 999, background: getStatusColor(requirements.overallStatus) + '22', color: getStatusColor(requirements.overallStatus), fontWeight: 700, fontSize: 12 }
            }, requirements.overallStatus.toUpperCase())
          )
        ),
        requirements.sections.map((section) => (
          React.createElement('div', {
            key: section.id,
            style: { background: '#0A0A0A', border: '1px solid #252525', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }
          },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 } },
              React.createElement('div', null,
                React.createElement('div', { style: { fontSize: 15, fontWeight: 700, marginBottom: 6 } }, section.title),
                React.createElement('div', { style: { fontSize: 13, color: '#B4B0AA' } }, section.description)
              ),
              React.createElement('span', {
                style: { padding: '6px 10px', borderRadius: 999, background: getStatusColor(section.status) + '22', color: getStatusColor(section.status), fontSize: 12, fontWeight: 700 }
              }, section.status.toUpperCase())
            ),
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } },
              React.createElement('div', { style: { fontSize: 12, color: '#B4B0AA' } }, section.detail),
              React.createElement('div', { style: { fontSize: 12, color: '#F8F9FA', fontWeight: 700 } }, `Score ${section.score}`)
            ),
            section.sources && section.sources.length > 0 && React.createElement('div', { style: { fontSize: 12, color: '#B4B0AA' } },
              React.createElement('div', { style: { fontWeight: 700, marginBottom: 6 } }, 'Evidence sources'),
              React.createElement('div', null, section.sources.join(', '))
            ),
            section.missing.length > 0 && React.createElement('div', { style: { fontSize: 12, color: '#F8F9FA' } },
              React.createElement('div', { style: { fontWeight: 700, marginBottom: 8 } }, 'Missing items'),
              React.createElement('ul', { style: { margin: 0, paddingLeft: 18, color: '#B4B0AA' } },
                section.missing.map((item, index) => React.createElement('li', { key: index, style: { marginBottom: 4 } }, item))
              )
            ),
            React.createElement('button', {
              type: 'button',
              style: { alignSelf: 'flex-start', marginTop: 'auto', border: 'none', borderRadius: 8, background: '#C9A86A', color: '#000', padding: '10px 14px', cursor: 'pointer', fontWeight: 700 },
              onClick: () => onNavigate?.(section.target)
            }, 'Open section')
          )
        ))
      ),

      !requirements && React.createElement('div', { style: { marginTop: 28 } },
        React.createElement('div', { style: { marginBottom: 12, color: '#B4B0AA' } }, 'Quick-start badge sections'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 } },
          sections.map((section) => (
            React.createElement('div', {
              key: section.id,
              style: { background: '#0A0A0A', border: '1px solid #252525', borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },
            },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
                React.createElement('div', null,
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 700, marginBottom: 4 } }, `${section.id}. ${section.title}`),
                  React.createElement('div', { style: { fontSize: 12, color: '#B4B0AA' } }, section.description)
                ),
                React.createElement('span', { style: { fontSize: 12, color: '#C9A86A', fontWeight: 700 } }, 'GO')
              ),
              React.createElement('button', {
                type: 'button',
                style: {
                  marginTop: 'auto',
                  border: 'none',
                  borderRadius: 8,
                  background: '#C9A86A',
                  color: '#000',
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                },
                onClick: () => onNavigate?.(section.target),
              }, 'Open section')
            )
          ))
        )
      )
    )
  );
}
