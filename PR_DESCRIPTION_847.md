# PR Description: Subscription Expense Optimizer (#847)

## Problem Statement
Users often lose track of recurring subscriptions, leading to unnecessary spending and budget overruns. Manual review and generic advice do not provide personalized optimization or actionable alerts.

## Solution Overview
This PR introduces the Subscription Expense Optimizer, a backend service that scans transaction history for subscriptions, analyzes usage patterns, and recommends cancellations or downgrades. It projects annual savings and provides actionable alerts for upcoming renewals.

### Backend Service
- **File:** `backend/services/subscriptionExpenseOptimizerService.js`
- **Class:** `SubscriptionExpenseOptimizerService`
- **Features:**
  - Scans transaction history for recurring subscriptions
  - Analyzes usage patterns and frequency
  - Recommends cancellations, downgrades, or retention
  - Projects annual savings from optimization
  - Generates actionable alerts for upcoming renewals and high spending
  - Advanced analytics via `subscriptionOptimizerHelpers.js` (recurring payment detection, usage analysis, savings projection, renewal alerts)

### API Endpoint
- **File:** `backend/routes/subscriptions.js`
- **Endpoint:** `POST /api/subscriptions/optimize`
- **Request:**
  - User transaction data
  - Optional parameters: lookbackMonths, minAmount, usageThreshold
- **Response:**
  - Subscription analysis (usage, recommendation)
  - Projected savings
  - Alerts for renewals and optimization
  - Actionable recommendations
  - Overall summary

---

## Example Output Results

### Subscription Analysis
```json
[
  {
    "merchant": "Netflix",
    "amount": 15,
    "frequency": 12,
    "lastPayment": "2026-02-01",
    "usageScore": 0.2,
    "recommendation": "cancel"
  },
  {
    "merchant": "Spotify",
    "amount": 10,
    "frequency": 12,
    "lastPayment": "2026-02-10",
    "usageScore": 0.5,
    "recommendation": "downgrade"
  }
]
```

### Projected Savings
```json
{
  "cancelSavings": 180,
  "downgradeSavings": 60,
  "totalSavings": 240
}
```

### Alerts
```json
[
  {
    "type": "critical",
    "merchant": "Netflix",
    "message": "Subscription to Netflix is underused. Consider cancelling before next renewal on 2026-03-01."
  },
  {
    "type": "warning",
    "merchant": "Spotify",
    "message": "Subscription to Spotify is moderately used. Consider downgrading before next renewal on 2026-03-10."
  },
  {
    "type": "info",
    "message": "Projected annual savings from subscription optimization: $240"
  }
]
```

### Recommendations
```json
[
  "Cancel subscription to Netflix to save $180.00 per year.",
  "Downgrade subscription to Spotify to save up to $60.00 per year.",
  "Keep subscription to Adobe if usage remains high."
]
```

### Overall Summary
```json
{
  "totalSubscriptions": 3,
  "cancelCount": 1,
  "downgradeCount": 1,
  "keepCount": 1,
  "projectedSavings": 240
}
```

---

## Reviewer Notes
- No breaking changes
- Feature is modular and isolated to subscriptions module
- Supports both ad-hoc and DB-backed analysis
- Ready for frontend integration and user subscription management workflows
