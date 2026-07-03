import React, { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';

const AdminDashboard = ({ adminId, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardData, setDashboardData] = useState({
    activeUsers: 0,
    todayTransactions: 0,
    todayRevenue: 0,
    pendingReferrals: 0,
    pendingReviews: 0,
    unhealthyComponents: 0,
    totalUsers: 0,
    totalBalanceOwed: 0
  });

  const [systemHealth, setSystemHealth] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [performanceMetrics, setPerformanceMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({});
  const chartCanvasRef = useRef(null);

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, healthRes, transRes, reviewRes] = await Promise.all([
        fetch('/api/admin/dashboard-stats', {
          headers: { Authorization: `Bearer ${adminId}` }
        }),
        fetch('/api/admin/system-health', {
          headers: { Authorization: `Bearer ${adminId}` }
        }),
        fetch('/api/admin/transactions', {
          headers: { Authorization: `Bearer ${adminId}` }
        }),
        fetch('/api/admin/reviews', {
          headers: { Authorization: `Bearer ${adminId}` }
        })
      ]);

      if (statsRes.ok) {
        const stats = await statsRes.json();
        setDashboardData(stats);
      }

      if (healthRes.ok) {
        const health = await healthRes.json();
        setSystemHealth(health);
      }

      if (transRes.ok) {
        const transactions = await transRes.json();
        setRecentTransactions(transactions);
      }

      if (reviewRes.ok) {
        const reviewsData = await reviewRes.json();
        setReviews(reviewsData);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    const colors = {
      'healthy': '#10b981',
      'warning': '#f59e0b',
      'critical': '#ef4444',
      'offline': '#6b7280',
      'completed': '#10b981',
      'pending': '#f59e0b',
      'failed': '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ─────────────────────────────────────────────────────────────────────
  // OVERVIEW TAB
  // ─────────────────────────────────────────────────────────────────────

  const OverviewTab = () => (
    <div className="admin-overview">
      <div className="admin-stats-grid">
        <div className="admin-stat-card active-users">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{dashboardData.activeUsers.toLocaleString()}</div>
            <div className="stat-label">Active Users</div>
            <div className="stat-sparkline">▲ 12% this week</div>
          </div>
        </div>

        <div className="admin-stat-card revenue">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(dashboardData.todayRevenue)}</div>
            <div className="stat-label">Today's Revenue</div>
            <div className="stat-sparkline">↑ {dashboardData.todayTransactions} transactions</div>
          </div>
        </div>

        <div className="admin-stat-card referrals">
          <div className="stat-icon">🔗</div>
          <div className="stat-content">
            <div className="stat-value">{dashboardData.pendingReferrals}</div>
            <div className="stat-label">Pending Referrals</div>
            <div className="stat-sparkline">Awaiting verification</div>
          </div>
        </div>

        <div className="admin-stat-card reviews">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <div className="stat-value">{dashboardData.pendingReviews}</div>
            <div className="stat-label">Pending Reviews</div>
            <div className="stat-sparkline">Action needed</div>
          </div>
        </div>

        <div className="admin-stat-card health">
          <div className="stat-icon">🔴</div>
          <div className="stat-content">
            <div className="stat-value" style={{ color: dashboardData.unhealthyComponents > 0 ? '#ef4444' : '#10b981' }}>
              {dashboardData.unhealthyComponents}
            </div>
            <div className="stat-label">Unhealthy Components</div>
            <div className="stat-sparkline">{systemHealth.length} total monitored</div>
          </div>
        </div>

        <div className="admin-stat-card users">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{dashboardData.totalUsers.toLocaleString()}</div>
            <div className="stat-label">Total Registered</div>
            <div className="stat-sparkline">{formatCurrency(dashboardData.totalBalanceOwed)} balance</div>
          </div>
        </div>
      </div>

      {/* System Health Quick View */}
      <div className="admin-section">
        <h3>System Health Status</h3>
        <div className="health-grid">
          {systemHealth.map((component) => (
            <div key={component.id} className="health-item">
              <div className="health-header">
                <span className="health-name">{component.component_name}</span>
                <span className="health-badge" style={{ backgroundColor: getStatusColor(component.status) }}>
                  {component.status}
                </span>
              </div>
              <div className="health-metrics">
                <div className="metric">
                  <span>Uptime:</span>
                  <span className="metric-value">{component.uptime_percentage}%</span>
                </div>
                <div className="metric">
                  <span>Response:</span>
                  <span className="metric-value">{component.response_time_ms}ms</span>
                </div>
                <div className="metric">
                  <span>Errors:</span>
                  <span className="metric-value" style={{ color: component.error_count > 0 ? '#ef4444' : '#10b981' }}>
                    {component.error_count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="admin-section">
        <h3>Recent Transactions</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.slice(0, 10).map((tx) => (
              <tr key={tx.id}>
                <td>#{tx.id}</td>
                <td>{tx.user_id.substring(0, 8)}...</td>
                <td><span className="badge">{tx.transaction_type}</span></td>
                <td>{formatCurrency(tx.amount)}</td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: getStatusColor(tx.status) }}>
                    {tx.status}
                  </span>
                </td>
                <td>{formatDate(tx.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // USERS TAB
  // ─────────────────────────────────────────────────────────────────────

  const UsersTab = () => (
    <div className="admin-users">
      <div className="admin-section-header">
        <h3>User Management</h3>
        <input
          type="text"
          placeholder="Search users..."
          className="admin-search"
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
      </div>

      <table className="admin-table users-table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Sessions</th>
            <th>Last Active</th>
            <th>Page Views</th>
            <th>Subscription</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} onClick={() => setSelectedUser(user)}>
              <td>{user.id.substring(0, 12)}...</td>
              <td>{user.total_sessions}</td>
              <td>{user.last_session_start ? formatDate(user.last_session_start) : 'Never'}</td>
              <td>{user.page_views}</td>
              <td><span className="badge plan">{user.plan_name || 'Free'}</span></td>
              <td>
                <span className="status-badge" style={{ backgroundColor: '#10b981' }}>
                  Active
                </span>
              </td>
              <td>
                <button className="btn-small">View</button>
                <button className="btn-small danger">Ban</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedUser && (
        <div className="user-detail-modal">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setSelectedUser(null)}>✕</button>
            <h3>User Details</h3>
            <div className="user-detail-info">
              <div><strong>ID:</strong> {selectedUser.id}</div>
              <div><strong>Sessions:</strong> {selectedUser.total_sessions}</div>
              <div><strong>Page Views:</strong> {selectedUser.page_views}</div>
              <div><strong>Subscription:</strong> {selectedUser.plan_name || 'Free'}</div>
              <div><strong>Last Active:</strong> {selectedUser.last_session_start ? formatDate(selectedUser.last_session_start) : 'Never'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // FINANCIAL TAB
  // ─────────────────────────────────────────────────────────────────────

  const FinancialTab = () => (
    <div className="admin-financial">
      <div className="financial-summary">
        <div className="financial-card">
          <div className="card-title">Total Revenue (Today)</div>
          <div className="card-value">{formatCurrency(dashboardData.todayRevenue)}</div>
        </div>
        <div className="financial-card">
          <div className="card-title">Transaction Count</div>
          <div className="card-value">{dashboardData.todayTransactions}</div>
        </div>
        <div className="financial-card">
          <div className="card-title">Total Balance Owed</div>
          <div className="card-value">{formatCurrency(dashboardData.totalBalanceOwed)}</div>
        </div>
        <div className="financial-card">
          <div className="card-title">Failed Transactions</div>
          <div className="card-value" style={{ color: '#ef4444' }}>0</div>
        </div>
      </div>

      <div className="admin-section">
        <h3>Recent Transactions</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Transaction ID</th>
              <th>User</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.map((tx) => (
              <tr key={tx.id}>
                <td>#{tx.id}</td>
                <td>{tx.user_id.substring(0, 8)}...</td>
                <td><span className="badge">{tx.transaction_type}</span></td>
                <td>{formatCurrency(tx.amount)}</td>
                <td>{tx.payment_method || 'N/A'}</td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: getStatusColor(tx.status) }}>
                    {tx.status}
                  </span>
                </td>
                <td>{formatDate(tx.created_at)}</td>
                <td>
                  <button className="btn-small">Refund</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // REFERRAL TAB
  // ─────────────────────────────────────────────────────────────────────

  const ReferralTab = () => (
    <div className="admin-referrals">
      <div className="referral-stats">
        <div className="ref-stat-card">
          <div>Total Referrals</div>
          <div className="big-number">1,234</div>
        </div>
        <div className="ref-stat-card">
          <div>Active Referrals</div>
          <div className="big-number">847</div>
        </div>
        <div className="ref-stat-card">
          <div>Completed Referrals</div>
          <div className="big-number">387</div>
        </div>
        <div className="ref-stat-card">
          <div>Total Rewards Paid</div>
          <div className="big-number">$12,450</div>
        </div>
      </div>

      <div className="admin-section">
        <h3>Pending Referral Verifications</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Referee</th>
              <th>Referral Code</th>
              <th>Status</th>
              <th>Invited At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {referrals.slice(0, 10).map((ref) => (
              <tr key={ref.id}>
                <td>{ref.referrer_id.substring(0, 8)}...</td>
                <td>{ref.referee_id.substring(0, 8)}...</td>
                <td><code>{ref.referral_code}</code></td>
                <td>
                  <span className="status-badge" style={{ backgroundColor: getStatusColor(ref.status) }}>
                    {ref.status}
                  </span>
                </td>
                <td>{formatDate(ref.invited_at)}</td>
                <td>
                  <button className="btn-small success">Approve</button>
                  <button className="btn-small danger">Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-section">
        <h3>Top Referrers (This Month)</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Referrer</th>
              <th>Total Referrals</th>
              <th>Completed</th>
              <th>Total Earned</th>
              <th>Avg Reward</th>
            </tr>
          </thead>
          <tbody>
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td>User {i + 1}</td>
                <td>{Math.floor(Math.random() * 50) + 10}</td>
                <td>{Math.floor(Math.random() * 30) + 5}</td>
                <td>${Math.floor(Math.random() * 5000) + 500}</td>
                <td>${Math.floor(Math.random() * 50) + 10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // REVIEWS TAB
  // ─────────────────────────────────────────────────────────────────────

  const ReviewsTab = () => (
    <div className="admin-reviews">
      <div className="review-filter-bar">
        <button className="filter-btn active">All</button>
        <button className="filter-btn">Pending</button>
        <button className="filter-btn">Reviewed</button>
        <button className="filter-btn">Featured</button>
      </div>

      <div className="reviews-list">
        {reviews.map((review) => (
          <div key={review.id} className="review-card">
            <div className="review-header">
              <div className="review-rating">
                {'⭐'.repeat(review.rating)}
                {review.rating < 5 && '☆'.repeat(5 - review.rating)}
              </div>
              <span className="review-status" style={{ backgroundColor: getStatusColor(review.status) }}>
                {review.status}
              </span>
            </div>
            <div className="review-title">{review.title}</div>
            <div className="review-content">{review.content}</div>
            <div className="review-category">Category: <span>{review.category}</span></div>
            <div className="review-footer">
              <span>{formatDate(review.created_at)}</span>
              <span>👍 {review.helpful_count}</span>
            </div>
            <div className="review-actions">
              <button className="btn-small">Respond</button>
              <button className="btn-small" style={{ backgroundColor: '#f59e0b' }}>Feature</button>
              <button className="btn-small danger">Archive</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // MONITORING TAB
  // ─────────────────────────────────────────────────────────────────────

  const MonitoringTab = () => (
    <div className="admin-monitoring">
      <div className="admin-section">
        <h3>System Health Status</h3>
        <div className="health-detailed-grid">
          {systemHealth.map((component) => (
            <div key={component.id} className="health-detailed-card">
              <div className="health-card-header">
                <h4>{component.component_name}</h4>
                <div className="health-indicator" style={{ backgroundColor: getStatusColor(component.status) }}></div>
              </div>
              <div className="health-details">
                <div className="detail-row">
                  <span>Status:</span>
                  <strong>{component.status}</strong>
                </div>
                <div className="detail-row">
                  <span>Uptime:</span>
                  <strong>{component.uptime_percentage}%</strong>
                </div>
                <div className="detail-row">
                  <span>Response Time:</span>
                  <strong>{component.response_time_ms}ms</strong>
                </div>
                <div className="detail-row">
                  <span>Errors:</span>
                  <strong style={{ color: component.error_count > 0 ? '#ef4444' : '#10b981' }}>
                    {component.error_count}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Last Check:</span>
                  <small>{formatDate(component.last_check)}</small>
                </div>
              </div>
              {component.last_error && (
                <div className="health-error">
                  <strong>Last Error:</strong>
                  <p>{component.last_error}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="admin-section">
        <h3>Error Logs</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Error Type</th>
              <th>Message</th>
              <th>Severity</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {errorLogs.slice(0, 15).map((error) => (
              <tr key={error.id}>
                <td>{error.component}</td>
                <td><code>{error.error_type}</code></td>
                <td className="error-message">{error.error_message}</td>
                <td>
                  <span className="severity-badge" style={{ backgroundColor: getStatusColor(error.severity) }}>
                    {error.severity}
                  </span>
                </td>
                <td>{formatDate(error.created_at)}</td>
                <td>
                  <span style={{ color: error.resolved ? '#10b981' : '#f59e0b' }}>
                    {error.resolved ? '✓ Resolved' : '⏳ Open'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-section">
        <h3>Performance Metrics</h3>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-name">API Response Time</div>
            <div className="metric-value">145ms</div>
            <div className="metric-trend">↓ 12% from yesterday</div>
          </div>
          <div className="metric-card">
            <div className="metric-name">Database Query Time</div>
            <div className="metric-value">52ms</div>
            <div className="metric-trend">↑ 5% from yesterday</div>
          </div>
          <div className="metric-card">
            <div className="metric-name">Page Load Time</div>
            <div className="metric-value">892ms</div>
            <div className="metric-trend">↓ 8% from yesterday</div>
          </div>
          <div className="metric-card">
            <div className="metric-name">Uptime</div>
            <div className="metric-value">99.95%</div>
            <div className="metric-trend">✓ Excellent</div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div className="admin-dashboard-container">
      <div className="admin-header">
        <div className="admin-title">
          <h1>🔐 Admin Dashboard</h1>
          <p>Complete system monitoring and management</p>
        </div>
        <button className="btn-close" onClick={onClose}>✕</button>
      </div>

      <div className="admin-nav">
        <button
          className={`nav-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button
          className={`nav-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button
          className={`nav-btn ${activeTab === 'financial' ? 'active' : ''}`}
          onClick={() => setActiveTab('financial')}
        >
          💰 Financial
        </button>
        <button
          className={`nav-btn ${activeTab === 'referrals' ? 'active' : ''}`}
          onClick={() => setActiveTab('referrals')}
        >
          🔗 Referrals
        </button>
        <button
          className={`nav-btn ${activeTab === 'reviews' ? 'active' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          ⭐ Reviews
        </button>
        <button
          className={`nav-btn ${activeTab === 'monitoring' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitoring')}
        >
          🔴 Monitoring
        </button>
      </div>

      <div className="admin-content">
        {loading && <div className="loading-spinner">Loading...</div>}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'financial' && <FinancialTab />}
        {activeTab === 'referrals' && <ReferralTab />}
        {activeTab === 'reviews' && <ReviewsTab />}
        {activeTab === 'monitoring' && <MonitoringTab />}
      </div>
    </div>
  );
};

export default AdminDashboard;
