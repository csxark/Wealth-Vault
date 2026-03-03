# Issue #774: Debt-to-Income Ratio Optimizer

## Problem Statement

Users don't understand their real **Debt-to-Income (DTI) ratio** or how it impacts loan eligibility. Lenders heavily weight DTI when evaluating mortgages, auto loans, and refinancing. A user might carry debts that make them ineligible for a mortgage (DTI > 43%) without realizing it, or miss the window to improve eligibility before applying.

---

## Proposed Solution

### Overview

A **dtiRatioOptimizerService** that:
- **Calculates current DTI** from all monthly debt payments ÷ gross monthly income
- **Scores each debt's DTI impact** - which debts, if eliminated, yield the largest DTI lift
- **Recommends three strategic payoff paths** (aggressive, balanced, moderate) to reach target DTI thresholds
- **Models 6/12/24-month DTI projections** showing trajectory under each strategy
- **Analyzes loan eligibility** against conventional mortgages, FHA, VA mortgages, auto loans, and refinancing
- **Identifies quick wins** - debts that take months to eliminate but immediately improve DTI

### Key Features

#### 1. **Current DTI Calculation**

$$\text{DTI Ratio} = \frac{\text{Total Monthly Debt Payments}}{\text{Gross Monthly Income}}$$

**Status Classification**:
- **Healthy**: DTI ≤ 36% (excellent loan eligibility)
- **Moderate**: 36% < DTI ≤ 43% (decent mortgage approval odds)
- **Elevated**: 43% < DTI ≤ 50% (limited lending options)
- **Critical**: DTI > 50% (high rejection risk)

Example:
- Monthly debts: Mortgage $1,500 + CC $150 + Student Loan $250 = **$1,900**
- Gross monthly income: **$5,000**
- DTI = $1,900 / $5,000 = **38%** (moderate - above ideal for mortgages)

#### 2. **Debt Impact Ranking**

Calculates the DTI improvement if each debt were eliminated:

**Impact Score** = Monthly Payment ÷ Gross Income

Example:
- Credit card ($150 payment) → 3% DTI improvement if paid off
- Auto loan ($350 payment) → 7% DTI improvement if paid off
- Personal loan ($200 payment) → 4% DTI improvement if paid off

**Insight**: Eliminating the auto loan yields the highest DTI reduction; prioritize it first.

#### 3. **DTI Efficiency Scoring**

Combines payment size + payoff timeline:

$$\text{DTI Efficiency} = \frac{\text{Monthly Payment}}{\text{Months to Payoff}}$$

Identifies "quick wins": debts with large monthly payments that can be eliminated quickly.

Example:
- Credit card ($150, 6 months to payoff) → Efficiency: $25/month
- Student loan ($250, 60 months) → Efficiency: $4.17/month
- Auto loan ($350, 48 months) → Efficiency: $7.29/month

**Insight**: Credit card is the quick win; tackle it first for immediate DTI improvement.

#### 4. **Three Strategic Payoff Paths**

The service generates competing strategies:

**Path A: Aggressive**
- Eliminate top 50% of debts (by DTI impact)
- Focus on largest payment reductions
- Timeline: 12–18 months
- Rationale: Maximize DTI improvement quickly; ideal if mortgage application imminent

**Path B: Balanced**
- Eliminate 60% of debts by impact (mix of large + quick wins)
- Balance speed with feasibility
- Timeline: 18–24 months
- Rationale: Realistic pace with maintained emergency flexibility

**Path C: Moderate**
- Eliminate top 1–2 highest-impact debts
- Preserve cash flow for emergencies
- Timeline: 24–36 months
- Rationale: Gradual improvement; suitable for stable income

#### 5. **Loan Eligibility Analysis**

Analyzes DTI against major lending products:

| Loan Type | Max DTI | Ideal DTI | Qualification |
|-----------|---------|----------|--------------|
| **Conventional Mortgage** | 43% | 36% | Best rates at ≤36% |
| **FHA Mortgage** | 50% | 40% | More flexible; higher rates |
| **VA Mortgage** | 60% | 50% | No hard cap (military) |
| **Auto Loan** | 50% | 36% | Best terms at ≤36% |
| **Personal Loan** | 43% | 36% | Standard unsecured benchmark |
| **Refinance** | 43% | 36% | Rate improvement threshold |

**Output**: Current eligibility status + improvement needed per product

#### 6. **DTI Projections Over Time**

Models DTI at 6, 12, and 24-month milestones under each strategy:

- **Month 6**: Short-term trajectory
- **Month 12**: Mid-term eligibility window
- **Month 24**: Long-term stability target

Each projection shows:
- Estimated DTI percentage
- DTI improvement from today
- Which debts expected to be paid off

---

## API Contract

### Request: `POST /api/debts/dti/optimize`

#### Headers
```http
Authorization: Bearer {token}
Content-Type: application/json
```

#### Body
```json
{
  "debts": [
    {
      "id": "debt-1",
      "name": "Mortgage",
      "type": "mortgage",
      "apr": 3.5,
      "balance": 350000,
      "minimumPayment": 1500,
      "remainingMonths": 180
    },
    {
      "id": "debt-2",
      "name": "Credit Card",
      "type": "credit-card",
      "apr": 18.5,
      "balance": 3500,
      "minimumPayment": 150,
      "remainingMonths": 24
    },
    {
      "id": "debt-3",
      "name": "Auto Loan",
      "type": "auto-loan",
      "apr": 6.5,
      "balance": 15000,
      "minimumPayment": 350,
      "remainingMonths": 48
    },
    {
      "id": "debt-4",
      "name": "Student Loans",
      "type": "student-loan",
      "apr": 6.0,
      "balance": 25000,
      "minimumPayment": 250,
      "remainingMonths": 120
    }
  ],
  "grossMonthlyIncome": 5000,
  "targetDtiPercent": 36,
  "loanProducts": ["conventional-mortgage", "fha-mortgage"],
  "projectionMonths": [6, 12, 24]
}
```

#### Validation Rules
- `debts`: Non-empty array (required)
- `debts[].minimumPayment`: Numeric, ≥ 0 (required)
- `debts[].apr`: 0–100 (optional)
- `debts[].balance`: Numeric, ≥ 0 (required)
- `debts[].remainingMonths`: Numeric, ≥ 0 (optional)
- `grossMonthlyIncome`: Numeric, > 0 (required)
- `targetDtiPercent`: 10–50 (optional, default: 36)
- `loanProducts`: Array of product types (optional)
- `projectionMonths`: Array of months (optional, default: [6, 12, 24])

---

### Response: `200 OK`

```json
{
  "success": true,
  "data": {
    "optimization": {
      "userId": "user-123",
      "optimizationDate": "2026-03-03T12:34:56.000Z",
      "currentDtiAnalysis": {
        "grossMonthlyIncome": 5000,
        "totalMonthlyPayment": 2250,
        "dtiRatio": "45.00",
        "dtiPercent": "45.00%",
        "status": "elevated"
      },
      "targetDtiPercent": 36,
      "debtImpactRanking": [
        {
          "debtId": "debt-3",
          "debtName": "Auto Loan",
          "currentPayment": 350,
          "paymentSavings": 350,
          "newTotalPayment": 1900,
          "newDtiPercent": "38.00%",
          "dtiImprovement": 7.00,
          "improvementRatio": 15.56
        },
        {
          "debtId": "debt-4",
          "debtName": "Student Loans",
          "currentPayment": 250,
          "paymentSavings": 250,
          "newTotalPayment": 2000,
          "newDtiPercent": "40.00%",
          "dtiImprovement": 5.00,
          "improvementRatio": 11.11
        },
        {
          "debtId": "debt-2",
          "debtName": "Credit Card",
          "currentPayment": 150,
          "paymentSavings": 150,
          "newTotalPayment": 2100,
          "newDtiPercent": "42.00%",
          "dtiImprovement": 3.00,
          "improvementRatio": 6.67
        }
      ],
      "dtiEfficiencyScoring": [
        {
          "debtId": "debt-2",
          "debtName": "Credit Card",
          "monthlyPayment": 150,
          "estimatedPayoffMonths": 24,
          "dtiEfficiencyScore": 6.25,
          "efficiency": "high"
        },
        {
          "debtId": "debt-3",
          "debtName": "Auto Loan",
          "monthlyPayment": 350,
          "estimatedPayoffMonths": 48,
          "dtiEfficiencyScore": 7.29,
          "efficiency": "high"
        },
        {
          "debtId": "debt-4",
          "debtName": "Student Loans",
          "monthlyPayment": 250,
          "estimatedPayoffMonths": 120,
          "dtiEfficiencyScore": 2.08,
          "efficiency": "low"
        }
      ],
      "payoffPaths": [
        {
          "name": "Aggressive",
          "strategy": "Eliminate highest-DTI-impact debts first",
          "debtSequence": ["debt-3", "debt-4"],
          "projectedDtiReduction": "12.00%",
          "timeToTargetDti": 12
        },
        {
          "name": "Balanced",
          "strategy": "Mix high-impact and quick-win debts",
          "debtSequence": ["debt-3", "debt-4", "debt-2"],
          "projectedDtiReduction": "15.00%",
          "timeToTargetDti": 18
        },
        {
          "name": "Moderate",
          "strategy": "Conservative payoff with emergency buffer",
          "debtSequence": ["debt-3"],
          "projectedDtiReduction": "7.00%",
          "timeToTargetDti": 12
        }
      ],
      "dtiProjections": [
        {
          "monthsFromNow": 6,
          "projectedDtiPercent": "44.00%",
          "projectedDtiRatio": 44.00,
          "dtiImprovement": 1.00,
          "timelineStatus": "short-term"
        },
        {
          "monthsFromNow": 12,
          "projectedDtiPercent": "42.00%",
          "projectedDtiRatio": 42.00,
          "dtiImprovement": 3.00,
          "timelineStatus": "mid-term"
        },
        {
          "monthsFromNow": 24,
          "projectedDtiPercent": "38.00%",
          "projectedDtiRatio": 38.00,
          "dtiImprovement": 7.00,
          "timelineStatus": "long-term"
        }
      ],
      "loanEligibilityAnalysis": [
        {
          "product": "conventional-mortgage",
          "targetDti": "43.00%",
          "idealDti": "36.00%",
          "currentDti": "45.00%",
          "eligible": false,
          "improvementNeeded": "2.00%",
          "description": "Conventional mortgages typically require ≤43% DTI; 36% is ideal"
        },
        {
          "product": "fha-mortgage",
          "targetDti": "50.00%",
          "idealDti": "40.00%",
          "currentDti": "45.00%",
          "eligible": true,
          "improvementNeeded": "0.00%",
          "description": "FHA mortgages allow up to 50% DTI; 40% is optimal"
        }
      ],
      "recommendation": {
        "optimalPath": "Balanced",
        "strategy": "Mix high-impact and quick-win debts",
        "debtSequence": ["debt-3", "debt-4", "debt-2"],
        "estimatedMonthsToTarget": 18,
        "projectedDtiReduction": "15.00%",
        "reasoning": "Your DTI is moderate at 45.00%. Balanced approach balances debt reduction with flexibility for unexpected expenses."
      }
    }
  },
  "message": "DTI ratio optimization analysis complete"
}
```

#### Response Schema

- **currentDtiAnalysis**: Current DTI snapshot (income, payment, ratio, status)
- **debtImpactRanking**: Debts ranked by DTI improvement if paid off
  - _dtiImprovement_: DTI percentage improvement
  - _improvementRatio_: Improvement as % of current DTI
- **dtiEfficiencyScoring**: Debts ranked by payment ÷ payoff months (quick wins)
- **payoffPaths**: Three strategic paths with debt sequence, projected reduction, timeline
- **dtiProjections**: DTI estimates at 6/12/24 months under default strategy
- **loanEligibilityAnalysis**: Current + target DTI for each selected loan product
- **recommendation**: Best strategy with timeline and reasoning

---

## Implementation Details

### Core Algorithm

1. **Calculate Current DTI**: Sum all monthly debt payments ÷ gross income
2. **Score Debt Impact**: For each debt, calculate DTI reduction if eliminated
3. **Rank by Impact**: Sort debts by DTI improvement (highest first)
4. **Score Efficiency**: Divide monthly payment by payoff months (quick wins)
5. **Generate Paths**: Build aggressive, balanced, moderate payoff sequences
6. **Project Over Time**: Estimate DTI at 6/12/24 months under each path
7. **Analyze Eligibility**: Check against lending product thresholds
8. **Recommend**: Select path that best balances speed + feasibility

### Key Methods

- **`calculateCurrentDti()`**: Computes DTI ratio and status classification
- **`calculateDebtEliminationImpact()`**: DTI improvement if debt paid off
- **`rankDebtsByDtiImpact()`**: Sort debts by impact (highest first)
- **`generatePayoffPaths()`**: Generate aggressive, balanced, moderate strategies
- **`scoreDtiEfficiency()`**: Quick-win scoring (payment ÷ payoff months)
- **`projectDtiOverTime()`**: DTI estimates at future milestones
- **`analyzeLoanEligibility()`**: Check eligibility vs. lending products
- **`optimize()`**: Main orchestrator; runs complete analysis

---

## Files Changed

### Created
- **`backend/services/dtiRatioOptimizerService.js`** (~350 lines)
  - Singleton service instance exported by default
  - Full DTI analysis, ranking, path generation, projections, eligibility logic

### Modified
- **`backend/routes/debts.js`**
  - Added import: `dtiRatioOptimizerService`
  - Added endpoint: `POST /api/debts/dti/optimize` (~60 lines)
  - Includes 12 body validators for debts, income, target DTI, loan products

---

## Integration Points

### External Dependencies
- `express-validator` for input validation (body, isArray, isIn, isNumeric, custom)
- `ApiResponse` utility class for standardized HTTP responses
- `asyncHandler` middleware for error handling

### Downstream Integration
- Could feed DTI projections into mortgage pre-approval flow
- Could trigger alerts when DTI becomes eligible for target loan product
- Could recommend payoff strategy based on upcoming major purchases (home, car)
- Could integrate with auto-payment system to execute recommended payoff sequence

---

## Example Workflows

### Workflow 1: Mortgage Eligibility Window

**User Context**:
- Current DTI: 45% (ineligible for conventional mortgage; needs ≤43%)
- Gross income: $5,000/month
- Debts: Mortgage $1,500, CC $150, Auto $350, Student $250
- Plans to buy rental property in 18 months

**Analysis**:
- **Debt Impact Ranking**: Auto loan ($350) → 7% improvement; Student ($250) → 5%;  CC ($150) → 3%
- **Efficiency**: CC is quickest win (6 months); Auto takes 4 years
- **Recommendation**: Balanced path - eliminate CC + Auto within 12 months
- **Projection**: DTI improves to 35% → Eligible for conventional mortgage in 12 months

**Outcome**: User prioritizes CC + Auto payoff, becomes mortgage-eligible before investment purchase

---

### Workflow 2: Refinancing Strategy

**User Context**:
- Current DTI: 38% (eligible for refi; needs ≤36% for best rates)
- Gross income: $6,000/month
- Wants to refinance mortgage within 6 months for rate improvement

**Analysis**:
- **Quick wins**: Personal loan ($200, 12 months to payoff) → 3.3% improvement
- **Projection**: Eliminate personal loan now → DTI drops to 34.7% → Qualifies for premium rates
- **Recommendation**: Aggressive payoff of personal loan; refinance mortgage after 6 months

**Outcome**: User pays off one small debt, achieves 0.5% rate improvement on $300k mortgage = $1,500/year savings

---

### Workflow 3: Loan Consolidation Decision

**User Context**:
- Current DTI: 52% (too high for almost everything)
- Debts: Mortgage $1,500, CC $400, Auto $300, Personal $250
- Considering consolidation loan to simplify payments

**Analysis**:
- **Current**: Ineligible for conventional mortgage, auto loan refinance
- **Aggressive payoff**: Eliminate CC + Personal → DTI drops to 41% in 18 months
- **Consolidation alternative**: Combine CC + Personal at lower rate (net -$50/month) → DTI drops to 49% immediately

**Recommendation**: Consolidation is faster path to eligibility (6 months vs. 18); lower interest ongoing

---

## Acceptance Criteria

✅ DTI calculation accurate (sum payments ÷ income)  
✅ Debt impact ranking correctly scores elimination improvement  
✅ Efficiency scoring identifies quick wins (payment ÷ payoff months)  
✅ Three payoff paths generated with realistic timelines  
✅ DTI projections mathematically sound at 6/12/24 months  
✅ Loan eligibility analysis matches lending product standards  
✅ Recommendation selects optimal path (aggressive/balanced/moderate)  
✅ API endpoint validates all inputs (debts, income, loan products)  
✅ Error handling graceful (missing income, empty debts)  
✅ Response schema transparent (all drivers visible)

---

## PR Checklist

- [x] Code follows existing project patterns (service singletons, asyncHandler, ApiResponse)
- [x] All monetary values and percentages rounded to 2 decimal places
- [x] Input validation comprehensive (type, range, enum checks)
- [x] No errors on static analysis
- [x] DTI thresholds reflect current lending industry standards
- [x] Three payoff paths all implemented with realistic strategies
- [x] Projections mathematically sound (simple linear decay model)
- [x] Response schema includes transparent breakdowns
- [x] Backward compatibility maintained (no API breaks)
- [x] Documentation covers common mortgage/refinance scenarios

---

## Future Enhancements

1. **Income Projections**: Factor in expected income changes (raises, bonuses) to DTI timeline
2. **Seasonal DTI**: Account for seasonal income variations (gig work, contractors)
3. **Alternative Debt Types**: Add medical debt, tax liens, child support as separate category
4. **Co-Applicant Support**: Model joint DTI for spouse/partner applications
5. **Rate Impact Modeling**: Estimate mortgage rate improvements at each DTI level
6. **Lender-Specific Rules**: Different banks have different DTI policies (store in DB)
7. **Hardship Scenarios**: Model DTI under job loss, income reduction scenarios
8. **Balance Transfer Integration**: Factorinto debt consolidation payoff plan
9. **Historical Tracking**: Log DTI changes over time, measure vs. projections
10. **ML Prediction**: Train model on user cohorts to predict actual payoff timelines

---

## Notes

- DTI calculation assumes all debts have monthly payments; quarterly/annual adjusted downward
- Efficiency score assumes linear payoff pace; actual variation by debt type
- Projections assume no new debt added; major assumption for credit card users
- Lending thresholds current as of 2024–2026; regulatory changes may require updates
- Analysis is advisory; lenders may use different DTI calculations or additional factors
