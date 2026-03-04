# PR Description: Investment Fee Optimization Engine (#870)

## Problem Statement
Users pay excessive fees on investment accounts, reducing long-term returns. Manual tracking and generic reminders do not provide personalized fee analysis or actionable recommendations.

## Solution Overview
This PR introduces the Investment Fee Optimization Engine, a backend service that audits investment account fees, simulates long-term impact, and generates alerts for high-fee accounts. It recommends lower-fee alternatives and visualizes fee trends for improved investment outcomes.

### Backend Service
- **File:** `backend/services/investmentFeeOptimizationEngineService.js`
- **Class:** `InvestmentFeeOptimizationEngineService`
- **Features:**
  - Audits investment account fees and transactions
  - Simulates long-term impact of fees on returns
  - Generates alerts for high-fee accounts
  - Recommends lower-fee alternatives
  - Visualizes fee trends and account performance
  - Advanced analytics for fee impact and optimization

### Analytics Service
- **File:** `backend/services/investmentFeeAnalyticsService.js`
- **Class:** `InvestmentFeeAnalyticsService`
- **Features:**
  - Fee trend analysis
  - Impact simulation
  - Risk scoring
  - Forecasting
  - Alternative provider suggestions

### API Endpoints
- **File:** `backend/routes/investments.js`
- **Endpoint:** `POST /api/investments/fee/optimize`
  - **Request:** user investment account data, optional feeThreshold, simulationYears
  - **Response:** fee analysis, alerts, recommendations, trends, summary
- **File:** `backend/routes/investmentFeeAnalytics.js`
- **Endpoint:** `POST /api/investments/fee/analytics`
  - **Request:** user investment account data, simulationYears
  - **Response:** fee trends, impact simulations, risk scores, forecasts, alternative providers

### Model
- **File:** `backend/models/investmentAccount.js`
- **Schema:** UserId, accountName, feeRate, balance, provider, feeHistory, transactions

### Utilities
- **File:** `backend/utils/investmentFeeUtils.js`
- **Functions:** Fee simulation, impact calculation, alternative finder, trend calculation

### Tests
- **Files:**
  - `backend/tests/investmentFeeOptimizationEngineService.test.js`
  - `backend/tests/investmentFeeAnalyticsService.test.js`
- **Coverage:** Fee analysis, simulation, alerts, recommendations, analytics

---

## Example Output Results

### Fee Analysis
```json
[
  {
    "accountId": "inv1",
    "accountName": "Retirement Fund",
    "feeRate": 1.2,
    "balance": 50000,
    "projectedImpact": 8000,
    "highFee": true
  }
]
```

### High-Fee Account Alerts
```json
[
  {
    "accountId": "inv1",
    "message": "High fee detected for Retirement Fund. Consider switching to a lower-fee provider."
  }
]
```

### Recommendations
```json
[
  "Switch Retirement Fund to ProviderX for a 0.5% fee rate.",
  "Review index fund options for lower fees."
]
```

### Fee Trends
```json
[
  {
    "accountId": "inv1",
    "feeHistory": [1.2, 1.1, 1.0],
    "trend": "declining"
  }
]
```

### Overall Summary
```json
{
  "totalAccounts": 2,
  "highFeeAccounts": 1,
  "recommendations": [ ... ]
}
```

---

## Reviewer Notes
- No breaking changes
- Feature is modular and isolated to investments module
- Supports both ad-hoc and DB-backed analysis
- Ready for frontend integration and user investment management workflows
- Includes advanced analytics for fee impact and optimization
