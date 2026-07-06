// api/spr/audit.js
// SPR Self-Audit API Endpoints

import SelfAuditEngine from '../../lib/spr/self-audit.js';

let latestAudit = null;
const auditHistory = [];

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // POST /api/spr/audit/trigger - Trigger a new audit
    if (req.method === 'POST' && req.url === '/api/spr/audit/trigger') {
      console.log('[API] Triggering self-audit...');
      try {
        const audit = await SelfAuditEngine.runCompleteAudit();
        latestAudit = {
          ...audit,
          auditDate: audit.auditDate instanceof Date ? audit.auditDate.toISOString() : String(audit.auditDate || new Date().toISOString()),
        };
        auditHistory.unshift(latestAudit);
        if (auditHistory.length > 20) auditHistory.length = 20;
        res.status(200).json({
          success: true,
          message: 'Self-audit completed successfully',
          audit: latestAudit,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Audit failed',
          message: error.message,
        });
      }
      return;
    }

    // GET /api/spr/audit/status - Get latest audit status
    if (req.method === 'GET' && req.url === '/api/spr/audit/status') {
      const audit = latestAudit || {
        auditId: null,
        auditDate: new Date().toISOString(),
        status: 'pending',
        trustImpact: 0,
        results: {},
      };
      return res.status(200).json({ success: true, audit });
    }

    // GET /api/spr/audit/history - Get audit history
    if (req.method === 'GET' && req.url === '/api/spr/audit/history') {
      return res.status(200).json({ success: true, audits: auditHistory });
    }

    // Default 404
    res.status(404).json({
      success: false,
      error: 'Endpoint not found',
      path: req.url,
    });
  } catch (error) {
    console.error('[API ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message,
    });
  }
}
