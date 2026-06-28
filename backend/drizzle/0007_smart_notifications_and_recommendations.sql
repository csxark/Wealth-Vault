-- Migration: Smart Notifications & Recommendations for Budget Alerts
-- Issue: #626
-- Implements real-time budget alerts, smart notifications, recommendations engine, and benchmarking

-- Smart Alert Rules Table - Configurable thresholds with multiple alert levels
CREATE TABLE IF NOT EXISTS smart_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Rule configuration
    rules_name TEXT NOT NULL, -- e.g., "Dining Budget Alerts"
    rule_type TEXT NOT NULL, -- 'percentage_based', 'absolute', 'trend_based'
    
    -- Multi-level alert thresholds (e.g., 80%, 95%, 100%, 150%)
    -- Stored as JSONB to support variable number of thresholds
    alert_thresholds JSONB NOT NULL DEFAULT '[
        {"level": 1, "percentage": 80, "description": "Warning - 80% of budget reached", "severity": "info"},
        {"level": 2, "percentage": 95, "description": "Alert - 95% of budget reached", "severity": "warning"},
        {"level": 3, "percentage": 100, "description": "Critical - Budget fully spent", "severity": "danger"},
        {"level": 4, "percentage": 150, "description": "Overspent - 50% over budget", "severity": "critical"}
    ]'::jsonb,
    
    -- Period configuration
    period TEXT NOT NULL DEFAULT 'monthly', -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    budget_amount NUMERIC(12, 2) NOT NULL, -- Monthly/weekly budget for this category
    
    -- Smart notification settings
    notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    notification_channels JSONB DEFAULT '["in-app", "email"]'::jsonb, -- Channels to notify
    quiet_hours JSONB DEFAULT '{
        "enabled": false,
        "start_hour": 20,
        "end_hour": 8,
        "timezone": "UTC"
    }'::jsonb, -- Don't send notifications during quiet hours
    max_notifications_per_day INTEGER DEFAULT 3, -- Prevent alert fatigue
    
    -- Smart scheduling - when to send alerts
    preferred_notification_time TIME DEFAULT '09:00:00', -- When to send summary
    send_daily_summary BOOLEAN DEFAULT FALSE,
    send_weekly_summary BOOLEAN DEFAULT FALSE,
    
    -- Flags
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_template BOOLEAN DEFAULT FALSE, -- Can be used as template for other users
    
    -- Tracking
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{
        "created_by": "user",
        "last_modified_by": null,
        "notes": null
    }'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for smart alert rules
CREATE INDEX idx_smart_alert_rules_tenant_user ON smart_alert_rules(tenant_id, user_id);
CREATE INDEX idx_smart_alert_rules_category ON smart_alert_rules(category_id);
CREATE INDEX idx_smart_alert_rules_active ON smart_alert_rules(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_smart_alert_rules_period ON smart_alert_rules(period);

-- Smart Recommendations Table - AI-generated spending reduction recommendations
CREATE TABLE IF NOT EXISTS smart_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Recommendation metadata
    recommendation_type TEXT NOT NULL, -- 'merchant_consolidation', 'spending_pattern', 'category_insight', 'budget_optimization'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Financial impact
    estimated_monthly_savings NUMERIC(12, 2) NOT NULL DEFAULT 0,
    savings_percentage NUMERIC(5, 2), -- Percentage savings vs current spending
    savings_confidence_score NUMERIC(3, 2) DEFAULT 0.85, -- 0-1, how confident we are in this recommendation
    
    -- Action items
    action_items JSONB DEFAULT '[]'::jsonb, -- Array of specific actions user can take
    implementation_difficulty TEXT, -- 'easy', 'moderate', 'hard'
    time_to_implement_days INTEGER, -- Estimated days to implement
    
    -- Supporting data
    supporting_data JSONB DEFAULT '{}'::jsonb, -- Analysis data, historical patterns, etc.
    benchmark_data JSONB DEFAULT '{}'::jsonb, -- Peer comparison data
    
    -- Status tracking
    status TEXT DEFAULT 'suggested', -- 'suggested', 'accepted', 'implemented', 'dismissed'
    user_feedback TEXT, -- User's reason for accepting/dismissing
    dismissed_at TIMESTAMPTZ,
    implemented_at TIMESTAMPTZ,
    impact_measured_at TIMESTAMPTZ,
    measured_savings NUMERIC(12, 2), -- Actual savings after implementation
    
    -- Ranking
    priority_score NUMERIC(3, 2), -- 0-1, importance/impact score
    relevance_score NUMERIC(3, 2), -- 0-1, how relevant to user's patterns
    
    -- Metadata
    generated_by TEXT, -- 'ai_analysis', 'pattern_detection', 'peer_comparison'
    analysis_version TEXT,
    expires_at TIMESTAMPTZ, -- Recommendation expires after certain time
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for recommendations
CREATE INDEX idx_recommendations_tenant_user ON smart_recommendations(tenant_id, user_id);
CREATE INDEX idx_recommendations_category ON smart_recommendations(category_id);
CREATE INDEX idx_recommendations_status ON smart_recommendations(status) WHERE status IN ('suggested', 'accepted');
CREATE INDEX idx_recommendations_priority ON smart_recommendations(priority_score DESC) WHERE status = 'suggested';
CREATE INDEX idx_recommendations_expires ON smart_recommendations(expires_at) WHERE expires_at IS NOT NULL;

-- Spending Benchmarks Table - Compare user spending against peer groups
CREATE TABLE IF NOT EXISTS spending_benchmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Benchmark definition
    benchmark_name TEXT NOT NULL, -- 'age_30-40', 'income_50k-100k', 'family_with_kids'
    benchmark_description TEXT,
    
    -- Cohort information
    cohort_size INTEGER, -- Number of users in this cohort
    demographic_criteria JSONB DEFAULT '{}'::jsonb, -- Age range, income range, family status, etc.
    
    -- Statistics
    average_spending NUMERIC(12, 2) NOTULL, -- Average spending in this category
    median_spending NUMERIC(12, 2) NOT NULL, -- Median spending
    percentile_10 NUMERIC(12, 2), -- Bottom 10%
    percentile_25 NUMERIC(12, 2), -- Bottom 25%
    percentile_75 NUMERIC(12, 2), -- Top 25%
    percentile_90 NUMERIC(12, 2), -- Top 10%
    std_deviation NUMERIC(12, 2), -- Standard deviation
    
    -- Period information
    period TEXT NOT NULL DEFAULT 'monthly', -- 'monthly', 'quarterly', 'yearly'
    benchmark_month_year DATE, -- Month/year this benchmark is for
    
    -- Trend data
    trend_direction TEXT, -- 'increasing', 'decreasing', 'stable'
    month_over_month_change NUMERIC(5, 2), -- Percentage change vs previous month
    year_over_year_change NUMERIC(5, 2), -- Percentage change vs previous year
    
    -- Metadata
    data_quality_score NUMERIC(3, 2) DEFAULT 0.95, -- 0-1, how reliable this benchmark is
    last_updated_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for benchmarks
CREATE INDEX idx_benchmarks_tenant_category ON spending_benchmarks(tenant_id, category_id);
CREATE INDEX idx_benchmarks_period ON spending_benchmarks(period);
CREATE INDEX idx_benchmarks_updated ON spending_benchmarks(last_updated_at) WHERE last_updated_at IS NOT NULL;

-- User Spending Profile Table - Aggregated data for benchmarking
CREATE TABLE IF NOT EXISTS user_spending_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Demographics (optional, for benchmarking)
    age_range TEXT, -- '20-30', '30-40', '40-50', '50-60', '60+'
    household_income_range TEXT, -- '<30k', '30k-50k', '50k-100k', '100k-200k', '200k+'
    family_status TEXT, -- 'single', 'married', 'with_kids', 'empty_nester'
    location TEXT, -- City/State or region
    
    -- Spending profile
    period TEXT NOT NULL DEFAULT 'monthly',
    average_monthly_spending NUMERIC(12, 2) NOT NULL DEFAULT 0,
    average_transaction_size NUMERIC(12, 2),
    transaction_frequency INTEGER, -- Transactions per month
    
    -- Trends
    spending_trend NUMERIC(5, 2), -- Percentage change over last 3 months
    volatility NUMERIC(5, 2), -- Standard deviation of monthly spending
    
    -- Top merchants
    top_merchants JSONB DEFAULT '[]'::jsonb, -- Array of top merchants with spending
    top_merchants_percentage NUMERIC(5, 2), -- % spending on top 3 merchants
    
    -- Comparison data
    benchmark_percentile NUMERIC(5, 2), -- Where user ranks among peers (0-100)
    is_outlier BOOLEAN DEFAULT FALSE, -- Significantly above/below peer average
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for spending profiles
CREATE INDEX idx_spending_profiles_tenant_user_category ON user_spending_profiles(tenant_id, user_id, category_id);
CREATE INDEX idx_spending_profiles_period ON user_spending_profiles(period);

-- Merchant Consolidation Analysis Table - Identify consolidation opportunities
CREATE TABLE IF NOT EXISTS merchant_consolidation_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    
    -- Merchant information
    primary_merchant TEXT NOT NULL, -- Merchant to consolidate to
    alternate_merchants JSONB DEFAULT '[]'::jsonb, -- Array of merchants to consolidate from
    
    -- Consolidation analysis
    total_current_spending NUMERIC(12, 2) NOT NULL, -- Current spend across merchants
    consolidation_target_spending NUMERIC(12, 2) NOT NULL, -- Expected spend if consolidated
    estimated_savings NUMERIC(12, 2) NOT NULL DEFAULT 0,
    savings_percentage NUMERIC(5, 2),
    
    -- Supporting data
    merchant_counts JSONB DEFAULT '{}'::jsonb, -- Count of transactions per merchant
    consolidation_strategy JSONB DEFAULT '{}'::jsonb, -- How to consolidate
    
    -- Implementation
    status TEXT DEFAULT 'identified', -- 'identified', 'recommended', 'in_progress', 'completed', 'failed'
    implementation_date TIMESTAMPTZ,
    success_date TIMESTAMPTZ,
    
    -- Post-implementation
    actual_savings NUMERIC(12, 2),
    lessons_learned TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for merchant consolidation
CREATE INDEX idx_merchant_consolidation_user_category ON merchant_consolidation_analysis(tenant_id, user_id, category_id);
CREATE INDEX idx_merchant_consolidation_status ON merchant_consolidation_analysis(status);

-- Notification History Table - Track all notifications sent to user
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Notification metadata
    notification_type TEXT NOT NULL, -- 'budget_alert', 'recommendation', 'summary', 'milestone'
    related_alert_rule_id UUID REFERENCES smart_alert_rules(id) ON DELETE SET NULL,
    related_budget_alert_id UUID REFERENCES budget_alerts(id) ON DELETE SET NULL,
    related_recommendation_id UUID REFERENCES smart_recommendations(id) ON DELETE SET NULL,
    
    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    rich_content JSONB DEFAULT '{}'::jsonb, -- Structured data for rich notifications
    
    -- Delivery
    channels_attempted JSONB DEFAULT '["in-app"]'::jsonb, -- Channels attempted
    channels_succeeded JSONB DEFAULT '[]'::jsonb, -- Successfully delivered channels
    
    -- Performance
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    interaction_data JSONB DEFAULT '{
        "clicked": false,
        "dismissed": false,
        "action_taken": null
    }'::jsonb,
    
    -- Status
    delivery_status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
    failure_reason TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for notification history
CREATE INDEX idx_notification_history_user ON notification_history(user_id);
CREATE INDEX idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX idx_notification_history_delivered ON notification_history(delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX idx_notification_history_read ON notification_history(read_at) WHERE read_at IS NOT NULL;

-- Daily Spending Summary Table - Pre-computed daily summaries for dashboard
CREATE TABLE IF NOT EXISTS daily_spending_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Date information
    summary_date DATE NOT NULL,
    
    -- Summary data
    total_spending_today NUMERIC(12, 2) DEFAULT 0,
    transaction_count INTEGER DEFAULT 0,
    categories_involved JSONB DEFAULT '[]'::jsonb, -- Array of categories with spending today
    
    -- Budget status
    budget_status JSONB DEFAULT '{}'::jsonb, -- Per category budget percentage
    alerts_triggered JSONB DEFAULT '[]'::jsonb, -- Alerts that triggered today
    
    -- Top transactions
    top_transactions JSONB DEFAULT '[]'::jsonb, -- Largest transactions today
    
    -- Comparison
    vs_yesterday_change NUMERIC(5, 2), -- Percentage change
    vs_weekly_average_change NUMERIC(5, 2),
    vs_monthly_average_change NUMERIC(5, 2),
    
    -- Metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(tenant_id, user_id, summary_date)
);

-- Indexes for daily summary
CREATE INDEX idx_daily_summary_user_date ON daily_spending_summary(user_id, summary_date DESC);
CREATE INDEX idx_daily_summary_computed ON daily_spending_summary(computed_at);

-- Create indexes for better alert rule performance
CREATE INDEX idx_smart_alert_rules_active_period ON smart_alert_rules(is_active, period) 
    WHERE is_active = TRUE;

-- Create index for fast notification filtering by time
CREATE INDEX idx_notification_history_user_type_sent ON notification_history(user_id, notification_type, sent_at DESC);
