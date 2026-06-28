# Issue #653: Advanced Portfolio Analytics & Performance Attribution

## Overview
Implement comprehensive portfolio analytics to help users understand portfolio performance, decompose returns, compare against benchmarks, calculate risk metrics, and generate detailed performance reports.

## Problem Statement
Users lack visibility into:
- Which assets/sectors are driving returns
- How they compare to benchmarks (S&P 500, Russell 2000, MSCI World)
- Risk metrics (volatility, drawdown, Sharpe ratio, Sortino ratio, beta)
- Historical performance trends across different time periods
- Accurate returns accounting for cash flows (deposits/withdrawals)

## Solution Architecture

### 1. Core Features

#### 1.1 Performance Attribution
- Decompose returns by asset class (stocks, bonds, crypto, real estate)
- Decompose returns by sector (technology, healthcare, finance, etc.)
- Decompose returns by individual holding
- Contribution to total return percentage
- Period-over-period comparison

#### 1.2 Benchmark Comparison
- Compare against major indices:
  - S&P 500 (US large cap)
  - Russell 2000 (US small cap)
  - NASDAQ-100 (US tech)
  - MSCI World (global developed)
  - Total Bond Market Index
  - Bitcoin/Crypto Index
- Relative performance (alpha generation)
- Tracking error calculation
- Up/down capture ratios

#### 1.3 Risk Metrics
- **Volatility**: Standard deviation of returns
- **Sharpe Ratio**: Risk-adjusted return (excess return / volatility)
- **Sortino Ratio**: Downside risk-adjusted return
- **Maximum Drawdown**: Peak-to-trough decline
- **Beta**: Correlation to benchmark
- **Alpha**: Excess return vs benchmark
- **Value at Risk (VaR)**: Potential loss at confidence level
- **Calmar Ratio**: Return / max drawdown

#### 1.4 Time-Weighted Returns (TWR)
- Eliminate impact of cash flows (deposits/withdrawals)
- Accurate portfolio manager performance measurement
- Modified Dietz method for daily calculations
- Geometric linking of sub-period returns

#### 1.5 Sector & Geographic Breakdown
- Sector allocation percentages
- Geographic exposure (US, Europe, Asia, Emerging Markets)
- Industry concentration analysis
- Currency exposure breakdown

#### 1.6 Performance Alerts
- Underperforming benchmark by X%
- Excessive volatility alerts
- Maximum drawdown exceeded threshold
- Sector concentration warnings
- Rebalancing recommendations

#### 1.7 PDF Reports
- Executive summary with key metrics
- Performance charts (line, bar, pie)
- Holdings breakdown table
- Risk analysis section
- Benchmark comparison
- Asset allocation visualization

### 2. Database Schema Enhancements

#### New Tables to Create:
1. **portfolio_snapshots** - Daily portfolio valuations
2. **performance_metrics** - Calculated returns and metrics
3. **benchmark_prices** - Historical benchmark index prices
4. **benchmark_comparisons** - Portfolio vs benchmark analysis
5. **risk_metrics** - Calculated risk measures
6. **performance_attributions** - Return decomposition by asset/sector
7. **sector_allocations** - Sector exposure tracking
8. **geographic_allocations** - Geographic exposure tracking
9. **performance_alerts** - Alert configurations and history
10. **performance_reports** - Generated report metadata

### 3. Performance Metrics Calculations

#### Time-Weighted Return (Modified Dietz)
```
TWR = (Ending Value - Beginning Value - Net Cash Flows) / 
      (Beginning Value + Weighted Cash Flows)

Weighted Cash Flow = Cash Flow × (Days Remaining / Total Days)
```

#### Sharpe Ratio
```
Sharpe Ratio = (Portfolio Return - Risk-Free Rate) / Portfolio Volatility

Where:
- Risk-Free Rate = 3-month Treasury Bill rate (~4.5% for 2026)
- Portfolio Volatility = Standard deviation of returns
```

#### Sortino Ratio
```
Sortino Ratio = (Portfolio Return - Risk-Free Rate) / Downside Deviation

Where:
- Downside Deviation = Std dev of negative returns only
```

#### Maximum Drawdown
```
Max Drawdown = (Trough Value - Peak Value) / Peak Value

Track all peak-to-trough declines and identify the largest
```

#### Beta
```
Beta = Covariance(Portfolio Returns, Benchmark Returns) / 
       Variance(Benchmark Returns)

Beta > 1: More volatile than benchmark
Beta = 1: Moves with benchmark
Beta < 1: Less volatile than benchmark
```

#### Alpha
```
Alpha = Portfolio Return - [Risk-Free Rate + Beta × (Benchmark Return - Risk-Free Rate)]

Positive alpha = Outperforming risk-adjusted benchmark
```

### 4. Benchmark Data Sources

#### Major Indices to Track:
- **S&P 500**: ^GSPC (Yahoo Finance)
- **Russell 2000**: ^RUT
- **NASDAQ-100**: ^NDX
- **MSCI World**: URTH (ETF proxy)
- **Total Bond Market**: AGG (ETF)
- **Bitcoin**: BTC-USD

#### Data Update Frequency:
- Daily closing prices
- Dividend-adjusted returns
- 1-year, 3-year, 5-year, 10-year historical data

### 5. API Endpoints

#### Performance Analysis
- `GET /api/portfolio/performance` - Overall performance summary
- `GET /api/portfolio/performance/:period` - Performance for time period
- `GET /api/portfolio/attribution` - Performance attribution breakdown
- `GET /api/portfolio/twr` - Time-weighted returns

#### Risk Metrics
- `GET /api/portfolio/risk-metrics` - All risk metrics
- `GET /api/portfolio/risk-metrics/sharpe` - Sharpe ratio
- `GET /api/portfolio/risk-metrics/drawdown` - Max drawdown analysis
- `GET /api/portfolio/risk-metrics/volatility` - Volatility metrics

#### Benchmark Comparison
- `GET /api/portfolio/benchmark/:benchmarkId` - Compare to benchmark
- `GET /api/portfolio/benchmarks` - Available benchmarks
- `GET /api/portfolio/alpha-beta` - Alpha and beta calculations

#### Allocation Analysis
- `GET /api/portfolio/allocation/sector` - Sector breakdown
- `GET /api/portfolio/allocation/geography` - Geographic breakdown
- `GET /api/portfolio/allocation/asset-class` - Asset class breakdown

#### Alerts & Reports
- `GET /api/portfolio/alerts` - Performance alerts
- `POST /api/portfolio/alerts` - Create alert
- `GET /api/portfolio/reports` - List reports
- `POST /api/portfolio/reports/generate` - Generate PDF report
- `GET /api/portfolio/reports/:id/download` - Download report

### 6. Frontend Components

#### New Components
- `PortfolioAnalyticsDashboard.tsx` - Main analytics view
- `PerformanceChart.tsx` - Interactive performance chart
- `RiskMetricsCard.tsx` - Risk metrics display
- `BenchmarkComparison.tsx` - Benchmark comparison chart
- `AttributionBreakdown.tsx` - Return attribution visualization
- `SectorAllocationPie.tsx` - Sector allocation pie chart
- `GeographicMap.tsx` - Geographic exposure heatmap
- `PerformanceAlertsPanel.tsx` - Alerts management
- `ReportGenerator.tsx` - PDF report configuration

### 7. Implementation Phases

#### Phase 1: Core Infrastructure (3-4 days)
- [ ] Database schema and migrations
- [ ] Portfolio snapshot tracking
- [ ] Benchmark data ingestion
- [ ] Basic return calculations

#### Phase 2: Performance Attribution (2-3 days)
- [ ] Return decomposition by asset
- [ ] Sector attribution
- [ ] Contribution analysis
- [ ] Period comparison

#### Phase 3: Risk Metrics (3-4 days)
- [ ] Sharpe ratio calculator
- [ ] Sortino ratio calculator
- [ ] Maximum drawdown tracker
- [ ] Beta and alpha calculations
- [ ] Volatility analysis

#### Phase 4: Time-Weighted Returns (2-3 days)
- [ ] Modified Dietz method implementation
- [ ] Cash flow tracking
- [ ] Geometric linking
- [ ] Annualized returns

#### Phase 5: Benchmark Comparison (2-3 days)
- [ ] Benchmark data sync
- [ ] Relative performance calculations
- [ ] Tracking error
- [ ] Up/down capture ratios

#### Phase 6: Allocation Analysis (2 days)
- [ ] Sector classification
- [ ] Geographic mapping
- [ ] Concentration analysis
- [ ] Exposure metrics

#### Phase 7: Alerts & Reports (3-4 days)
- [ ] Alert engine
- [ ] PDF report generation
- [ ] Chart rendering
- [ ] Email delivery

#### Phase 8: UI & API (3-4 days)
- [ ] API endpoints
- [ ] Frontend components
- [ ] Interactive charts
- [ ] Real-time updates

#### Phase 9: Testing & Polish (2-3 days)
- [ ] Unit tests
- [ ] Integration tests
- [ ] Performance optimization
- [ ] Documentation

### 8. Risk Metrics Formulas Reference

#### Standard Deviation (Volatility)
```
σ = √[Σ(R_i - R_avg)² / (N - 1)]

Where R_i = individual returns, R_avg = mean return, N = number of periods
Annualized: σ_annual = σ_daily × √252 (trading days)
```

#### Value at Risk (VaR) - 95% Confidence
```
VaR_95 = μ - (1.645 × σ)

95% confidence that loss won't exceed VaR amount
```

#### Calmar Ratio
```
Calmar Ratio = Annualized Return / Abs(Maximum Drawdown)

Higher = Better risk-adjusted return considering drawdown
```

#### Tracking Error
```
Tracking Error = Std Dev(Portfolio Return - Benchmark Return)

Measures consistency of outperformance/underperformance
```

#### Information Ratio
```
Information Ratio = (Portfolio Return - Benchmark Return) / Tracking Error

Measures risk-adjusted active return
```

### 9. Sector Classification

#### Standard Sectors:
1. Technology
2. Healthcare
3. Financials
4. Consumer Discretionary
5. Consumer Staples
6. Industrials
7. Energy
8. Materials
9. Real Estate
10. Utilities
11. Communications

#### Asset Classes:
1. Equities (Stocks)
2. Fixed Income (Bonds)
3. Cash & Cash Equivalents
4. Cryptocurrencies
5. Real Estate
6. Commodities
7. Alternatives

### 10. Success Metrics

- **95%+** calculation accuracy for returns
- **100%** daily snapshot capture rate
- **<2 seconds** performance metric calculation time
- **90%+** user satisfaction with insights
- **50%+** users generate monthly reports
- **Sharpe ratio improvement** tracking over time

### 11. Technical Requirements

#### Backend Dependencies
- PDF generation library (e.g., PDFKit, Puppeteer)
- Chart rendering (e.g., Chart.js, D3.js for server-side)
- Financial calculation libraries
- Benchmark data API integration

#### Data Storage
- Daily snapshots stored for 10+ years
- Efficient time-series queries
- Aggregated metrics caching
- Indexed lookups for date ranges

#### Performance Optimization
- Pre-calculate common metrics
- Cache benchmark data
- Batch processing for historical analysis
- Incremental updates for real-time metrics

### 12. Timeline Estimate

- Phase 1: 3-4 days
- Phase 2: 2-3 days
- Phase 3: 3-4 days
- Phase 4: 2-3 days
- Phase 5: 2-3 days
- Phase 6: 2 days
- Phase 7: 3-4 days
- Phase 8: 3-4 days
- Phase 9: 2-3 days
- **Total: 22-30 days**

## Implementation Status

- [ ] Database schema created
- [ ] Performance attribution service implemented
- [ ] Risk metrics calculator built
- [ ] Benchmark comparison engine created
- [ ] Time-weighted returns calculator implemented
- [ ] Sector/geographic allocation analyzer built
- [ ] Alert engine created
- [ ] PDF report generator implemented
- [ ] API endpoints created
- [ ] Frontend components built
- [ ] Testing completed

---

**Assignee**: Ayaanshaikh12243  
**Label**: enhancement, ECWoC26  
**Issue**: #653
