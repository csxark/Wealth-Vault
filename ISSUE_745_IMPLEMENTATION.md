# Issue #745 - Debt Payoff What-If Simulator

## Overview
Implemented a new what-if simulator for debt payoff planning with support for:
- One-time lump sums
- Recurring extra payments
- Temporary payment pauses
- Payment increase schedules

The simulator compares each scenario against a baseline and returns:
- Per-scenario amortization timeline
- Interest delta vs baseline
- Months saved vs baseline
- Milestone timeline (debts closed by month)

## API Endpoint
- **Route:** `POST /api/debts/what-if/simulate`
- **Route file:** `backend/routes/debts.js`
- **Service:** `backend/services/debtWhatIfSimulatorService.js`

## Request Shape (high-level)
```json
{
  "monthlyBudget": 1200,
  "horizonMonths": 240,
  "scenarios": [
    {
      "name": "Aggressive Summer Plan",
      "oneTimeLumpSums": [
        { "month": 2, "amount": 2000, "debtId": "<optional-debt-id>" }
      ],
      "recurringExtraPayments": [
        { "startMonth": 1, "endMonth": 24, "amount": 150 },
        { "startMonth": 3, "endMonth": 18, "amount": 75, "debtId": "<optional-debt-id>" }
      ],
      "paymentPauses": [
        { "startMonth": 5, "endMonth": 6, "debtId": "<optional-debt-id>" }
      ],
      "paymentIncreaseSchedules": [
        { "startMonth": 4, "incrementAmount": 50, "frequencyMonths": 3 },
        { "startMonth": 6, "incrementAmount": 25, "frequencyMonths": 1, "debtId": "<optional-debt-id>" }
      ]
    }
  ]
}
```

## Response Highlights
- `baseline`: baseline simulation using current debts and budget assumptions
- `scenarios[]`:
  - `result.monthlyAmortization`
  - `result.milestoneTimeline`
  - `result.totalInterestPaid`
  - `result.monthsToPayoff`
  - `deltas.interestDeltaVsBaseline`
  - `deltas.monthsSaved`

## Calculation Notes
- Baseline and all scenarios run from the same initial debt state.
- Global extra funds are allocated using avalanche logic (highest APR first).
- Debt-targeted events (`debtId`) apply directly to that debt principal.
- Payment pauses suppress baseline minimum allocation for the paused debt during the pause window.
- Interest accrues monthly before payment allocation.

## Files Changed
- `backend/services/debtWhatIfSimulatorService.js` (new)
- `backend/routes/debts.js` (new endpoint + validation)
