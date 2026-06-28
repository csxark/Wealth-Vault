-- ============================================================================
-- GOAL ADJUSTMENT EXPLAINABILITY TIMELINE - Issue #715
-- ============================================================================
-- This migration adds comprehensive explainability logging for goal contribution
-- recommendation adjustments with factor-level attribution and human-readable reasons

-- Create Goal Adjustment Events Table
-- Logs every significant change to contribution recommendations with detailed reasons
CREATE TABLE goal_adjustment_explanations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Recommendation reference
    previous_recommendation_id UUID REFERENCES goal_contribution_recommendations(id) ON DELETE SET NULL,
    new_recommendation_id UUID NOT NULL REFERENCES goal_contribution_recommendations(id) ON DELETE CASCADE,
    
    -- Change details
    previous_amount NUMERIC(12, 2) NOT NULL,
    new_amount NUMERIC(12, 2) NOT NULL,
    amount_change NUMERIC(12, 2) NOT NULL,
    amount_change_percentage NUMERIC(5, 2) NOT NULL,
    
    -- Attribution Factors - Why did the recommendation change?
    attribution_factors JSONB NOT NULL DEFAULT '{}', -- Array of {factor, description, impact_pct, severity}
    
    -- Primary drivers
    income_delta NUMERIC(12, 2),
    income_delta_pct NUMERIC(5, 2),
    income_context TEXT,
    
    expense_delta NUMERIC(12, 2),
    expense_delta_pct NUMERIC(5, 2),
    expense_context TEXT,
    
    -- Temporal drivers
    days_to_deadline INT,
    deadline_pressure_score NUMERIC(3, 2), -- 0.0 to 1.0
    deadline_pressure_reason TEXT,
    
    -- Priority/Goal drivers
    priority_shift INTEGER, -- Change in priority score
    priority_context TEXT,
    goal_progress_pct NUMERIC(5, 2),
    goal_remaining_days INT,
    
    -- Confidence and stability
    confidence_score NUMERIC(3, 2) NOT NULL, -- 0.0 to 1.0
    confidence_level TEXT NOT NULL, -- low, medium, high
    stability_index NUMERIC(5, 2),
    
    -- User behavior context
    recent_contribution_history JSONB DEFAULT '{}', -- Last 6 months contributions
    volatility_trend TEXT, -- increasing, stable, decreasing
    
    -- Market/Economic context
    macro_factors JSONB DEFAULT '{}', -- Interest rates, inflation, market conditions
    external_context TEXT,
    
    -- Human-readable explanation
    summary TEXT NOT NULL, -- "Why changed" in plain language
    detailed_explanation TEXT, -- Longer form explanation
    recommendation_text TEXT, -- Action recommendation to user
    
    -- Event classification
    event_type TEXT NOT NULL DEFAULT 'adjustment', -- 'adjustment', 'reset', 'goal_completion_adjustment'
    severity TEXT NOT NULL DEFAULT 'normal', -- 'critical', 'high', 'normal', 'minor'
    
    -- Approval/Review tracking
    requires_review BOOLEAN DEFAULT false,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    review_status TEXT DEFAULT 'pending', -- pending, approved, flagged, dismissed
    review_notes TEXT,
    reviewed_at TIMESTAMP,
    
    -- User response tracking
    user_acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP,
    user_feedback TEXT,
    user_feedback_type TEXT, -- understood, confused, disagree_too_high, disagree_too_low
    
    -- Metadata
    algorithm_version TEXT DEFAULT 'v1.0',
    trigger_source TEXT NOT NULL, -- 'cashflow_change', 'goal_progress_update', 'priority_shift', 'manual_override', 'system_rebalance'
    calculation_metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX idx_goal_adjustment_user ON goal_adjustment_explanations(user_id);
CREATE INDEX idx_goal_adjustment_goal ON goal_adjustment_explanations(goal_id);
CREATE INDEX idx_goal_adjustment_created ON goal_adjustment_explanations(created_at DESC);
CREATE INDEX idx_goal_adjustment_severity ON goal_adjustment_explanations(severity);
CREATE INDEX idx_goal_adjustment_review_status ON goal_adjustment_explanations(review_status);
CREATE INDEX idx_goal_adjustment_event_type ON goal_adjustment_explanations(event_type);

-- Create Goal Adjustment Attribution Breakdown Table
-- Detailed attribution showing which factors contributed to the change
CREATE TABLE goal_adjustment_attribution_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    explanation_id UUID NOT NULL REFERENCES goal_adjustment_explanations(id) ON DELETE CASCADE,
    
    -- Factor information
    factor_category TEXT NOT NULL, -- 'income', 'expense', 'deadline', 'priority', 'cashflow', 'macro', 'user_behavior'
    factor_name TEXT NOT NULL, -- Specific factor name
    factor_description TEXT NOT NULL, -- Human-readable description
    
    -- Attribution impact
    impact_percentage NUMERIC(5, 2) NOT NULL, -- % contribution to the change
    impact_amount NUMERIC(12, 2), -- Absolute dollar impact
    confidence_score NUMERIC(3, 2), -- 0.0 to 1.0
    
    -- Metric values
    previous_value NUMERIC(18, 4),
    current_value NUMERIC(18, 4),
    threshold_value NUMERIC(18, 4),
    
    -- Context details
    comparison_text TEXT, -- e.g., "Income increased by 15% vs Aug average"
    severity_indicator TEXT, -- 'critical_change','significant_change', 'moderate_change', 'minor_change'
    
    -- Related data
    metric_source TEXT, -- 'cashflow_analysis', 'goal_progress', 'calendar_countdown', 'priority_engine', 'macro_feed'
    data_lookback_days INT, -- How far back data was analyzed
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attribution_explanation ON goal_adjustment_attribution_details(explanation_id);
CREATE INDEX idx_attribution_factor_category ON goal_adjustment_attribution_details(factor_category);

-- Create Goal Adjustment Timeline Archive
-- Immutable timeline of all adjustments for audit and historical analysis
CREATE TABLE goal_adjustment_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Timeline event
    event_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_sequence INT NOT NULL, -- Chronological order
    
    -- Reference to detailed explanation
    explanation_id UUID NOT NULL REFERENCES goal_adjustment_explanations(id) ON DELETE CASCADE,
    
    -- Summary snapshot
    previous_recommendation_amount NUMERIC(12, 2) NOT NULL,
    new_recommendation_amount NUMERIC(12, 2) NOT NULL,
    primary_driver_factor TEXT NOT NULL, -- top factor that drove change
    
    -- User interaction tracking
    user_viewed BOOLEAN DEFAULT false,
    user_viewed_at TIMESTAMP,
    user_interacted BOOLEAN DEFAULT false,
    user_interaction_type TEXT, -- 'acknowledged', 'dismissed', 'requested_adjustment', 'flagged_unclear'
    user_interaction_at TIMESTAMP,
    
    -- Engagement metric
    engagement_score INT DEFAULT 0, -- Points for user engagement with explanation
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timeline_user ON goal_adjustment_timeline(user_id);
CREATE INDEX idx_timeline_goal ON goal_adjustment_timeline(goal_id);
CREATE INDEX idx_timeline_event_date ON goal_adjustment_timeline(event_date DESC);
CREATE INDEX idx_timeline_explanation ON goal_adjustment_timeline(explanation_id);

-- Create Goal Adjustment Insights Table
-- Pre-computed insights for dashboard display
CREATE TABLE goal_adjustment_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    
    -- Most common adjustment drivers
    top_factors JSONB NOT NULL DEFAULT '{}', -- [{factor, count, avg_impact_pct}, ...]
    
    -- Volatility analysis
    adjustment_frequency TEXT NOT NULL, -- 'very_stable', 'stable', 'volatile', 'very_volatile'
    adjustments_last_30_days INT DEFAULT 0,
    avg_days_between_adjustments NUMERIC(10, 2),
    
    -- Trend analysis
    trend TEXT NOT NULL, -- 'increasing_recommendations', 'decreasing_recommendations', 'stable'
    trend_direction INT DEFAULT 0, -- -1, 0, +1
    
    -- Trust score
    user_trust_score NUMERIC(3, 2) DEFAULT 0.5, -- Based on user feedback and engagement
    clarity_score NUMERIC(3, 2) DEFAULT 0.5, -- Based on user understanding (engagement metrics)
    
    -- Recommendations for improvement
    improvement_areas JSONB DEFAULT '[]', -- Areas where explanations could be clearer
    
    last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_insights_user ON goal_adjustment_insights(user_id);
CREATE INDEX idx_insights_goal ON goal_adjustment_insights(goal_id);

-- Create Goal Adjustment Comparison Table
-- Store comparisons between predicted and actual recommendation changes
CREATE TABLE goal_adjustment_comparison (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    explanation_id UUID NOT NULL REFERENCES goal_adjustment_explanations(id) ON DELETE CASCADE,
    
    -- Model prediction vs actual
    predicted_adjustment_amount NUMERIC(12, 2),
    actual_adjustment_amount NUMERIC(12, 2),
    prediction_accuracy_score NUMERIC(3, 2), -- 0-1
    
    -- Contributing factors comparison
    predicted_top_factors JSONB,
    actual_top_factors JSONB,
    factor_accuracy_match NUMERIC(3, 2), -- % of predicted factors that were actual
    
    -- Model version
    model_version TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_comparison_explanation ON goal_adjustment_comparison(explanation_id);
