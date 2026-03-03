# PR Description: Income Volatility Risk Forecaster (#831)

## Problem Statement
Borrowers with variable income, such as gig workers and freelancers, face unpredictable payment risks and may default during low-income months. Traditional financial tools do not provide adequate forecasting or actionable guidance for managing income volatility and payment obligations.

## Solution Overview
This PR introduces the `incomeVolatilityRiskForecasterService` and advanced scenario simulation, providing a robust solution for income volatility analysis and risk management:

### Backend Service
- **File:** `backend/services/incomeVolatilityRiskForecasterService.js`
- **Class:** `IncomeVolatilityRiskForecasterService`
- **Features:**
  - Models income volatility using historical data (mean, stddev, volatility index)
  - Simulates stress scenarios (income drops, missed payments)
  - Projects risk of default and credit impact
  - Recommends emergency fund targets and payment smoothing strategies
  - Generates alerts for high-risk periods
  - Advanced analytics:
    - Clusters income periods by volatility (low, medium, high)
    - Scores volatility risk based on income and payment coverage
    - Simulates income smoothing using reserve funds
    - Forecasts emergency fund depletion
    - Generates comprehensive volatility risk reports

### Advanced Scenario Simulation
- **File:** `backend/services/incomeVolatilityScenarioSimulator.js`
- **Class:** `IncomeVolatilityScenarioSimulator`
- **Features:**
  - Multi-year income volatility simulation
  - Mitigation strategy effectiveness (reserve, insurance, gig diversification)
  - Forecasts for payment risk and emergency fund depletion
  - Recommendations for income smoothing and risk reduction

### API Endpoint
- **File:** `backend/routes/debts.js`
- **Endpoint:** `POST /api/debts/income-volatility/forecast`
- **Request:**
  - Expects user income history, debts, and optional mitigation parameters
- **Response:**
  - Volatility summary
  - Stress scenarios
  - Risk projections
  - Recommendations
  - Alerts
  - Advanced analytics and scenario results

---

## Example Output Results

### Volatility Summary
```
{
  "mean": 3200,
  "stddev": 800,
  "min": 1800,
  "max": 4200,
  "volatilityIndex": 0.25
}
```

### Stress Scenarios
```
[
  { "month": 1, "income": 2000, "paymentDue": 2200, "missedPayment": true },
  { "month": 2, "income": 3500, "paymentDue": 2200, "missedPayment": false },
  ...
]
```

### Risk Projections
```
{
  "missedPayments": 4,
  "defaultRisk": 0.33,
  "creditImpact": -80
}
```

### Recommendations
```
[
  {
    "recommendedFund3": 6600,
    "recommendedFund6": 13200,
    "minIncome": 1800,
    "paymentDue": 2200
  },
  {
    "meanIncome": 3200,
    "paymentDue": 2200,
    "smoothing": "Autopay recommended"
  }
]
```

### Alerts
```
[
  { "month": 1, "message": "High risk: income $2000 insufficient for payment $2200" },
  { "month": 5, "message": "High risk: income $1800 insufficient for payment $2200" },
  ...
]
```

### Advanced Analytics
```
{
  "clustering": ["low", "medium", "high", ...],
  "risk": { "riskScore": 0.45, "lowPeriods": 5, "clusters": ["low", "medium", ...] },
  "smoothing": [ { "month": 1, "income": 2000, "covered": true, "fundRemaining": 5000 }, ... ],
  "emergencyDepletion": { "monthsUntilDepletion": 8, "fundRemaining": 0 }
}
```

### Scenario Results
```
{
  "multiYearScenarios": [ { "month": 1, "year": 1, "income": 2100, "paymentDue": 2200, "missedPayment": true }, ... ],
  "mitigationResults": [ { "month": 1, "income": 2100, "paymentDue": 2200, "reserveFund": 5000, "insuranceCoverage": 2000, "gigs": 2, "missedPayment": false }, ... ],
  "forecasts": { "missedPayments": 3, "fundDepletionMonth": 7, "insuranceDepletionMonth": 10 },
  "recommendations": [ "Increase reserve fund to avoid depletion.", "Diversify gig income sources for stability." ]
}
```

---

## Reviewer Notes
- No breaking changes
- Modular, extensible code structure
- Advanced analytics and scenario simulation for robust risk management
- Ready for frontend integration and further business logic
