// api/spr/audit.js
// SPR Self-Audit API Endpoints

import SelfAuditEngine from '../../lib/spr/self-audit.js';

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
        res.status(200).json({
          success: true,
          message: 'Self-audit completed successfully',
          audit,
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
      // This is a simple implementation - in production, query your database
      const mockAudit = {
        id: 'audit-' + Date.now(),
        date: new Date().toISOString(),
        status: 'passed',
        trustScore: 85,
        details: {
          code: { score: 85, issues: 0 },
          performance: { uptime: 99.8, responseTime: 145 },
          security: { score: 90, vulnerabilities: 0 },
          compliance: { score: 82, standards: 'ISO27001,SOC2,GDPR' },
        },
      };

      res.status(200).json({
        success: true,
        audit: mockAudit,
      });
      return;
    }

    // GET /api/spr/audit/history - Get audit history
    if (req.method === 'GET' && req.url === '/api/spr/audit/history') {
      const mockHistory = [
        {
          id: 'audit-' + (Date.now() - 86400000),
          date: new Date(Date.now() - 86400000).toISOString(),
          status: 'passed',
          trustScore: 83,
        },
        {
          id: 'audit-' + (Date.now() - 172800000),
          date: new Date(Date.now() - 172800000).toISOString(),
          status: 'passed',
          trustScore: 82,
        },
        {
          id: 'audit-' + (Date.now() - 259200000),
          date: new Date(Date.now() - 259200000).toISOString(),
          status: 'warning',
          trustScore: 78,
        },
      ];

      res.status(200).json({
        success: true,
        audits: mockHistory,
      });
      return;
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
