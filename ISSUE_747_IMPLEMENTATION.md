# Issue #747 Implementation - Behavioral Adherence Risk Scoring for Debt Plans

## Overview
Implemented a behavioral adherence risk scoring system that evaluates user's likelihood of sticking to debt payoff plans based on historical payment consistency, cash-flow volatility, and behavioral preferences. Produces stickiness-adjusted strategy recommendations that balance financial efficiency with plan adherence.

## Service: `debtAdherenceRiskScoringService.js`
- **Location**: `backend/services/debtAdherenceRiskScoringService.js`
- **Size**: 480 lines
- **Purpose**: Assess behavioral adherence risk and adjust recommendations for plan viability

### Key Methods

#### `analyzePaymentConsistency(debtId, lookbackMonths)`
- Examines historical payment behavior for each debt
- Returns:
  - `onTimePercentage`: What % of payments were on-time (0-100)
  - `averagePaymentTiming`: Days late/early (negative = early, positive = late)
  - `consistencyScore`: Composite consistency metric (0-1)
- Data source: Debt payment history (timing, frequency)

#### `calculateCashFlowVolatility(userId, lookbackMonths)`
- Analyzes income and expense transaction patterns
- Returns:
  - `volatilityScore`: 0 = very stable, 1 = highly volatile
  - `averageMonthlyNetCashFlow`: Average monthly income - expenses
  - `standardDeviation`: Swing magnitude month-to-month
  - `coefficientOfVariation`: Volatility relative to income (risk metric)
- Calculation: CV = stdDev / avgCashFlow; high CV = unpredictable cash flows

#### `profilePreferences(userId, lookbackMonths)`
- Infers user's natural payment behaviors and preferences
- Returns:
  - `paymentFrequency`: 'monthly', 'bi-weekly', or 'bulk-monthly'
  - `batchPaymentTendency`: True if user prefers lump payments vs recurring
  - `preferredStrategy`: 'avalanche' or 'snowball' based on historical behavior
  - `responsiveness`: 'high' or 'moderate' based on transaction frequency

#### `calculateAdherenceScore(userId, debtIds)`
- Combines consistency, volatility, and preference factors
- Returns single adherence score (0-1, where 1 = very unlikely to abandon plan)
- Weighting: 40% consistency + 30% stability + 30% responsiveness
- Examples:
  - Perfect payment history + stable cash flow + active management = 0.95
  - Missed payments + volatile income + low transaction frequency = 0.35

#### `classifyRiskLevel(adherenceScore)`
- Maps numerical score to risk category:
  - 0.8-1.0: **Low risk** (can recommend aggressive plans)
  - 0.6-0.8: **Moderate risk** (standard recommendations ok)
  - 0.4-0.6: **High risk** (prefer simpler plans)
  - 0.0-0.4: **Very high risk** (recommend psychological/simple strategies)

#### `adjustRecommendationForAdherence(baseStrategy, adherenceScore, preferences)`
- Modifies strategy recommendation based on adherence risk
- **Low risk (0.8+)**:
  - Recommend: Avalanche (mathematically optimal)
  - Payment intensity: Aggressive
  - Checkpoints: As-needed
  
- **Moderate risk (0.6-0.8)**:
  - Recommend: Hybrid (balance math + psychology)
  - Payment intensity: Standard
  - Checkpoints: Quarterly
  
- **High risk (0.4-0.6)**:
  - Recommend: Hybrid (easier than avalanche)
  - Payment intensity: Moderate
  - Checkpoints: Bi-monthly
  
- **Very high risk (0.0-0.4)**:
  - Recommend: Snowball (psychological wins)
  - Payment intensity: Conservative
  - Checkpoints: Monthly

#### `scoreAdherence(userId, payload)` [Main Entry Point]
- Orchestrates full adherence assessment
- Returns comprehensive analysis with:
  - Adherence score and risk classification
  - Payment consistency metrics per debt
  - Cash flow volatility analysis
  - User preference profile
  - Stickiness-adjusted strategy recommendation
  - Detailed reasoning for recommendation

## API Endpoint: `POST /api/debts/adherence/score`

### Request Validation (2 validators)
```json
{
  "lookbackMonths": 12,
  "baseStrategy": "avalanche"
}
```

### Validation Details
- `lookbackMonths`: Numeric, 1-60 range (how far back to analyze behavior)
- `baseStrategy`: Optional, must be in ['avalanche', 'snowball', 'hybrid']

### Response Format
```json
{
  "success": true,
  "message": "Adherence risk scoring complete with stickiness-adjusted recommendations",
  "data": {
    "adherenceScore": 0.72,
    "riskLevel": "moderate",
    "analysis": {
      "paymentConsistency": {
        "averageOnTimePercentage": 94.5,
        "averagePaymentTiming": -2,
        "consistencyScore": 0.88,
        "debtDetails": [
          {
            "debtId": "uuid-1",
            "onTimePercentage": 98,
            "averagePaymentTiming": -3,
            "consistencyScore": 0.92
          }
        ]
      },
      "cashFlowVolatility": {
        "volatilityScore": 0.35,
        "averageMonthlyNetCashFlow": 2500,
        "standardDeviation": 875,
        "stabilityAssessment": "stable"
      },
      "preferences": {
        "paymentFrequency": "monthly",
        "batchPaymentTendency": true,
        "preferredStrategy": "snowball",
        "responsiveness": "high"
      }
    },
    "recommendations": {
      "adjusted": {
        "recommendedStrategy": "hybrid",
        "reason": "Balancing interest savings with psychological motivation",
        "adjustedPayment": "moderate",
        "checkpointInterval": "bi-monthly",
        "psychologicalBoost": true
      },
      "reasoning": {
        "adherenceHistory": "Consistent payment behavior with some volatility",
        "volatilityContext": "Moderate volatility suggests conservative budgeting",
        "preferenceAlignment": "User historically prefers monthly payments; adjust plan to match"
      }
    },
    "metrics": {
      "lookbackMonths": 12,
      "debtCount": 3,
      "analysisDate": "2026-03-03T..."
    }
  }
}
```

## Key Features

### 1. Payment Consistency Analysis
- Examines on-time payment percentage per debt
- Measures average payment timing (days early vs late)
- Provides consistency score reflecting reliability

### 2. Cash Flow Volatility Assessment
- Analyzes income/expense transaction patterns
- Calculates coefficient of variation (volatility relative to income)
- Classifies stability: very-stable → stable → moderate → volatile → very-volatile
- Informs whether user can handle aggressive payment schedules

### 3. Behavioral Profiling
- Detects payment frequency preference (monthly vs bi-weekly vs bulk)
- Identifies if user is batch-payer (monthly lump) vs. distributed payer
- Estimates responsiveness to plan changes (high/moderate)

### 4. Stickiness-Adjusted Recommendations
- **Fundamental concept**: A mathematically optimal plan that user abandons is worthless
- Adjusts strategy to match user's historical behavior and capacity
- Low-risk users can sustain avalanche (math-optimal)
- High-risk users get snowball (psychological wins) to maintain momentum
- Hybrid recommended for moderate-risk users

## Adherence Score Breakdown

Score combines three factors:
1. **Payment Consistency (40% weight)**
   - How reliably user makes on-time payments
   - Perfect track record = 1.0, no pattern = 0.5, frequent delays = 0.1

2. **Cash Flow Stability (30% weight)**
   - How predictable user's monthly income/expenses are
   - Stable months = 0.9, moderate variance = 0.6, highly volatile = 0.2

3. **Behavioral Responsiveness (30% weight)**
   - How actively user engages with financial management
   - High transaction frequency = 0.9, moderate = 0.7

### Score Interpretation
- **0.8-1.0 (Low Risk)**: User has strong payment history, stable income, and actively manages finances. Can recommend aggressive, interest-optimal plans.
- **0.6-0.8 (Moderate Risk)**: Generally reliable but with some volatility. Hybrid strategies work well.
- **0.4-0.6 (High Risk)**: Inconsistent payment patterns or cash flow volatility. Simpler plans recommended.
- **0.0-0.4 (Very High Risk)**: Significant adherence concerns. Recommend snowball for psychological motivation.

## Use Cases

### Scenario 1: Excellent Payment History, Stable Income
- Payment consistency: 97% on-time
- Cash flow volatility: 0.15 (very stable)
- Adherence score: 0.86 (Low Risk)
- Recommendation: Avalanche (mathematically optimal, user can handle it)

### Scenario 2: Good Payments, Volatile Income
- Payment consistency: 85% on-time
- Cash flow volatility: 0.52 (moderate-high)
- Adherence score: 0.58 (High Risk)
- Recommendation: Hybrid with conservative budgeting and bi-monthly checkpoints

### Scenario 3: Inconsistent Payments, Tight Budget
- Payment consistency: 62% on-time
- Cash flow volatility: 0.75 (high)
- Adherence score: 0.35 (Very High Risk)
- Recommendation: Snowball with monthly check-ins and buffer building

## Files Changed

### Modified
- `backend/routes/debts.js`:
  - Line 29: Added import for `debtAdherenceRiskScoringService`
  - Lines 967-1010: Added new endpoint with 2 validation rules

### Created
- `backend/services/debtAdherenceRiskScoringService.js` (480 lines)

## Integration Notes
- Uses existing `protect` middleware for auth
- Uses existing `asyncHandler` and `ApiResponse` patterns
- Reads from `debts` table (primary) and `transactions` table (secondary, optional)
- No data persistence (analysis in-memory only)
- Gracefully handles missing transaction history (uses defaults)
- Pairs with Issue #744-746 optimization features to ensure recommendations are realistic

## Testing Recommendations
1. **Perfect behavior user**: 100% on-time payments, stable $3K/month surplus → expect 0.9+ score
2. **Moderate volatility user**: 85% on-time, ±$500/month variance → expect 0.65 score
3. **High-risk user**: 60% on-time, ±$1500/month variance → expect 0.35 score
4. **Preference detection**: Test bulk-payer (early-month lump sums) vs. distributed payer
5. **Strategy adjustment**: Verify avalanche recommended for low-risk, snowball for high-risk
6. **Edge case**: No historical data (new account) → defaults to 0.5 (moderate risk)
