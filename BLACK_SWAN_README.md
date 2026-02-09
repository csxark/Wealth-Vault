# Black Swan Liquidity Stress-Tester & AI-Driven Cash-Flow Runway

## 🎯 Overview

The **Black Swan Liquidity Stress-Tester** is a predictive engine that goes beyond simple budgeting. It simulates crisis scenarios (Job Loss, Market Crash, Medical Emergency, etc.) to calculate the exact day a user runs out of cash, triggering automated "Liquidity Rescue" transfers between wallets.

## ✨ Features

### 1. **Stress Testing** 🧪
- Simulate Black Swan events (job loss, market crash, medical emergency, recession)
- Calculate exact runway (days until cash depletion)
- Generate AI-driven survival recommendations
- Multiple severity levels: mild, moderate, severe, catastrophic

### 2. **Cash Flow Runway** 📊
- Real-time runway calculation
- Daily cash flow projections
- Zero-balance date prediction
- Critical threshold alerts (20% balance)

### 3. **Automated Liquidity Rescues** 🚨
- Automatic emergency transfers between wallets
- Configurable thresholds and cooldowns
- Multi-wallet liquidity management
- Rescue history tracking

### 4. **AI-Driven Forecasting** 🤖
- Machine learning-based cash flow predictions
- Confidence scoring
- Seasonal factor analysis
- Trend detection

## 📁 File Structure

```
backend/
├── db/
│   └── schema.js                    # Added: stressScenarios, runwayCalculations, liquidityRescues, cashFlowProjections
├── services/
│   ├── stressTester.js              # NEW: Black Swan scenario simulation
│   ├── runwayEngine.js              # NEW: Cash flow runway calculations
│   └── liquidityService.js          # NEW: Automated liquidity management
├── routes/
│   ├── liquidity.js                 # NEW: Liquidity monitoring endpoints
│   └── runway.js                    # NEW: Stress testing endpoints
├── middleware/
│   └── liquidityGuard.js            # NEW: Validation middleware
├── jobs/
│   └── liquidityMaintenanceJob.js   # NEW: Background monitoring (every 6 hours)
└── server.js                        # UPDATED: Registered routes and jobs
```

## 🗄️ Database Schema

### `stress_scenarios`
Stores stress test configurations.

```javascript
{
  id: UUID,
  userId: UUID,
  name: String,
  scenarioType: String,  // job_loss, market_crash, medical_emergency, recession, catastrophic
  severity: String,      // mild, moderate, severe, catastrophic
  parameters: JSONB,     // { incomeReduction: 100, marketDrop: 40, duration: 6 }
  status: String,        // pending, running, completed, failed
  createdAt: Timestamp,
  completedAt: Timestamp
}
```

### `runway_calculations`
Stores cash flow runway projections.

```javascript
{
  id: UUID,
  scenarioId: UUID,
  userId: UUID,
  currentBalance: Numeric,
  monthlyBurnRate: Numeric,
  runwayDays: Integer,              // Days until cash runs out
  zeroBalanceDate: Timestamp,       // Exact depletion date
  criticalThresholdDate: Timestamp, // 20% balance date
  dailyProjections: JSONB,          // [{ date, balance, income, expenses }]
  recommendations: JSONB,           // AI-generated strategies
  createdAt: Timestamp
}
```

### `liquidity_rescues`
Tracks automated emergency transfers.

```javascript
{
  id: UUID,
  userId: UUID,
  scenarioId: UUID,
  triggerDate: Timestamp,
  triggerReason: String,      // balance_critical, runway_depleted, threshold_breach
  sourceWalletId: UUID,
  targetWalletId: UUID,
  transferAmount: Numeric,
  status: String,             // pending, executed, failed, cancelled
  executedAt: Timestamp,
  metadata: JSONB,
  createdAt: Timestamp
}
```

### `cash_flow_projections`
AI-driven income/expense forecasts.

```javascript
{
  id: UUID,
  userId: UUID,
  projectionDate: Timestamp,
  projectedIncome: Numeric,
  projectedExpenses: Numeric,
  projectedBalance: Numeric,
  confidence: Double,         // AI confidence score (0-1)
  modelType: String,          // arima, lstm, prophet
  seasonalFactors: JSONB,
  createdAt: Timestamp
}
```

## 🔌 API Endpoints

### Liquidity Management

#### Get Liquidity Health
```http
GET /api/liquidity/health
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "score": 75,
    "status": "good",
    "runwayDays": 150,
    "monthlyBurnRate": 500,
    "zeroBalanceDate": "2025-07-15",
    "recommendations": [...]
  }
}
```

#### Get Current Runway
```http
GET /api/liquidity/runway
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "currentBalance": 15000,
    "monthlyIncome": 5000,
    "monthlyExpenses": 4500,
    "monthlyBurnRate": -500,
    "runwayDays": 150,
    "zeroBalanceDate": "2025-07-15",
    "criticalThresholdDate": "2025-05-01",
    "dailyProjections": [...]
  }
}
```

#### Monitor Liquidity (Trigger Rescue)
```http
POST /api/liquidity/monitor
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "status": "rescue_executed",
    "rescue": {
      "id": "...",
      "transferAmount": "2000",
      "sourceWalletId": "...",
      "targetWalletId": "..."
    },
    "runway": {...}
  }
}
```

#### Get Rescue History
```http
GET /api/liquidity/rescues?limit=10
Authorization: Bearer <token>
```

#### Generate Cash Flow Forecast
```http
POST /api/liquidity/forecast
Authorization: Bearer <token>
Content-Type: application/json

{
  "daysAhead": 90
}
```

#### Simulate Scenario Impact
```http
POST /api/liquidity/simulate-impact
Authorization: Bearer <token>
Content-Type: application/json

{
  "incomeReduction": 50,
  "expenseIncrease": 20
}

Response:
{
  "success": true,
  "data": {
    "originalRunwayDays": 150,
    "newRunwayDays": 45,
    "impact": 105,
    "impactPercent": 70,
    "newZeroBalanceDate": "2025-03-15"
  }
}
```

#### Configure Rescue Rules
```http
PUT /api/liquidity/rescue-rules
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": true,
  "minTransferAmount": 100,
  "maxTransferAmount": 10000,
  "cooldownHours": 24
}
```

### Stress Testing

#### Get Scenario Templates
```http
GET /api/runway/templates
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "type": "job_loss",
      "name": "Job Loss",
      "description": "Complete loss of primary income",
      "defaultParameters": {
        "incomeReduction": 100,
        "duration": 6,
        "severanceMonths": 0,
        "unemploymentBenefit": 0
      }
    },
    ...
  ]
}
```

#### Create Stress Scenario
```http
POST /api/runway/scenarios
Authorization: Bearer <token>
Content-Type: application/json

{
  "scenarioType": "job_loss",
  "customParameters": {
    "incomeReduction": 100,
    "duration": 6,
    "severanceMonths": 2,
    "unemploymentBenefit": 1500
  }
}
```

#### Run Stress Test
```http
POST /api/runway/scenarios/:id/run
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "scenario": {...},
    "runway": {
      "runwayDays": 45,
      "zeroBalanceDate": "2025-03-20",
      "recommendations": [
        {
          "priority": "critical",
          "category": "immediate_action",
          "title": "Critical Cash Flow Alert",
          "description": "You have only 45 days of runway",
          "actions": [
            "Cut all non-essential expenses immediately",
            "Negotiate payment plans with creditors",
            "Explore emergency income sources"
          ]
        }
      ]
    },
    "severity": "severe"
  }
}
```

#### Quick Stress Test
```http
POST /api/runway/quick-test
Authorization: Bearer <token>
Content-Type: application/json

{
  "scenarioType": "market_crash",
  "customParameters": {
    "marketDrop": 40,
    "recoveryMonths": 24
  }
}
```

## 🎮 Usage Examples

### Example 1: Check Liquidity Health

```javascript
const health = await fetch('/api/liquidity/health', {
  headers: { 'Authorization': 'Bearer <token>' }
});

console.log(health.data);
// {
//   score: 75,
//   status: "good",
//   runwayDays: 150,
//   recommendations: [...]
// }
```

### Example 2: Run Job Loss Stress Test

```javascript
// Create scenario
const scenario = await fetch('/api/runway/scenarios', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    scenarioType: 'job_loss',
    customParameters: {
      incomeReduction: 100,
      duration: 6,
      severanceMonths: 3,
      unemploymentBenefit: 2000
    }
  })
});

// Run stress test
const results = await fetch(`/api/runway/scenarios/${scenario.id}/run`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' }
});

console.log(results.data.runway);
// {
//   runwayDays: 120,
//   zeroBalanceDate: "2025-06-15",
//   recommendations: [...]
// }
```

### Example 3: Simulate Income Reduction Impact

```javascript
const impact = await fetch('/api/liquidity/simulate-impact', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    incomeReduction: 30,
    expenseIncrease: 10
  })
});

console.log(impact.data);
// {
//   originalRunwayDays: 150,
//   newRunwayDays: 75,
//   impact: 75,
//   impactPercent: 50
// }
```

## 🧪 Stress Test Scenarios

### 1. Job Loss
```javascript
{
  scenarioType: "job_loss",
  parameters: {
    incomeReduction: 100,      // 100% income loss
    duration: 6,               // 6 months
    severanceMonths: 2,        // 2 months severance
    unemploymentBenefit: 1500  // $1500/month unemployment
  }
}
```

### 2. Market Crash
```javascript
{
  scenarioType: "market_crash",
  parameters: {
    marketDrop: 40,           // 40% portfolio drop
    recoveryMonths: 24,       // 2 years recovery
    incomeReduction: 0,
    expenseIncrease: 0
  }
}
```

### 3. Medical Emergency
```javascript
{
  scenarioType: "medical_emergency",
  parameters: {
    emergencyCost: 50000,     // $50k emergency cost
    incomeReduction: 30,      // 30% income loss
    duration: 3,              // 3 months
    insuranceCoverage: 80     // 80% covered
  }
}
```

### 4. Economic Recession
```javascript
{
  scenarioType: "recession",
  parameters: {
    incomeReduction: 25,      // 25% income loss
    expenseIncrease: 15,      // 15% inflation
    marketDrop: 20,           // 20% market drop
    duration: 18              // 18 months
  }
}
```

### 5. Catastrophic Event
```javascript
{
  scenarioType: "catastrophic",
  parameters: {
    incomeReduction: 100,
    marketDrop: 50,
    emergencyCost: 100000,
    duration: 12
  }
}
```

## 🤖 AI Recommendations

The system generates context-aware recommendations based on runway status:

### Critical (< 30 days)
- Cut all non-essential expenses immediately
- Negotiate payment plans with creditors
- Explore emergency income sources
- Consider liquidating non-essential assets

### Warning (30-90 days)
- Reduce monthly expenses by target amount
- Review and cancel unused subscriptions
- Explore part-time income opportunities
- Build emergency fund

### Caution (90-180 days)
- Continue building emergency fund
- Diversify income sources
- Review debt management strategy

## 🔒 Automated Liquidity Rescues

### Trigger Conditions
- **Critical**: Balance < 10% OR Runway < 30 days
- **Warning**: Balance < 20% OR Runway < 60 days
- **Caution**: Balance < 30% OR Runway < 90 days

### Rescue Process
1. Monitor liquidity every 6 hours (background job)
2. Detect critical threshold breach
3. Find source wallet with available funds
4. Calculate optimal transfer amount
5. Execute automated transfer
6. Notify user
7. Apply 24-hour cooldown

### Configuration
```javascript
{
  enabled: true,
  minTransferAmount: 100,
  maxTransferAmount: 10000,
  cooldownHours: 24
}
```

## 📊 Liquidity Health Score

Score calculation (0-100):
- **90-100**: Excellent (6+ months runway)
- **80-89**: Good (4-6 months runway)
- **60-79**: Fair (2-4 months runway)
- **40-59**: Poor (1-2 months runway)
- **0-39**: Critical (< 1 month runway)

## 🔄 Background Jobs

### Liquidity Maintenance Job
- **Frequency**: Every 6 hours
- **Function**: Monitor all users' liquidity
- **Actions**: Trigger automated rescues when needed
- **Logging**: Tracks checks, rescues, and errors

## 🚀 Performance Optimizations

1. **Batch Processing**: Users processed in batches of 10
2. **Cooldown System**: Prevents rescue spam (24-hour default)
3. **Indexed Queries**: Optimized database queries
4. **Async Processing**: Non-blocking background jobs

## 🛠️ Future Enhancements

- [ ] Machine learning models for better forecasting (LSTM, Prophet)
- [ ] Multi-currency liquidity management
- [ ] Integration with external banking APIs
- [ ] Real-time WebSocket alerts
- [ ] Mobile push notifications
- [ ] Customizable rescue strategies
- [ ] Portfolio rebalancing recommendations

## 📝 Notes

- Runway calculations assume constant burn rate
- AI recommendations are guidance, not financial advice
- Automated rescues require sufficient wallet balances
- Background job runs every 6 hours by default

---

**Built for Issue #272** | **Black Swan Liquidity Stress-Tester**
