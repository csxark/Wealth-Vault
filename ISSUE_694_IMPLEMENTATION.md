# ISSUE #694: Portfolio Performance Attribution & Risk Analytics - Implementation Guide

## Overview
Complete implementation of advanced portfolio analytics engine featuring performance attribution, comprehensive risk metrics (volatility, Sharpe ratio, max drawdown, beta, VaR), benchmark comparisons against major indices, and historical trend analysis.

## Problem Solved
Users previously lacked visibility into:
- Which assets/sectors drive portfolio returns
- Risk metrics (volatility, Sharpe ratio, drawdown)  
- Performance comparison against benchmarks (S&P 500, MSCI World, etc.)
- Historical performance trends and patterns

## Solution Implemented

### 1. **Extended Performance Attribution Service**
File: `backend/services/performanceAttributionService.js`

#### New Methods Added:

##### `calculateRiskMetrics(userId, periodStart, periodEnd, vaultId)`
Calculates comprehensive risk metrics:
- **Volatility**: Annualized standard deviation of returns
- **Sharpe Ratio**: Risk-adjusted return metric
- **Sortino Ratio**: Downside risk-adjusted return
- **Calmar Ratio**: Return to max drawdown ratio
- **Maximum Drawdown**: Largest peak-to-trough decline
- **Beta**: Sensitivity to market movements (vs S&P 500)
- **VaR (95%)**: Value at Risk at 95% confidence
- **CVaR (95%)**: Conditional VaR (expected shortfall)

**Returns:**
```javascript
{
  success: true,
  period: { start, end },
  volatility: "15.23",               // Annualized %
  sharpeRatio: "1.234",
  sortinoRatio: "1.567",
  calmarRatio: "2.345",
  maxDrawdown: "12.45",              // %
  beta: "0.987",
  var95: "-2.34",                    // %
  cvar95: "-3.12",                   // %
  avgDailyReturn: "0.0543",
  annualizedReturn: "14.23",
  sampleSize: 252
}
```

##### `compareToBenchmarks(userId, periodStart, periodEnd, vaultId)`
Compares portfolio against major market benchmarks:
- S&P 500 (SPY)
- NASDAQ 100 (QQQ)
- MSCI World (ACWI)
- MSCI EAFE (EFA)
- US Aggregate Bonds (AGG)
- Gold (GLD)
- Real Estate/REITs (VNQ)
- Bitcoin (BTC-USD)

Calculates:
- Portfolio vs benchmark returns
- Alpha (excess return)
- Relative performance
- Outperformance indicators

**Returns:**
```javascript
{
  success: true,
  period: { start, end },
  portfolioReturn: "18.45",
  comparisons: [
    {
      benchmark: "S&P 500",
      symbol: "SPY",
      portfolioReturn: "18.45",
      benchmarkReturn: "15.20",
      alpha: "3.25",                  // Excess return
      outperforming: true,
      relativePerformance: "21.38"   // % better
    },
    // ... more benchmarks
  ]
}
```

##### `analyzePerformanceTrends(userId, periodStart, periodEnd, vaultId)`
Analyzes historical performance patterns:
- 30-day and 90-day trend analysis
- Momentum calculation (acceleration/deceleration)
- Volatility trend (increasing/decreasing/stable)
- Market regime identification (bull/bear/sideways)
- Rolling returns and volatility metrics

**Returns:**
```javascript
{
  success: true,
  period: { start, end },
  trend: "upward",
  trend30Day: "0.0125",
  trend90Day: "0.0098",
  momentum: "0.0027",
  momentumSignal: "accelerating",
  volatilityTrend: "decreasing",
  volatility30Day: "1.234",
  volatility90Day: "1.543",
  regime: "bull_market",
  rollingMetrics: {
    returns: [...],
    volatility: [...]
  }
}
```

#### Supporting Methods:
- `calculateStdDev(values)` - Standard deviation calculation
- `calculateMaxDrawdown(snapshots)` - Peak-to-trough analysis
- `calculateSortinoRatio(returns, riskFreeRate)` - Downside risk metric
- `calculateBeta(userId, returns, periodStart, periodEnd)` - Market sensitivity
- `getBenchmarkReturn(symbol, startDate, endDate)` - Fetch/cache benchmark data
- `getBenchmarkReturns(symbol, startDate, endDate)` - Time series benchmark data
- `calculateReturnsFromPrices(prices)` - Convert prices to returns
- `getPortfolioTimeSeries(userId, startDate, endDate, vaultId)` - Fetch snapshots
- `calculateLinearTrend(data)` - Least squares trend line
- `calculateRollingReturns(returns, window)` - Rolling period analysis
- `calculateRollingVolatility(returns, window)` - Rolling volatility
- `identifyMarketRegime(returns)` - Bull/bear/sideways classification

### 2. **API Endpoints**
File: `backend/routes/analytics.js`

#### New Routes:

##### `GET /api/analytics/portfolio/performance-attribution`
**Query Parameters:**
- `startDate` (required) - Analysis start date
- `endDate` (required) - Analysis end date  
- `vaultId` (optional) - Specific vault/portfolio

**Response:** Complete attribution breakdown by asset class, sector, holding, and geography

##### `GET /api/analytics/portfolio/risk-metrics`
**Query Parameters:**
- `startDate` (required)
- `endDate` (required)
- `vaultId` (optional)

**Response:** All risk metrics (volatility, Sharpe, drawdown, beta, VaR, etc.)

##### `GET /api/analytics/portfolio/benchmark-comparison`
**Query Parameters:**
- `startDate` (required)
- `endDate` (required)
- `vaultId` (optional)

**Response:** Comparison against 8 major benchmarks with alpha calculations

##### `GET /api/analytics/portfolio/performance-trends`
**Query Parameters:**
- `startDate` (required)
- `endDate` (required)
- `vaultId` (optional)

**Response:** Trend analysis with momentum and regime identification

##### `GET /api/analytics/portfolio/comprehensive`
**Query Parameters:**
- `startDate` (required)
- `endDate` (required)
- `vaultId` (optional)

**Response:** **ALL analytics in one call** (attribution + risk + benchmarks + trends)
- Optimized with `Promise.all()` for parallel execution
- Single API call for dashboard views

### 3. **Database Integration**
Uses existing schema tables:
- `portfolioSnapshots` - Time series portfolio values
- `benchmarkPrices` - Cached benchmark historical data
- `benchmarkComparisons` - Stored comparison results
- `performanceAttributions` - Attribution analysis logs

## Usage Examples

### Calculate Risk Metrics
```javascript
GET /api/analytics/portfolio/risk-metrics?startDate=2025-01-01&endDate=2026-03-03

Response:
{
  "success": true,
  "data": {
    "volatility": "15.23",
    "sharpeRatio": "1.234",
    "maxDrawdown": "12.45",
    "beta": "0.987",
    "var95": "-2.34",
    "cvar95": "-3.12"
  }
}
```

### Compare to Benchmarks
```javascript
GET /api/analytics/portfolio/benchmark-comparison?startDate=2025-01-01&endDate=2026-03-03

Response:
{
  "success": true,
  "data": {
    "portfolioReturn": "18.45",
    "comparisons": [
      {
        "benchmark": "S&P 500",
        "portfolioReturn": "18.45",
        "benchmarkReturn": "15.20",
        "alpha": "3.25",
        "outperforming": true
      },
      {
        "benchmark": "NASDAQ 100",
        "portfolioReturn": "18.45",
        "benchmarkReturn": "22.10",
        "alpha": "-3.65",
        "outperforming": false
      }
    ]
  }
}
```

### Analyze Trends
```javascript
GET /api/analytics/portfolio/performance-trends?startDate=2025-01-01&endDate=2026-03-03

Response:
{
  "success": true,
  "data": {
    "trend": "upward",
    "momentum": "0.0027",
    "momentumSignal": "accelerating",
    "volatilityTrend": "decreasing",
    "regime": "bull_market"
  }
}
```

### Get Everything at Once
```javascript
GET /api/analytics/portfolio/comprehensive?startDate=2025-01-01&endDate=2026-03-03

Response:
{
  "success": true,
  "data": {
    "attribution": { /* full attribution */ },
    "riskMetrics": { /* all risk metrics */ },
    "benchmarkComparison": { /* all benchmarks */ },
    "trends": { /* trend analysis */ },
    "generatedAt": "2026-03-03T10:30:00Z"
  }
}
```

## Key Features

### ✅ Performance Attribution
- Asset-level contribution to returns
- Sector-level aggregation
- Weight and return calculations
- Contribution decomposition

### ✅ Risk Metrics
- Volatility (annualized)
- Sharpe Ratio
- Sortino Ratio (downside risk)
- Calmar Ratio
- Maximum Drawdown
- Beta (market correlation)
- Value at Risk (VaR)
- Conditional VaR (CVaR)

### ✅ Benchmark Comparison
- 8 major market indices
- Alpha calculation
- Relative performance
- Automatic data caching
- Historical price storage

### ✅ Trend Analysis
- Multiple timeframe trends (30/90 day)
- Momentum indicators
- Volatility trend tracking
- Market regime classification
- Rolling metrics

### ✅ Optimization
- Parallel API execution
- Benchmark data caching
- Efficient time-series queries
- Minimal database hits

## Technical Highlights

### Benchmark Data Caching
```javascript
// Fetches from market data service only if not cached
// Stores in benchmarkPrices table for future use
const benchmarkReturn = await this.getBenchmarkReturn('SPY', startDate, endDate);
```

### Risk-Free Rate Assumption
```javascript
const riskFreeRate = 0.02; // 2% assumption
// Can be made configurable for different markets
```

### Annualization Factors
```javascript
const annualizedVolatility = dailyVolatility * Math.sqrt(252); // 252 trading days
const annualizedReturn = Math.pow(1 + avgDailyReturn, 252) - 1;
```

### Market Beta Calculation
```javascript
// Covariance(portfolio, market) / Variance(market)
// Uses S&P 500 (SPY) as market proxy
beta = covariance / marketVariance;
```

## Error Handling
All endpoints return structured error responses:
```javascript
{
  "success": false,
  "message": "Insufficient data for risk calculation"
}
```

Common error cases handled:
- Insufficient historical data (< 2 snapshots)
- Missing benchmark data
- Invalid date ranges
- Network failures on market data fetch

## Testing Recommendations

### Unit Tests
- Risk metric calculations with known data
- Benchmark return calculations
- Trend analysis with synthetic data
- Edge cases (zero volatility, negative returns)

### Integration Tests
- API endpoint responses
- Database interactions
- Caching behavior
- Error scenarios

### Performance Tests
- Large portfolios (1000+ assets)
- Long time periods (10+ years)
- Multiple concurrent requests
- Benchmark data fetching

## Security Considerations
- ✅ All endpoints protected with `protect` middleware
- ✅ User isolation (can only access own portfolio)
- ✅ Vault-level permissions respected
- ✅ No sensitive data in error messages

## Future Enhancements

### Potential Additions
1. **Configurable Risk-Free Rate** - Per-market adjustment
2. **Custom Benchmarks** - User-defined comparison indices
3. **Factor Attribution** - Fama-French multi-factor analysis
4. **Monte Carlo Simulations** - Probabilistic forecasting
5. **Correlation Matrix** - Asset correlation heatmaps
6. **Attribution Charts** - Visual decomposition
7. **Stress Testing** - Scenario analysis
8. **Information Ratio** - Risk-adjusted alpha
9. **Tracking Error** - Benchmark deviation measurement
10. **Real-time Updates** - WebSocket streaming metrics

## Dependencies
- `drizzle-orm` - Database queries
- `marketData` service - Historical price data
- Existing `portfolioSnapshots` infrastructure
- Existing `benchmarkPrices` and `benchmarkComparisons` tables

## Deployment Checklist
- [x] Service methods implemented
- [x] API routes created
- [x] Database schema verified
- [x] Error handling added
- [ ] Unit tests written
- [ ] Integration tests added
- [ ] API documentation updated
- [ ] Frontend integration points defined
- [ ] Performance benchmarking completed
- [ ] Monitoring/logging configured

## API Documentation
All endpoints include Swagger annotations for automatic API documentation generation.

## Migration Notes
- No database migrations required (uses existing tables)
- No breaking changes to existing endpoints
- Backward compatible with current analytics
- Can be deployed incrementally

## Success Metrics
Users now have complete visibility into:
✅ Which assets drive portfolio performance  
✅ Portfolio risk profile (volatility, max loss potential)  
✅ Performance vs major market benchmarks  
✅ Historical trends and momentum  
✅ Risk-adjusted returns (Sharpe, Sortino)  
✅ Market correlation (beta)  

## Related Issues
- Closes #694
- Enhances #653 (Portfolio Analytics)
- Complements existing asset tracking

## Files Modified
1. `backend/services/performanceAttributionService.js` - Extended with 500+ lines
2. `backend/routes/analytics.js` - Added 5 new endpoints

## Lines of Code
- Service additions: ~600 lines
- Route additions: ~100 lines
- **Total: ~700 lines of production code**

---

**Implementation Status**: ✅ **COMPLETE**

**Date**: March 3, 2026  
**Issue**: #694  
**Feature**: Portfolio Performance Attribution & Risk Analytics Engine
