// ═════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD API ROUTES
// Complete backend for admin monitoring, analytics, and management
// ═════════════════════════════════════════════════════════════════════════

// Authentication middleware - verify admin access
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // In production, verify JWT token and check admin role
  req.adminId = token;
  next();
};

// ─────────────────────────────────────────────────────────────────────
// DASHBOARD STATS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getDashboardStats = async (req, res) => {
  try {
    const db = req.db; // Assumes database connection passed from middleware

    // Get stats from database views
    const stats = await db.query(`
      SELECT * FROM admin_dashboard_stats
    `);

    const data = stats.rows[0] || {
      active_users: 0,
      today_transactions: 0,
      today_revenue: 0,
      pending_referrals: 0,
      pending_reviews: 0,
      unhealthy_components: 0,
      total_registered_users: 0,
      total_balance_owed: 0
    };

    return res.status(200).json({
      activeUsers: parseInt(data.active_users),
      todayTransactions: parseInt(data.today_transactions),
      todayRevenue: parseFloat(data.today_revenue),
      pendingReferrals: parseInt(data.pending_referrals),
      pendingReviews: parseInt(data.pending_reviews),
      unhealthyComponents: parseInt(data.unhealthy_components),
      totalUsers: parseInt(data.total_registered_users),
      totalBalanceOwed: parseFloat(data.total_balance_owed)
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// SYSTEM HEALTH ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getSystemHealth = async (req, res) => {
  try {
    const db = req.db;

    const result = await db.query(`
      SELECT 
        id,
        component_name,
        status,
        uptime_percentage,
        response_time_ms,
        error_count,
        last_error,
        last_check
      FROM system_health
      ORDER BY component_name
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching system health:', error);
    return res.status(500).json({ error: 'Failed to fetch system health' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// UPDATE SYSTEM HEALTH
// ─────────────────────────────────────────────────────────────────────

export const updateSystemHealth = async (req, res) => {
  try {
    const { componentName, status, uptimePercentage, responseTimeMs, errorCount, lastError } = req.body;
    const db = req.db;

    await db.query(`
      INSERT INTO system_health (
        component_name, 
        status, 
        uptime_percentage, 
        response_time_ms, 
        error_count, 
        last_error, 
        last_check
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (component_name) DO UPDATE SET
        status = $2,
        uptime_percentage = $3,
        response_time_ms = $4,
        error_count = $5,
        last_error = $6,
        last_check = CURRENT_TIMESTAMP
    `, [componentName, status, uptimePercentage, responseTimeMs, errorCount, lastError]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating system health:', error);
    return res.status(500).json({ error: 'Failed to update system health' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// TRANSACTIONS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getTransactions = async (req, res) => {
  try {
    const db = req.db;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const result = await db.query(`
      SELECT 
        id,
        user_id,
        transaction_type,
        amount,
        currency,
        status,
        payment_method,
        stripe_id,
        description,
        created_at,
        updated_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// USERS ANALYTICS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getUserAnalytics = async (req, res) => {
  try {
    const db = req.db;
    const limit = parseInt(req.query.limit) || 100;

    const result = await db.query(`
      SELECT 
        user_id,
        total_sessions,
        last_session_start,
        session_duration_seconds,
        page_views,
        actions_taken,
        device_info,
        updated_at
      FROM user_analytics
      ORDER BY last_session_start DESC
      LIMIT $1
    `, [limit]);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return res.status(500).json({ error: 'Failed to fetch user analytics' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// LOG USER EVENT
// ─────────────────────────────────────────────────────────────────────

export const logUserEvent = async (req, res) => {
  try {
    const { userId, eventType, eventData, ipAddress } = req.body;
    const db = req.db;

    await db.query(`
      INSERT INTO user_events (user_id, event_type, event_data, ip_address)
      VALUES ($1, $2, $3, $4)
    `, [userId, eventType, JSON.stringify(eventData), ipAddress]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging user event:', error);
    return res.status(500).json({ error: 'Failed to log event' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// REVIEWS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getReviews = async (req, res) => {
  try {
    const db = req.db;
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 50;

    let query = `
      SELECT 
        id,
        user_id,
        rating,
        title,
        content,
        category,
        status,
        response,
        helpful_count,
        is_featured,
        created_at,
        updated_at
      FROM reviews
    `;

    const params = [];

    if (status) {
      query += ` WHERE status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res.status(500).json({ error: 'Failed to fetch reviews' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// RESPOND TO REVIEW
// ─────────────────────────────────────────────────────────────────────

export const respondToReview = async (req, res) => {
  try {
    const { reviewId, responseText } = req.body;
    const db = req.db;
    const adminId = req.adminId;

    await db.query(`
      UPDATE reviews
      SET 
        response = $1,
        response_by_admin_id = $2,
        response_at = CURRENT_TIMESTAMP,
        status = 'reviewed'
      WHERE id = $3
    `, [responseText, adminId, reviewId]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error responding to review:', error);
    return res.status(500).json({ error: 'Failed to respond to review' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// REFERRALS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getReferrals = async (req, res) => {
  try {
    const db = req.db;
    const status = req.query.status;
    const limit = parseInt(req.query.limit) || 50;

    let query = `
      SELECT 
        id,
        referrer_id,
        referee_id,
        referral_code,
        status,
        invited_at,
        activated_at,
        reward_earned,
        metadata
      FROM referrals
    `;

    const params = [];

    if (status) {
      query += ` WHERE status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY invited_at DESC LIMIT ${limit}`;

    const result = await db.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching referrals:', error);
    return res.status(500).json({ error: 'Failed to fetch referrals' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// APPROVE/REJECT REFERRAL
// ─────────────────────────────────────────────────────────────────────

export const updateReferralStatus = async (req, res) => {
  try {
    const { referralId, status, rewardAmount } = req.body;
    const db = req.db;
    const adminId = req.adminId;

    // Update referral status
    await db.query(`
      UPDATE referrals
      SET status = $1, reward_earned = $2
      WHERE id = $3
    `, [status, rewardAmount, referralId]);

    // Log admin action
    await db.query(`
      INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
      VALUES ($1, $2, $3, $4, $5)
    `, [adminId, 'update_referral_status', 'referral', referralId, JSON.stringify({ status, reward: rewardAmount })]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating referral status:', error);
    return res.status(500).json({ error: 'Failed to update referral status' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// ERROR LOGS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getErrorLogs = async (req, res) => {
  try {
    const db = req.db;
    const severity = req.query.severity;
    const resolved = req.query.resolved;
    const limit = parseInt(req.query.limit) || 100;

    let query = `
      SELECT 
        id,
        component,
        error_type,
        error_message,
        stack_trace,
        user_id,
        severity,
        resolved,
        resolved_at,
        created_at
      FROM error_logs
      WHERE 1=1
    `;

    const params = [];

    if (severity) {
      query += ` AND severity = $${params.length + 1}`;
      params.push(severity);
    }

    if (resolved !== undefined) {
      query += ` AND resolved = $${params.length + 1}`;
      params.push(resolved === 'true');
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching error logs:', error);
    return res.status(500).json({ error: 'Failed to fetch error logs' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// LOG ERROR
// ─────────────────────────────────────────────────────────────────────

export const logError = async (req, res) => {
  try {
    const { component, errorType, errorMessage, stackTrace, userId, severity } = req.body;
    const db = req.db;

    await db.query(`
      INSERT INTO error_logs (
        component, error_type, error_message, stack_trace, user_id, severity
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [component, errorType, errorMessage, stackTrace, userId, severity || 'warning']);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging error:', error);
    return res.status(500).json({ error: 'Failed to log error' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PERFORMANCE METRICS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getPerformanceMetrics = async (req, res) => {
  try {
    const db = req.db;
    const metric = req.query.metric;
    const hours = parseInt(req.query.hours) || 24;

    let query = `
      SELECT 
        metric_name,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count
      FROM performance_metrics
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
    `;

    if (metric) {
      query += ` AND metric_name = '${metric}'`;
    }

    query += ` GROUP BY metric_name`;

    const result = await db.query(query);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching performance metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch performance metrics' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// LOG PERFORMANCE METRIC
// ─────────────────────────────────────────────────────────────────────

export const logPerformanceMetric = async (req, res) => {
  try {
    const { metricName, value, unit, component } = req.body;
    const db = req.db;

    await db.query(`
      INSERT INTO performance_metrics (metric_name, value, unit, component)
      VALUES ($1, $2, $3, $4)
    `, [metricName, value, unit, component]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error logging performance metric:', error);
    return res.status(500).json({ error: 'Failed to log performance metric' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// ADMIN AUDIT LOG ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getAdminAuditLog = async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.query.adminId;
    const limit = parseInt(req.query.limit) || 100;

    let query = `
      SELECT 
        id,
        admin_id,
        action,
        target_type,
        target_id,
        details,
        created_at
      FROM admin_audit_log
    `;

    const params = [];

    if (adminId) {
      query += ` WHERE admin_id = $${params.length + 1}`;
      params.push(adminId);
    }

    query += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const result = await db.query(query, params);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching admin audit log:', error);
    return res.status(500).json({ error: 'Failed to fetch admin audit log' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// REVENUE SUMMARY ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getRevenueSummary = async (req, res) => {
  try {
    const db = req.db;
    const days = parseInt(req.query.days) || 30;

    const result = await db.query(`
      SELECT * FROM revenue_summary
      WHERE date > CURRENT_DATE - INTERVAL '${days} days'
      ORDER BY date DESC
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching revenue summary:', error);
    return res.status(500).json({ error: 'Failed to fetch revenue summary' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// TOP REFERRERS ENDPOINT
// ─────────────────────────────────────────────────────────────────────

export const getTopReferrers = async (req, res) => {
  try {
    const db = req.db;
    const limit = parseInt(req.query.limit) || 20;

    const result = await db.query(`
      SELECT * FROM top_referrers LIMIT ${limit}
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching top referrers:', error);
    return res.status(500).json({ error: 'Failed to fetch top referrers' });
  }
};

// ─────────────────────────────────────────────────────────────────────
// EXPORT FOR USE IN EXPRESS ROUTES
// ─────────────────────────────────────────────────────────────────────

export default {
  verifyAdminToken,
  getDashboardStats,
  getSystemHealth,
  updateSystemHealth,
  getTransactions,
  getUserAnalytics,
  logUserEvent,
  getReviews,
  respondToReview,
  getReferrals,
  updateReferralStatus,
  getErrorLogs,
  logError,
  getPerformanceMetrics,
  logPerformanceMetric,
  getAdminAuditLog,
  getRevenueSummary,
  getTopReferrers
};
