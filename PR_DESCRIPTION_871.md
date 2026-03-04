# PR Description: Tax Filing Deadline Alert System (#871)

## Problem Statement
Users miss tax filing deadlines, incurring penalties and interest. Manual tracking and generic reminders do not provide personalized deadline analysis or actionable recommendations.

## Solution Overview
This PR introduces the Tax Filing Deadline Alert System, a backend service that tracks tax deadlines, predicts risk of late filing, and generates personalized alerts. It recommends filing strategies and visualizes filing history trends for improved compliance and financial health.

### Backend Service
- **File:** `backend/services/taxFilingDeadlineAlertService.js`
- **Class:** `TaxFilingDeadlineAlertService`
- **Features:**
  - Tracks user tax deadlines and filing history
  - Predicts risk of late filing and penalties
  - Generates personalized alerts for upcoming and missed deadlines
  - Recommends filing strategies and reminders
  - Visualizes filing history and compliance trends
  - Advanced analytics for risk scoring and optimization

### Analytics Service
- **File:** `backend/services/taxFilingAnalyticsService.js`
- **Class:** `TaxFilingAnalyticsService`
- **Features:**
  - Filing trend analysis
  - Risk simulation
  - Compliance scoring
  - Forecasting
  - Strategy suggestions

### API Endpoints
- **File:** `backend/routes/tax.js`
- **Endpoint:** `POST /api/tax/deadline/alert`
  - **Request:** user tax data, deadlines, filing history, optional riskThreshold, lookbackYears
  - **Response:** deadline analysis, alerts, recommendations, trends, summary

### Model
- **File:** `backend/models/taxFiling.js`
- **Schema:** UserId, taxYear, deadline, filedDate, status, penalties, filingHistory

### Utilities
- **File:** `backend/utils/taxFilingUtils.js`
- **Functions:** Deadline calculation, risk scoring, strategy generator

### Tests
- **Files:**
  - `backend/tests/taxFilingDeadlineAlertService.test.js`
  - `backend/tests/taxFilingAnalyticsService.test.js`
- **Coverage:** Deadline analysis, risk prediction, alerts, recommendations, analytics

---

## Example Output Results

### Deadline Analysis
```json
[
  {
    "taxYear": 2025,
    "deadline": "2026-04-15",
    "filedDate": null,
    "status": "pending",
    "riskLevel": "high"
  }
]
```

### Alerts
```json
[
  {
    "taxYear": 2025,
    "message": "Tax filing deadline approaching: 2026-04-15. High risk of late filing."
  }
]
```

### Recommendations
```json
[
  "File taxes by March 31 to avoid last-minute issues.",
  "Set up calendar reminders for future deadlines."
]
```

### Filing History Trends
```json
[
  {
    "taxYear": 2024,
    "filedDate": "2025-04-10",
    "status": "on-time",
    "penalties": 0,
    "trend": "compliant"
  }
]
```

### Overall Summary
```json
{
  "totalYears": 5,
  "lateFilings": 1,
  "highRiskYears": 2,
  "recommendations": [ ... ]
}
```

---

## Reviewer Notes
- No breaking changes
- Feature is modular and isolated to tax module
- Supports both ad-hoc and DB-backed analysis
- Ready for frontend integration and user tax management workflows
- Includes advanced analytics for risk scoring and compliance trends
