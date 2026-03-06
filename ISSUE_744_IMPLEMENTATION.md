# Issue #744 - Smart Debt Consolidation Recommender

## Overview
Implemented a new debt consolidation recommendation engine that compares:
1. Keeping current debts
2. Multiple consolidation scenarios (personal loan, balance transfer, or custom)

The engine accounts for:
- Origination fees
- Balance transfer fees
- Promo APR windows and post-promo APR expiration
- Credit-risk assumptions (risk tier + late-payment probability)

## API Endpoint
- **Route:** `POST /api/debts/consolidation/recommend`
- **File:** `backend/routes/debts.js`
- **Service:** `backend/services/debtConsolidationRecommenderService.js`

## Request Body (high-level)
```json
{
  "monthlyBudget": 950,
  "horizonMonths": 84,
  "riskAssumptions": {
    "creditRiskTier": "medium",
    "latePaymentProbability": 0.12
  },
  "scenarios": [
    {
      "name": "Personal Loan 48m",
      "type": "personal_loan",
      "loanApr": 0.119,
      "termMonths": 48,
      "originationFeePct": 0.03
    },
    {
      "name": "Balance Transfer Promo",
      "type": "balance_transfer",
      "promoApr": 0,
      "promoMonths": 15,
      "postPromoApr": 0.199,
      "termMonths": 48,
      "transferFeePct": 0.04
    }
  ]
}
```

If `scenarios` is omitted, the service generates default comparison scenarios automatically.

## Response (high-level)
Returns:
- Baseline projection (keep current debts)
- Ranked scenario projections
- Raw savings and risk-adjusted savings
- Final recommendation (`consolidate` or `keep_current_debts`) with confidence and rationale

## Notes
- APR inputs support decimal format (e.g. `0.199`) and percentage-like inputs (e.g. `19.9`).
- The simulator uses monthly budget constraints and flags uncovered minimum-payment stress.
- Scenarios are ranked using savings, risk penalties, and payoff feasibility.
