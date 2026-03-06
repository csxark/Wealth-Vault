-- Migration: Advanced Portfolio Analytics & Performance Attribution
-- Issue #653: Advanced Portfolio Analytics & Performance Attribution
-- Description: Add tables for portfolio performance tracking, risk metrics, benchmark comparison, and attribution analysis

-- Portfolio Snapshots: Daily portfolio valuations
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    total_value DECIMAL(18,2) NOT NULL,
    liquid_value DECIMAL(18,2), -- Cash + easily liquidated assets
    invested_value DECIMAL(18,2), -- Invested in securities
    cash_balance DECIMAL(18,2),
    net_deposits DECIMAL(18,2) DEFAULT 0, -- Cumulative deposits - withdrawals
    daily_change DECIMAL(18,2),
    daily_change_percent DECIMAL(8,4),
    holdings_snapshot JSONB DEFAULT '{}'::jsonb, -- Holdings at this point in time
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance Metrics: Calculated returns and performance indicators
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL, -- daily, weekly, monthly, quarterly, yearly, ytd, inception
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    beginning_value DECIMAL(18,2) NOT NULL,
    ending_value DECIMAL(18,2) NOT NULL,
    net_cash_flow DECIMAL(18,2) DEFAULT 0,
    simple_return DECIMAL(10,6), -- (End - Start - Flows) / Start
    time_weighted_return DECIMAL(10,6), -- TWR using Modified Dietz
    money_weighted_return DECIMAL(10,6), -- IRR
    annualized_return DECIMAL(10,6),
    total_gain_loss DECIMAL(18,2),
    realized_gains DECIMAL(18,2),
    unrealized_gains DECIMAL(18,2),
    dividend_income DECIMAL(18,2),
    interest_income DECIMAL(18,2),
    calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Benchmark Prices: Historical benchmark index prices
CREATE TABLE IF NOT EXISTS benchmark_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    benchmark_symbol VARCHAR(20) NOT NULL, -- ^GSPC, ^RUT, ^NDX, etc.
    benchmark_name VARCHAR(100) NOT NULL,
    price_date DATE NOT NULL,
    open_price DECIMAL(12,4),
    high_price DECIMAL(12,4),
    low_price DECIMAL(12,4),
    close_price DECIMAL(12,4) NOT NULL,
    adjusted_close DECIMAL(12,4), -- Dividend-adjusted
    volume BIGINT,
    daily_return DECIMAL(10,6),
    data_source VARCHAR(50) DEFAULT 'yahoo_finance',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(benchmark_symbol, price_date)
);

-- Benchmark Comparisons: Portfolio vs benchmark analysis
CREATE TABLE IF NOT EXISTS benchmark_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    benchmark_symbol VARCHAR(20) NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    portfolio_return DECIMAL(10,6) NOT NULL,
    benchmark_return DECIMAL(10,6) NOT NULL,
    relative_return DECIMAL(10,6), -- Portfolio - Benchmark (alpha)
    tracking_error DECIMAL(10,6), -- Std dev of relative returns
    information_ratio DECIMAL(10,6), -- Alpha / Tracking Error
    up_capture_ratio DECIMAL(10,6), -- Performance in up markets
    down_capture_ratio DECIMAL(10,6), -- Performance in down markets
    correlation DECIMAL(8,6), -- Correlation coefficient
    calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Risk Metrics: Calculated risk measures
CREATE TABLE IF NOT EXISTS risk_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    volatility DECIMAL(10,6), -- Standard deviation (annualized)
    downside_deviation DECIMAL(10,6), -- Std dev of negative returns
    sharpe_ratio DECIMAL(10,6), -- (Return - RFR) / Volatility
    sortino_ratio DECIMAL(10,6), -- (Return - RFR) / Downside Deviation
    max_drawdown DECIMAL(10,6), -- Maximum peak-to-trough decline
    max_drawdown_start DATE,
    max_drawdown_end DATE,
    max_drawdown_recovery_date DATE,
    current_drawdown DECIMAL(10,6),
    beta DECIMAL(10,6), -- Sensitivity to benchmark
    alpha DECIMAL(10,6), -- Excess return vs benchmark
    var_95 DECIMAL(18,2), -- Value at Risk (95% confidence)
    cvar_95 DECIMAL(18,2), -- Conditional VaR
    calmar_ratio DECIMAL(10,6), -- Return / Max Drawdown
    risk_free_rate DECIMAL(6,4) DEFAULT 0.045, -- 4.5% for 2026
    calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance Attributions: Return decomposition by asset/sector
CREATE TABLE IF NOT EXISTS performance_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    attribution_type VARCHAR(50) NOT NULL, -- asset_class, sector, holding, geographic
    category_name VARCHAR(100) NOT NULL, -- Technology, Healthcare, AAPL, etc.
    beginning_value DECIMAL(18,2),
    ending_value DECIMAL(18,2),
    weight_percent DECIMAL(8,4), -- % of total portfolio
    total_return DECIMAL(10,6),
    contribution_to_return DECIMAL(10,6), -- Impact on portfolio return
    capital_gain DECIMAL(18,2),
    dividend_income DECIMAL(18,2),
    realized_gain DECIMAL(18,2),
    unrealized_gain DECIMAL(18,2),
    details JSONB DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sector Allocations: Sector exposure tracking
CREATE TABLE IF NOT EXISTS sector_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    allocation_date DATE NOT NULL,
    sector_name VARCHAR(100) NOT NULL, -- Technology, Healthcare, Financials, etc.
    allocation_value DECIMAL(18,2) NOT NULL,
    allocation_percent DECIMAL(8,4) NOT NULL,
    number_of_holdings INTEGER DEFAULT 0,
    top_holdings JSONB DEFAULT '[]'::jsonb,
    sector_return_ytd DECIMAL(10,6),
    benchmark_sector_weight DECIMAL(8,4), -- For comparison
    over_under_weight DECIMAL(8,4), -- Difference from benchmark
    created_at TIMESTAMP DEFAULT NOW()
);

-- Geographic Allocations: Geographic exposure tracking
CREATE TABLE IF NOT EXISTS geographic_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    allocation_date DATE NOT NULL,
    region VARCHAR(100) NOT NULL, -- North America, Europe, Asia, Emerging Markets, etc.
    country VARCHAR(100), -- USA, Canada, China, etc.
    allocation_value DECIMAL(18,2) NOT NULL,
    allocation_percent DECIMAL(8,4) NOT NULL,
    number_of_holdings INTEGER DEFAULT 0,
    currency_exposure VARCHAR(10), -- USD, EUR, JPY, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance Alerts: Alert configurations and history
CREATE TABLE IF NOT EXISTS performance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    alert_type VARCHAR(100) NOT NULL, -- underperformance, high_volatility, max_drawdown, concentration, rebalance
    alert_name VARCHAR(255) NOT NULL,
    description TEXT,
    threshold_value DECIMAL(10,6), -- Trigger threshold
    comparison_operator VARCHAR(10) DEFAULT 'greater_than', -- greater_than, less_than, equals
    benchmark_symbol VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    notification_channels JSONB DEFAULT '["email", "push"]'::jsonb,
    triggered_at TIMESTAMP,
    trigger_count INTEGER DEFAULT 0,
    last_triggered_value DECIMAL(10,6),
    trigger_details JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Performance Reports: Generated report metadata
CREATE TABLE IF NOT EXISTS performance_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL, -- monthly, quarterly, annual, custom
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    report_format VARCHAR(20) DEFAULT 'pdf', -- pdf, html, csv
    file_url TEXT,
    file_name VARCHAR(255),
    file_size INTEGER,
    report_sections JSONB DEFAULT '[]'::jsonb, -- Which sections included
    generation_status VARCHAR(20) DEFAULT 'pending', -- pending, generating, completed, failed
    generated_at TIMESTAMP,
    error_message TEXT,
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_portfolio_snapshots_user_date ON portfolio_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_portfolio_snapshots_vault_date ON portfolio_snapshots(vault_id, snapshot_date DESC);
CREATE INDEX idx_performance_metrics_user_period ON performance_metrics(user_id, period_type, period_end DESC);
CREATE INDEX idx_performance_metrics_vault_period ON performance_metrics(vault_id, period_type, period_end DESC);
CREATE INDEX idx_benchmark_prices_symbol_date ON benchmark_prices(benchmark_symbol, price_date DESC);
CREATE INDEX idx_benchmark_comparisons_user_benchmark ON benchmark_comparisons(user_id, benchmark_symbol, period_end DESC);
CREATE INDEX idx_risk_metrics_user_period ON risk_metrics(user_id, period_type, period_end DESC);
CREATE INDEX idx_performance_attributions_user_type ON performance_attributions(user_id, attribution_type, period_end DESC);
CREATE INDEX idx_sector_allocations_user_date ON sector_allocations(user_id, allocation_date DESC);
CREATE INDEX idx_geographic_allocations_user_date ON geographic_allocations(user_id, allocation_date DESC);
CREATE INDEX idx_performance_alerts_user_active ON performance_alerts(user_id, is_active);
CREATE INDEX idx_performance_reports_user_status ON performance_reports(user_id, generation_status, created_at DESC);

-- Insert common benchmarks
INSERT INTO benchmark_prices (benchmark_symbol, benchmark_name, price_date, close_price, adjusted_close, daily_return)
VALUES
    ('^GSPC', 'S&P 500', '2026-03-01', 5200.00, 5200.00, 0.0),
    ('^RUT', 'Russell 2000', '2026-03-01', 2100.00, 2100.00, 0.0),
    ('^NDX', 'NASDAQ-100', '2026-03-01', 18000.00, 18000.00, 0.0),
    ('URTH', 'MSCI World Index', '2026-03-01', 140.00, 140.00, 0.0),
    ('AGG', 'Total Bond Market', '2026-03-01', 100.00, 100.00, 0.0),
    ('BTC-USD', 'Bitcoin', '2026-03-01', 65000.00, 65000.00, 0.0)
ON CONFLICT (benchmark_symbol, price_date) DO NOTHING;

-- Add columns to investments table for sector/geographic classification
ALTER TABLE investments ADD COLUMN IF NOT EXISTS sector VARCHAR(100);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS currency VARCHAR(10);
ALTER TABLE investments ADD COLUMN IF NOT EXISTS market_cap_category VARCHAR(20); -- large, mid, small, micro

-- Comments
COMMENT ON TABLE portfolio_snapshots IS 'Daily portfolio valuations for performance tracking';
COMMENT ON TABLE performance_metrics IS 'Calculated returns and performance indicators by period';
COMMENT ON TABLE benchmark_prices IS 'Historical benchmark index prices for comparison';
COMMENT ON TABLE benchmark_comparisons IS 'Portfolio vs benchmark performance analysis';
COMMENT ON TABLE risk_metrics IS 'Calculated risk measures (Sharpe, Sortino, drawdown, etc.)';
COMMENT ON TABLE performance_attributions IS 'Return decomposition by asset class, sector, holding';
COMMENT ON TABLE sector_allocations IS 'Portfolio sector exposure tracking';
COMMENT ON TABLE geographic_allocations IS 'Portfolio geographic exposure tracking';
COMMENT ON TABLE performance_alerts IS 'Performance alert configurations and history';
COMMENT ON TABLE performance_reports IS 'Generated performance report metadata';
