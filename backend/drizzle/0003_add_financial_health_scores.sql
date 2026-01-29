-- Migration: Add Financial Health Scores table
-- Description: Adds table to track historical financial health scores and predictions

CREATE TABLE IF NOT EXISTS financial_health_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    overall_score DOUBLE PRECISION NOT NULL,
    rating TEXT NOT NULL,
    
    -- Individual component scores
    dti_score DOUBLE PRECISION DEFAULT 0,
    savings_rate_score DOUBLE PRECISION DEFAULT 0,
    volatility_score DOUBLE PRECISION DEFAULT 0,
    emergency_fund_score DOUBLE PRECISION DEFAULT 0,
    budget_adherence_score DOUBLE PRECISION DEFAULT 0,
    goal_progress_score DOUBLE PRECISION DEFAULT 0,
    
    -- Raw metrics used in calculation
    metrics JSONB DEFAULT '{
        "dti": 0,
        "savingsRate": 0,
        "volatility": 0,
        "monthlyIncome": 0,
        "monthlyExpenses": 0,
        "emergencyFundMonths": 0,
        "budgetAdherence": 0,
        "goalProgress": 0
    }'::jsonb,
    
    -- Recommendation and insights
    recommendation TEXT,
    insights JSONB DEFAULT '[]'::jsonb,
    
    -- Prediction data
    cash_flow_prediction JSONB DEFAULT '{
        "predictedExpenses": 0,
        "predictedIncome": 0,
        "predictedBalance": 0,
        "confidence": "low",
        "warning": null
    }'::jsonb,
    
    -- Period this score represents
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    
    -- Metadata
    calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_financial_health_scores_user_id ON financial_health_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_health_scores_calculated_at ON financial_health_scores(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_health_scores_rating ON financial_health_scores(rating);
CREATE INDEX IF NOT EXISTS idx_financial_health_scores_period ON financial_health_scores(period_start, period_end);

-- Add comment to table
COMMENT ON TABLE financial_health_scores IS 'Stores historical financial health scores and predictions for users';
COMMENT ON COLUMN financial_health_scores.overall_score IS 'Overall financial health score (0-100)';
COMMENT ON COLUMN financial_health_scores.rating IS 'Health rating: Excellent, Good, Fair, or Needs Improvement';
COMMENT ON COLUMN financial_health_scores.metrics IS 'Raw financial metrics used in score calculation';
COMMENT ON COLUMN financial_health_scores.insights IS 'Array of personalized insights and recommendations';
COMMENT ON COLUMN financial_health_scores.cash_flow_prediction IS 'Predicted cash flow for next period';
