# Wealth Time-Machine: Historical Performance Backtester & Portfolio Replay

## 🎯 Overview

The **Wealth Time-Machine** feature allows users to "replay" their financial history and simulate "What-If" scenarios using historical market data. Users can reconstruct past account states and analyze alternative financial decisions.

## ✨ Features

### 1. **Time Travel** 🕰️
- Reconstruct account state at any point in the past
- View historical balances, expenses, investments, and debts
- Audit trail with snapshot-based reconstruction

### 2. **What-If Scenarios** 💭
- **Investment Simulation**: "What if I invested $1000 in BTC 2 years ago?"
- **Expense Reduction**: "What if I reduced dining expenses by 30%?"
- **Debt Payoff**: "What if I made extra $500/month payments?"
- **Income Increase**: "What if I got a $10k raise last year?"

### 3. **Backtest Engine** 📊
- Historical market data integration (CoinGecko, Yahoo Finance)
- Performance metrics calculation (Sharpe Ratio, Max Drawdown, Volatility)
- Timeline comparison (Actual vs Simulated)
- Multi-scenario comparison

### 4. **State Reconstruction** 🔄
- Snapshot-based state management
- Delta-based incremental reconstruction
- Integrity verification with checksums
- Optimized for performance

## 📁 File Structure

```
backend/
├── db/
│   └── schema.js                    # Added: replayScenarios, backtestResults, historicalMarketData
├── services/
│   ├── stateReconstructor.js        # NEW: Rebuilds historical account states
│   ├── backtestService.js           # NEW: Runs what-if simulations
│   └── replayEngine.js              # UPDATED: Orchestrates time-travel operations
├── routes/
│   ├── replay.js                    # NEW: Scenario management endpoints
│   └── backtest.js                  # NEW: Backtest execution endpoints
├── middleware/
│   └── historyValidator.js          # NEW: Validates time-travel requests
└── server.js                        # UPDATED: Registered new routes
```

## 🗄️ Database Schema

### `replay_scenarios`
Stores user-created what-if scenarios.

```javascript
{
  id: UUID,
  userId: UUID,
  name: String,
  description: String,
  startDate: Timestamp,
  endDate: Timestamp,
  baselineSnapshotId: UUID,
  whatIfChanges: JSONB,  // Array of changes to simulate
  status: String,        // pending, running, completed, failed
  createdAt: Timestamp,
  completedAt: Timestamp
}
```

### `backtest_results`
Stores results from executed scenarios.

```javascript
{
  id: UUID,
  scenarioId: UUID,
  userId: UUID,
  actualNetWorth: Numeric,
  simulatedNetWorth: Numeric,
  difference: Numeric,
  differencePercent: Double,
  timelineData: JSONB,           // Daily snapshots
  performanceMetrics: JSONB,     // Sharpe, drawdown, volatility
  createdAt: Timestamp
}
```

### `historical_market_data`
Caches historical price data for assets.

```javascript
{
  id: UUID,
  symbol: String,           // BTC, ETH, AAPL, etc.
  assetType: String,        // crypto, stock, commodity, fx
  date: Timestamp,
  open: Numeric,
  high: Numeric,
  low: Numeric,
  close: Numeric,
  volume: Numeric,
  source: String,           // coingecko, yahoo, alpha_vantage
  metadata: JSONB,
  createdAt: Timestamp
}
```

## 🔌 API Endpoints

### Scenario Management

#### Create Scenario
```http
POST /api/replay/scenarios
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Bitcoin Investment 2022",
  "description": "What if I invested rent money in BTC?",
  "startDate": "2022-01-01",
  "endDate": "2024-01-01",
  "whatIfChanges": [
    {
      "type": "investment",
      "asset": "BTC",
      "amount": 1000,
      "date": "2022-01-01"
    }
  ]
}
```

#### Execute Scenario
```http
POST /api/replay/scenarios/:id/execute
Authorization: Bearer <token>
```

#### Get Scenario Results
```http
GET /api/replay/scenarios/:id
Authorization: Bearer <token>
```

#### List All Scenarios
```http
GET /api/replay/scenarios
Authorization: Bearer <token>
```

#### Delete Scenario
```http
DELETE /api/replay/scenarios/:id
Authorization: Bearer <token>
```

### Time Travel

#### Travel to Specific Date
```http
POST /api/replay/time-travel
Authorization: Bearer <token>
Content-Type: application/json

{
  "targetDate": "2023-06-15"
}
```

### Quick Analysis

#### Run Quick What-If (No Save)
```http
POST /api/replay/quick-what-if
Authorization: Bearer <token>
Content-Type: application/json

{
  "startDate": "2023-01-01",
  "endDate": "2023-12-31",
  "whatIfChanges": [
    {
      "type": "expense_reduction",
      "category": "<category-id>",
      "reductionPercent": 25
    }
  ]
}
```

### Comparison

#### Compare Multiple Scenarios
```http
POST /api/replay/compare
Authorization: Bearer <token>
Content-Type: application/json

{
  "scenarioIds": [
    "scenario-uuid-1",
    "scenario-uuid-2",
    "scenario-uuid-3"
  ]
}
```

### Backtest Operations

#### Get Historical Prices
```http
GET /api/backtest/historical-prices/BTC?startDate=2022-01-01&endDate=2024-01-01
Authorization: Bearer <token>
```

#### Get Performance Metrics
```http
GET /api/backtest/performance-metrics/:scenarioId
Authorization: Bearer <token>
```

#### Cache Historical Prices
```http
POST /api/backtest/cache-prices
Authorization: Bearer <token>
Content-Type: application/json

{
  "symbol": "ETH",
  "startDate": "2020-01-01",
  "endDate": "2024-01-01"
}
```

## 🎮 Usage Examples

### Example 1: Bitcoin Investment Simulation

```javascript
// Create scenario
const scenario = await fetch('/api/replay/scenarios', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: "BTC Investment 2020",
    startDate: "2020-01-01",
    endDate: "2024-01-01",
    whatIfChanges: [{
      type: "investment",
      asset: "BTC",
      amount: 5000,
      date: "2020-01-01"
    }]
  })
});

// Execute scenario
const execution = await fetch(`/api/replay/scenarios/${scenario.id}/execute`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});

// View results
const results = await fetch(`/api/replay/scenarios/${scenario.id}`, {
  headers: { 'Authorization': 'Bearer <token>' }
});

console.log(results.data.results);
// {
//   actualNetWorth: 50000,
//   simulatedNetWorth: 125000,
//   difference: 75000,
//   differencePercent: 150,
//   performanceMetrics: {
//     sharpeRatio: "2.45",
//     maxDrawdown: "35.20",
//     volatility: "78.50"
//   }
// }
```

### Example 2: Expense Reduction Analysis

```javascript
const quickAnalysis = await fetch('/api/replay/quick-what-if', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    startDate: "2023-01-01",
    endDate: "2023-12-31",
    whatIfChanges: [{
      type: "expense_reduction",
      category: "dining-category-id",
      reductionPercent: 30
    }]
  })
});

console.log(quickAnalysis.data);
// Shows how much you would have saved
```

### Example 3: Time Travel to Past Date

```javascript
const pastState = await fetch('/api/replay/time-travel', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    targetDate: "2022-06-15"
  })
});

console.log(pastState.data.state);
// {
//   expenses: [...],
//   goals: [...],
//   investments: [...],
//   debts: [...]
// }
```

## 🧪 What-If Change Types

### 1. Investment
```javascript
{
  type: "investment",
  asset: "BTC",      // Symbol (BTC, ETH, AAPL, etc.)
  amount: 1000,      // Investment amount
  date: "2022-01-01" // Purchase date
}
```

### 2. Expense Reduction
```javascript
{
  type: "expense_reduction",
  category: "<category-id>",
  reductionPercent: 25  // Reduce by 25%
}
```

### 3. Debt Payoff
```javascript
{
  type: "debt_payoff",
  debtId: "<debt-id>",
  extraPayment: 500  // Extra $500/month
}
```

### 4. Income Increase
```javascript
{
  type: "income_increase",
  increaseAmount: 1000,  // Extra $1000/month
  startDate: "2023-01-01",
  endDate: "2023-12-31"
}
```

## 📊 Performance Metrics

### Sharpe Ratio
Measures risk-adjusted returns. Higher is better.
- **< 1**: Poor
- **1-2**: Good
- **> 2**: Excellent

### Max Drawdown
Maximum peak-to-trough decline. Lower is better.
- Expressed as percentage
- Indicates worst-case scenario

### Volatility
Standard deviation of returns. Lower is more stable.
- Annualized percentage
- Higher = more risk

## 🔒 Security & Validation

- **Date Range Limits**: Max 5 years for scenarios, 1 year for quick analysis
- **Time Travel Limit**: Max 10 years in the past
- **Input Validation**: All dates, amounts, and symbols validated
- **Authorization**: User can only access their own scenarios
- **Rate Limiting**: Applied to all endpoints

## 🚀 Performance Optimizations

1. **Snapshot-Based Reconstruction**: Uses closest snapshot + deltas
2. **Cached Market Data**: Historical prices cached in database
3. **Async Processing**: Long-running backtests run asynchronously
4. **Indexed Queries**: Optimized database indexes on symbol + date

## 🛠️ Future Enhancements

- [ ] Real-time progress tracking for long backtests
- [ ] Export results to PDF/CSV
- [ ] Machine learning for scenario suggestions
- [ ] Integration with more data sources (Alpha Vantage, IEX Cloud)
- [ ] Portfolio optimization recommendations
- [ ] Monte Carlo simulations

## 📝 Notes

- Historical market data is fetched from external APIs and cached
- Backtest accuracy depends on data availability
- Performance metrics are calculated using standard financial formulas
- Scenarios are user-specific and private

---

**Built for Issue #273** | **Wealth Vault Time-Machine Feature**
