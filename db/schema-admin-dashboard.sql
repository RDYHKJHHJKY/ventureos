-- ═════════════════════════════════════════════════════════════════════════
-- ADMIN DASHBOARD SCHEMA
-- Complete financial, user, referral, review, and monitoring infrastructure
-- ═════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ADMIN USER MANAGEMENT
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    admin_level VARCHAR(50) DEFAULT 'super_admin', -- super_admin, admin, moderator
    access_modules TEXT[] DEFAULT '{}', -- array of allowed modules
    login_attempts INT DEFAULT 0,
    last_login TIMESTAMP WITH TIME ZONE,
    locked_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. USER ANALYTICS & MONITORING
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_analytics (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    total_sessions INT DEFAULT 0,
    last_session_start TIMESTAMP WITH TIME ZONE,
    session_duration_seconds INT DEFAULT 0,
    page_views INT DEFAULT 0,
    actions_taken INT DEFAULT 0,
    features_used JSONB DEFAULT '{}', -- { "feature_name": count, ... }
    device_info JSONB DEFAULT '{}', -- { browser, os, device_type }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    session_token VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(50),
    login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    logout_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(session_token)
);

CREATE TABLE IF NOT EXISTS user_events (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- login, logout, purchase, referral_signup, etc
    event_data JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. FINANCIAL TRACKING
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    transaction_type VARCHAR(50) NOT NULL, -- payment, refund, bonus, referral_reward
    amount DECIMAL(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'completed', -- pending, completed, failed, refunded
    payment_method VARCHAR(100), -- credit_card, stripe, paypal, crypto
    stripe_id VARCHAR(255),
    description TEXT,
    invoice_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    balance DECIMAL(12, 2) DEFAULT 0.00,
    total_earned DECIMAL(12, 2) DEFAULT 0.00,
    total_spent DECIMAL(12, 2) DEFAULT 0.00,
    referral_earnings DECIMAL(12, 2) DEFAULT 0.00,
    bonus_balance DECIMAL(12, 2) DEFAULT 0.00,
    last_transaction_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    plan_name VARCHAR(100) NOT NULL, -- free, basic, pro, enterprise
    plan_tier INT DEFAULT 0, -- 0=free, 1=basic, 2=pro, 3=enterprise
    monthly_cost DECIMAL(12, 2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    auto_renew BOOLEAN DEFAULT TRUE,
    features JSONB DEFAULT '{}', -- { "feature_name": true/false }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. REFERRAL SYSTEM
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    referrer_id UUID NOT NULL, -- who invited
    referee_id UUID NOT NULL, -- who was invited
    referral_code VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'pending', -- pending, active, completed, cancelled
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP WITH TIME ZONE,
    reward_earned DECIMAL(12, 2) DEFAULT 0.00,
    reward_percentage INT DEFAULT 10, -- 10% commission on first purchase
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS referral_codes (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    display_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    uses INT DEFAULT 0,
    reward_per_use DECIMAL(12, 2) DEFAULT 5.00,
    total_earned DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id) -- one active code per user
);

CREATE TABLE IF NOT EXISTS referral_stats (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    total_referrals INT DEFAULT 0,
    active_referrals INT DEFAULT 0,
    completed_referrals INT DEFAULT 0,
    total_earned DECIMAL(12, 2) DEFAULT 0.00,
    average_reward DECIMAL(12, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. REVIEWS & FEEDBACK
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    rating INT DEFAULT 5, -- 1-5 stars
    title VARCHAR(200),
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'general', -- general, feature_request, bug, ui/ux, performance
    status VARCHAR(50) DEFAULT 'pending', -- pending, reviewed, addressed, archived
    response TEXT,
    response_by_admin_id UUID,
    response_at TIMESTAMP WITH TIME ZONE,
    helpful_count INT DEFAULT 0,
    is_featured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS review_responses (
    id SERIAL PRIMARY KEY,
    review_id INT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL,
    response_text TEXT NOT NULL,
    is_official BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_id) REFERENCES reviews(id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. SYSTEM MONITORING & HEALTH
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_health (
    id SERIAL PRIMARY KEY,
    component_name VARCHAR(100) NOT NULL, -- api, database, auth, ai_assistant, payments
    status VARCHAR(50) DEFAULT 'healthy', -- healthy, warning, critical, offline
    uptime_percentage DECIMAL(5, 2) DEFAULT 100.00,
    response_time_ms INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_error TEXT,
    last_check TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    component VARCHAR(100),
    error_type VARCHAR(100),
    error_message TEXT,
    stack_trace TEXT,
    user_id UUID,
    severity VARCHAR(50) DEFAULT 'warning', -- info, warning, error, critical
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL, -- api_response_time, db_query_time, page_load_time
    value DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(50) DEFAULT 'ms',
    component VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_calls_log (
    id SERIAL PRIMARY KEY,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INT,
    response_time_ms INT,
    user_id UUID,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. ADMIN ACTIVITY AUDIT LOG
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL, -- view_user, edit_user, approve_review, ban_user, etc
    target_type VARCHAR(100), -- user, transaction, review, settings
    target_id VARCHAR(255),
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. DASHBOARD WIDGETS & SETTINGS
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_dashboard_settings (
    id SERIAL PRIMARY KEY,
    admin_id UUID NOT NULL,
    widget_layout JSONB DEFAULT '{}', -- {widgetName: {position, size, enabled}}
    theme VARCHAR(50) DEFAULT 'dark',
    auto_refresh_interval INT DEFAULT 30, -- seconds
    alert_settings JSONB DEFAULT '{}', -- which alerts are enabled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(admin_id)
);

-- ═════════════════════════════════════════════════════════════════════════
-- INDICES FOR PERFORMANCE
-- ═════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);
CREATE INDEX IF NOT EXISTS idx_user_analytics_user_id ON user_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_events_created ON user_events(created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_user_id ON wallet(user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_stats_user_id ON referral_stats(user_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_category ON reviews(category);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at);

CREATE INDEX IF NOT EXISTS idx_system_health_component ON system_health(component_name);
CREATE INDEX IF NOT EXISTS idx_error_logs_component ON error_logs(component);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_metric ON performance_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_api_calls_log_endpoint ON api_calls_log(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_calls_log_created ON api_calls_log(created_at);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at);

-- ═════════════════════════════════════════════════════════════════════════
-- VIEWS FOR REPORTING
-- ═════════════════════════════════════════════════════════════════════════

-- Quick stats for admin dashboard
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
    (SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE is_active = TRUE) as active_users,
    (SELECT COUNT(DISTINCT user_id) FROM transactions WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE) as today_transactions,
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE) as today_revenue,
    (SELECT COUNT(*) FROM referrals WHERE status = 'pending') as pending_referrals,
    (SELECT COUNT(*) FROM reviews WHERE status = 'pending') as pending_reviews,
    (SELECT COUNT(*) FROM system_health WHERE status != 'healthy') as unhealthy_components,
    (SELECT COUNT(DISTINCT user_id) FROM user_analytics) as total_registered_users,
    (SELECT COALESCE(SUM(balance), 0) FROM wallet) as total_balance_owed;

-- Revenue summary
CREATE OR REPLACE VIEW revenue_summary AS
SELECT
    DATE(created_at)::date as date,
    COUNT(*) as transaction_count,
    COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as completed_revenue,
    COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as failed_revenue,
    COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) as refunded_amount
FROM transactions
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Referral performance
CREATE OR REPLACE VIEW top_referrers AS
SELECT
    r.referrer_id,
    COUNT(r.id) as total_referrals,
    SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) as completed_referrals,
    SUM(r.reward_earned) as total_earned,
    AVG(r.reward_earned) as avg_reward
FROM referrals r
GROUP BY r.referrer_id
ORDER BY total_earned DESC
LIMIT 100;

-- System health summary
CREATE OR REPLACE VIEW health_summary AS
SELECT
    component_name,
    status,
    uptime_percentage,
    response_time_ms,
    error_count,
    last_check
FROM system_health
ORDER BY component_name;

GRANT SELECT ON admin_dashboard_stats TO postgres;
GRANT SELECT ON revenue_summary TO postgres;
GRANT SELECT ON top_referrers TO postgres;
GRANT SELECT ON health_summary TO postgres;
