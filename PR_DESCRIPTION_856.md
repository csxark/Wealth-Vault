# PR Description: Bill Payment Timeliness Analyzer (#856)

## Problem Statement
Users often miss bill payment deadlines, leading to late fees and credit score impact. Manual tracking and generic reminders do not provide personalized alerts or scheduling recommendations.

## Solution Overview
This PR introduces the Bill Payment Timeliness Analyzer, a backend service that tracks bill payment history, predicts upcoming due dates, and generates alerts for at-risk payments. It recommends payment scheduling strategies and visualizes timeliness trends for improved financial health.

### Backend Service
- **File:** `backend/services/billPaymentTimelinessAnalyzerService.js`
- **Class:** `BillPaymentTimelinessAnalyzerService`
- **Features:**
  - Analyzes bill payment history for timeliness and late fees
  - Predicts upcoming due dates and generates alerts
  - Flags at-risk and late payments
  - Recommends payment scheduling strategies
  - Visualizes timeliness trends and payment performance
  - Advanced analytics for late fee risk and scheduling optimization

### API Endpoint
- **File:** `backend/routes/bills.js`
- **Endpoint:** `POST /api/bills/timeliness/analyze`
- **Request:**
  - User bill and payment data
  - Optional parameters: lookbackMonths, lateFeeThreshold
- **Response:**
  - Payment analysis (on-time, late, fees)
  - Upcoming due alerts
  - Late payment alerts
  - Scheduling recommendations
  - Timeliness trends
  - Overall summary

---

## Example Output Results

### Payment Analysis
```json
[
  {
    "billId": "util1",
    "name": "Electricity",
    "dueDate": "2026-03-10",
    "amount": 120,
    "onTimeCount": 10,
    "lateCount": 2,
    "lateFee": 20,
    "lastPayment": "2026-03-09"
  }
]
```

### Upcoming Due Alerts
```json
[
  {
    "billId": "util1",
    "name": "Electricity",
    "nextDue": "2026-04-10",
    "message": "Upcoming due date for Electricity: 2026-04-10"
  }
]
```

### Late Payment Alerts
```json
[
  {
    "billId": "util1",
    "name": "Electricity",
    "lateCount": 2,
    "lateFee": 20,
    "message": "Late payment detected for Electricity. Total late fees: $20"
  },
  {
    "billId": "util1",
    "name": "Electricity",
    "message": "High risk of late payment for Electricity. Consider rescheduling payments."
  }
]
```

### Scheduling Recommendations
```json
[
  "Set up automatic payments for Electricity to avoid late fees.",
  "Maintain current payment schedule for Rent."
]
```

### Timeliness Trends
```json
[
  {
    "billId": "util1",
    "name": "Electricity",
    "onTimeRate": 0.83,
    "trend": "good"
  }
]
```

### Overall Summary
```json
{
  "totalBills": 2,
  "latePayments": 1,
  "highRiskBills": 2,
  "recommendations": [ ... ]
}
```

---

## Reviewer Notes
- No breaking changes
- Feature is modular and isolated to bills module
- Supports both ad-hoc and DB-backed analysis
- Ready for frontend integration and user bill management workflows
