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
  - **Sample Results:**
    - `volatilitySummary`: `{ mean: 3200, stddev: 800, min: 1800, max: 4200, volatilityIndex: 0.25 }`
    - `stressScenarios`: `[{ month: 1, income: 2000, paymentDue: 2200, missedPayment: true }, ...]`
    - `riskProjections`: `{ missedPayments: 4, defaultRisk: 0.33, creditImpact: -80 }`
    - `recommendations`: `[{ recommendedFund3: 6600, recommendedFund6: 13200, smoothing: 'Autopay recommended' }, ...]`
    - `alerts`: `[{ month: 1, message: 'High risk: income $2000 insufficient for payment $2200' }, ...]`
    - `advancedAnalytics`: `{ clustering: ['low', 'medium', ...], risk: { riskScore: 0.45, lowPeriods: 5 }, ... }`
    - `scenarioResults`: `{ multiYearScenarios: [...], mitigationResults: [...], forecasts: {...}, recommendations: [...] }`

## Reviewer Notes
- No breaking changes
- Modular, extensible code structure
- Advanced analytics and scenario simulation for robust risk management
- Ready for frontend integration and further business logic

---
