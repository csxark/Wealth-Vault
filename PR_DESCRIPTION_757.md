# Issue #757: Income-Based Payment Flexibility Engine

## Problem Statement

Current payoff plans assume **fixed extra payment capacity** month-to-month, but real income fluctuates dramatically:
- Bonuses arrive once or twice yearly
- Side gigs vary month-to-month ($500 one month, $2,000 the next)
- Seasonal work spikes during peak periods (tax prep, holiday retail)
- Unexpected windfalls (tax refunds, inheritance, gifts)

Users either leave variable income on the table (missing payoff acceleration opportunities) or overcommit to fixed payments during lean months (risking late payments or emergency fund depletion).

---

## Proposed Solution

### Overview

An **incomeBasedPaymentFlexibilityService** that:
- **Defines income tiers**: Base (stable), bonus (periodic), side gig (variable), seasonal (cyclical), windfalls (irregular)
- **Models cash-flow scenarios**: Conservative (base only), expected (average variable), optimistic (max variable)
- **Creates adaptive payment schedules**: Suggests minimum payments in tight months, aggressive in strong income months
- **Projects payoff acceleration**: Shows how much faster debt disappears with strategic variable income deployment
- **Provides month-by-month guidance**: "This month you can pay extra; next month go minimal to preserve buffer"

### Key Features

#### 1. **Income Tier Definition**

Users define income sources with stability characteristics:

| Tier | Frequency | Variability | Examples |
|------|-----------|-------------|----------|
| **Base** | Monthly | 0% | Salary, W-2 income |
| **Bonus** | Periodic | ±20% | Annual bonus, performance payout |
| **Side Gig** | Variable | ±50% | Freelance work, gig economy |
| **Seasonal** | Cyclical | ±40% | Tax prep (Jan-Apr), retail (Nov-Dec) |
| **Windfalls** | Irregular | ±100% | Tax refunds, gifts, inheritance |

**Input Example**:
```
Base: $4,000/month
Bonus: $5,000 in June & December
Side Gig: $800–$2,000/month average $1,200
Seasonal: +50% during Jun-Aug (summer peak)
Windfalls: $2,000 average tax refund
```

#### 2. **Multi-Scenario Cash-Flow Modeling**

For each month, calculate three income scenarios:

**Conservative**: Base income only
- Ensures plan works even if all variable income disappears
- Safe minimum payment tier

**Expected**: Base + average variable income
- Realistic middle ground
- Recommended payment tier

**Optimistic**: Base + maximum variable income  
- All side gigs, bonuses, windfalls materialize
- Aggressive payment tier (debt acceleration)

**Example (Month 6 = Bonus Month)**:
- Conservative: $4,000 (salary only)
- Expected: $4,000 + $1,200 (side gig avg) + $2,500 (bonus estimate) = $7,700
- Optimistic: $4,000 + $2,000 (max side gig) + $5,000 (full bonus) = $11,000

#### 3. **Adaptive Payment Schedule**

For each month, suggest three payment tiers:

**Minimum Tier**: Pay only required minimums
- Used in tight/conservative income months
- Preserves emergency buffer ($500 safety floor)
- Prevents overdraft risk

**Recommended Tier**: Minimum + 30% of expected extra income
- Balanced growth; builds confidence
- Typical 12-month outcome path

**Aggressive Tier**: Minimum + 50% of available income
- High-income months; accelerate payoff
- Deploy windfalls and bonuses strategically

**Guidance**: Rule-based recommendation based on available cash flow
- If available < 0.25× minimum: "Pay minimum; protect emergency fund"
- If available = 0.25–0.75× minimum: "Pay recommended tier"
- If available > 1.5× minimum: "Go aggressive; accelerate payoff"

#### 4. **Payoff Acceleration Measurement**

Compare three scenarios over payoff horizon:

| Metric | Conservative | Expected | Optimistic |
|--------|--------------|----------|-----------|
| **Payoff Months** | 48 | 36 | 28 |
| **Total Paid** | $42,500 | $40,200 | $38,700 |
| **Interest Cost** | $12,500 | $10,200 | $8,700 |

**Acceleration Analysis**:
- Expected vs. Conservative: **12 months faster** (25% acceleration)
- Interest saved: **$2,300** annually
- Confidence: High (based on historical side-gig average)

#### 5. **Monthly Guidance with Explanation**

For each of 12 months ahead:
- Income scenarios (conservative/expected/optimistic)
- Available funds after expenses & buffer
- Recommended payment tier + reason
- Flagged high-risk months (income dip; save aggressively)

Example:
```
Month 3 (March):
- Income: Low season → Conservative only ($4,000)
- Available for debt: $300
- Recommendation: Pay MINIMUM only
- Reason: Income tight; preserve emergency buffer

Month 6 (June):
- Income: High season + bonus → Optimistic ($11,000)
- Available for debt: $6,000
- Recommendation: Pay AGGRESSIVE tier
- Reason: Strong income month; accelerate payoff
```

---

## API Contract

### Request: `POST /api/debts/income-flexibility/optimize`

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
      "name": "Credit Card",
      "type": "credit-card",
      "apr": 18.5,
      "balance": 5000,
      "minimumPayment": 150
    },
    {
      "id": "debt-2",
      "name": "Personal Loan",
      "type": "personal-loan",
      "apr": 10.0,
      "balance": 15000,
      "minimumPayment": 350
    }
  ],
  "monthlyExpenses": 3200,
  "incomeProfile": {
    "base": {
      "amount": 4000
    },
    "bonus": {
      "amount": 5000,
      "frequencyMonths": 6,
      "probabilityPercent": 85
    },
    "sidegig": {
      "monthlyAverage": 1200,
      "monthlyMin": 800,
      "monthlyMax": 2000
    },
    "seasonal": {
      "baseMonthly": 4000,
      "peakMonths": [6, 7, 8],
      "peakMultiplier": 1.5
    },
    "windfalls": {
      "expectedAnnually": 2000,
      "probabilityPercent": 60
    }
  },
  "horizonMonths": 36
}
```

#### Validation Rules
- `debts`: Non-empty array (required)
- `debts[].minimumPayment`: Numeric, ≥ 0 (required)
- `debts[].balance`: Numeric, ≥ 0 (required)
- `debts[].apr`: 0–100 (optional)
- `monthlyExpenses`: Numeric, ≥ 0 (optional)
- `incomeProfile`: Object (optional)
  - `base.amount`: Numeric, ≥ 0
  - `bonus.amount`, `frequencyMonths`, `probabilityPercent`: Numeric
  - `sidegig.monthlyAverage|Min|Max`: Numeric
  - `seasonal.baseMonthly`, `peakMultiplier`, `peakMonths`: Numeric/array
  - `windfalls.expectedAnnually`, `probabilityPercent`: Numeric
- `horizonMonths`: 6–60 (optional, default: 24)

---

### Response: `200 OK`

```json
{
  "success": true,
  "data": {
    "optimization": {
      "userId": "user-123",
      "optimizationDate": "2026-03-03T12:34:56.000Z",
      "incomeProfile": {
        "baseMonthly": 4000,
        "bonusInfo": {
          "amount": 5000,
          "frequencyMonths": 6,
          "probability": "85%"
        },
        "sidegigAverage": 1200,
        "seasonalInfo": {
          "baseMonthly": 4000,
          "peakMonths": [6, 7, 8],
          "peakMultiplier": 1.5
        },
        "windfallExpected": 2000,
        "totalExpectedMonthly": 6467
      },
      "monthlyExpenses": 3200,
      "adaptivePaymentSchedule": {
        "schedule": [
          {
            "month": 1,
            "incomeScenarios": {
              "month": 1,
              "conservativeIncome": 4000,
              "expectedIncome": 5200,
              "optimisticIncome": 6000,
              "incomeRange": 2000
            },
            "availableForDebtPayment": {
              "conservative": 300,
              "expected": 1500,
              "optimistic": 2300
            },
            "suggestedPaymentTiers": {
              "minimumOnly": 500,
              "recommended": 950,
              "aggressive": 1650
            },
            "guidedByIncome": {
              "level": "moderate",
              "message": "Moderate extra capacity; add 20-30% to minimums when possible"
            },
            "recommendation": {
              "tier": "recommended",
              "reason": "Balanced approach; build extra payments without stress"
            }
          },
          {
            "month": 6,
            "incomeScenarios": {
              "month": 6,
              "conservativeIncome": 4000,
              "expectedIncome": 10200,
              "optimisticIncome": 11000,
              "incomeRange": 7000
            },
            "availableForDebtPayment": {
              "conservative": 300,
              "expected": 6500,
              "optimistic": 7300
            },
            "suggestedPaymentTiers": {
              "minimumOnly": 500,
              "recommended": 2450,
              "aggressive": 4150
            },
            "guidedByIncome": {
              "level": "abundant",
              "message": "Strong cash flow; aggressive extra payments recommended"
            },
            "recommendation": {
              "tier": "aggressive",
              "reason": "Abundant income; maximize debt elimination"
            }
          }
        ],
        "fullScheduleMonths": 36,
        "totalDebtPayment": 19800,
        "payoffAcceleration": {
          "baselinePayoffMonths": 48,
          "flexiblePayoffMonths": 36,
          "acceleratedMonths": 12,
          "percentFaster": 25
        }
      },
      "payoffScenarios": {
        "conservative": {
          "description": "Base income only, minimum payments",
          "totalPayment": 42500,
          "payoffMonths": 48,
          "remaining": 0
        },
        "expected": {
          "description": "Average variable income, flexible payments",
          "totalPayment": 40200,
          "payoffMonths": 36,
          "remaining": 0
        },
        "optimistic": {
          "description": "Max variable income, aggressive payments",
          "totalPayment": 38700,
          "payoffMonths": 28,
          "remaining": 0
        },
        "acceleration": {
          "monthsSaved": 12,
          "interestSaved": 1700
        }
      },
      "recommendation": {
        "strategy": "Income-Flexible Payoff",
        "approach": "Adjust payments based on actual monthly income; prioritize building emergency buffer in lean months",
        "expectedPayoffMonths": 36,
        "accelerationPotential": 12,
        "guidanceText": "With flexible income strategy, you can pay off debts in ~36 months. By taking advantage of high-income months, you could accelerate payoff by 12 months. In tight months, stick to minimum payments to protect your emergency buffer. In strong income months, allocate extra earnings to debt elimination. This approach balances debt reduction with financial stability."
      }
    }
  },
  "message": "Income-based payment flexibility analysis complete"
}
```

#### Response Schema

- **incomeProfile**: Normalized income sources (base, bonus, side gig, seasonal, windfalls)
- **adaptivePaymentSchedule**: Month-by-month payment recommendations
  - _month_: Month number
  - _incomeScenarios_: Conservative/expected/optimistic cash flow
  - _availableForDebtPayment_: Extra funds each scenario
  - _suggestedPaymentTiers_: Minimum/recommended/aggressive amounts
  - _guidedByIncome_: Cash-flow guidance (tight/moderate/healthy/abundant)
  - _recommendation_: Optimal tier + reason
- **payoffAcceleration**: Summary of speed gains vs. baseline
- **payoffScenarios**: Month-by-month payoff progression
  - _conservative_: Base-only scenario
  - _expected_: Average variable income
  - _optimistic_: Max variable income
  - _acceleration_: Months and interest saved
- **recommendation**: Strategy summary with expected timeline

---

## Implementation Details

### Core Algorithm

1. **Define Income Tiers**: Normalize user-provided income sources into 5 categories
2. **Generate Scenarios**: For each month, compute conservative/expected/optimistic cash flow
3. **Calculate Availability**: After expenses and safety buffer, determine extra funds
4. **Suggest Tiers**: Map available funds to payment recommendations (min/rec/aggressive)
5. **Model Payoff**: Simulate debt payoff under each scenario over horizon
6. **Rank Strategies**: Compare scenarios; recommend expected path as baseline
7. **Output Schedule**: Return 12-month guidance with month-specific actions

### Key Methods

- **`defineIncomeTiers()`**: Normalize income sources into 5-tier structure
- **`calculateMonthlyScenarios()`**: Compute conservative/expected/optimistic income for a given month
- **`generateAdaptivePaymentSchedule()`**: Build 12-month schedule with payment recommendations
- **`guidanceByIncomeLevel()`**: Rule-based guidance (critical/tight/moderate/healthy/abundant)
- **`selectPaymentTier()`**: Pick optimal tier based on guidance level
- **`modelPayoffScenarios()`**: Simulate full payoff under 3 income scenarios
- **`optimize()`**: Main orchestrator; runs complete analysis

---

## Files Changed

### Created
- **`backend/services/incomeBasedPaymentFlexibilityService.js`** (~380 lines)
  - Singleton service instance exported by default
  - Full income-flexible scheduling logic

### Modified
- **`backend/routes/debts.js`**
  - Added import: `incomeBasedPaymentFlexibilityService`
  - Added endpoint: `POST /api/debts/income-flexibility/optimize` (~70 lines)
  - Includes 23 body validators for debts, expenses, income tiers

---

## Integration Points

### External Dependencies
- `express-validator` for input validation (body, isArray, isObject, isNumeric, custom)
- `ApiResponse` utility class for standardized HTTP responses
- `asyncHandler` middleware for error handling

### Downstream Integration
- Could feed monthly guidance into payment autopilot system
- Could trigger alerts when income drops (switch to minimum tier)
- Could recommend when to capture high-income months with lump payments
- Could integrate with budgeting app to show available debt payment by month

---

## Example Workflows

### Workflow 1: Freelancer with Seasonal Income Spikes

**Profile**:
- Base: $3,000/month (steady client)
- Side gig: $500–$2,000/month (project-based)
- Seasonal: +60% during Q1 (tax season peak)
- Debts: $200 minimum payment

**Schedule Output**:
```
Jan (high season): Expected = $3K base + $1.5K avg side + $3K seasonal = $7.5K
  → Available for debt: $4K → AGGRESSIVE tier ($2.5K payment)
  → Pay off balance ~3 months faster

Jul (low season): Expected = $3K base + $800 side gig = $3.8K  
  → Available for debt: $500 → MINIMUM tier ($200 payment)
  → Preserve emergency fund for thin months
```

**Outcome**: Strategically deploy high-income months; maintain stability in lean months

---

### Workflow 2: W-2 Employee with Annual Bonus

**Profile**:
- Base: $4,500/month (salary)
- Bonus: $8,000 in December (85% probability)
- Debts: $600 minimum payment

**Schedule Output**:
```
Jan–Nov: Steady income → RECOMMENDED tier ($900 payment = min + 30%)
Dec: Bonus month → AGGRESSIVE tier ($3,600 payment = min + 50% of available)

Result: Year-round consistency + December surge
Payoff: 36 months vs. 48 months (conservative)
Interest saved: $2,400
```

---

### Workflow 3: Gig Worker with High Variability

**Profile**:
- Base: $1,500/month (occasional stable work)
- Side gig: $400–$3,000/month (highly variable)
- Debts: $400 minimum payment

**Schedule Output**:
```
Conservative scenario: $1.5K base only
  → Available: ($1.5K - expenses - buffer) = -$100
  → Recommendation: Stretch to minimum payment; no extra

Expected scenario: $1.5K + $1.5K avg side gig = $3K
  → Available: $850
  → Recommendation: RECOMMENDED tier ($650 payment)

Optimistic scenario: $1.5K + $3K max side gig = $4.5K
  → Available: $2.3K
  → Recommendation: AGGRESSIVE tier ($1.5K payment)

Payoff: 24–48 months (depends on gig consistency)
Strategy: Month-by-month: if gigs dry up, fall back to minimum; capture high-work months
```

---

## Acceptance Criteria

✅ Income tiers normalize 5 categories (base, bonus, side gig, seasonal, windfalls)  
✅ Monthly scenarios compute conservative/expected/optimistic cash flow  
✅ Payment tiers correctly map to available funds (min/rec/aggressive)  
✅ Guidance rules (tight/moderate/healthy/abundant) trigger correctly  
✅ Payoff scenarios accurately project under 3 income patterns  
✅ Acceleration metrics show months saved and interest reduced  
✅ API endpoint validates all income tier inputs  
✅ 12-month schedule with month-specific guidance  
✅ Error handling graceful (missing income, empty debts)  
✅ Response schema transparent and actionable  

---

## PR Checklist

- [x] Code follows existing project patterns (service singletons, asyncHandler, ApiResponse)
- [x] All monetary values rounded to cent precision
- [x] Input validation comprehensive (type, range, numeric checks)
- [x] No errors on static analysis
- [x] Income tier definitions align with real-world patterns
- [x] Three income scenarios implemented with realistic modeling
- [x] Adaptive payment tiers generated dynamically
- [x] Payoff acceleration calculations mathematically sound
- [x] Response schema includes transparent actionable guidance
- [x] Backward compatibility maintained (no API breaks)

---

## Future Enhancements

1. **Historical Income Data Integration**: Use actual past 12 months of deposits to predict income variability
2. **Tax Season / Holiday Adjustments**: Auto-detect seasonal work from past patterns
3. **Bonus Tracking**: Remember historical bonus amounts and timing; improve probability estimates
4. **Goal-Based Flexibility**: "I want to be debt-free by X date" → recommend payment tier mix
5. **Windfalls Auto-Deploy**: On tax refund/receipt, auto-allocate % to debt per schedule
6. **Co-Applicant Income**: Model dual-income families with different variability profiles
7. **Hardship Scenarios**: "What if I lose job for 3 months?" → Show resilience path
8. **Employer Matching**: For side gig income from specific gig platforms, track trends
9. **Feedback Loop**: Track actual vs. projected income; refine variability estimates
10. **Mobile Alerts**: Push notification on high-income month: "Great income this month! Consider debt acceleration"

---

## Notes

- Income scenarios assume linear growth; actual gig income may have non-linear patterns
- Seasonal peak months default to equal boost; can be customized per user
- Safety buffer of $500 prevents overdraft risk; customizable by user risk tolerance
- Payment tier calculations assume no new debt added during payoff
- Conservative scenario ensures plan viability even if variable income vanishes
- Recommended best-effort path balances debt reduction with financial flexibility
