# Issue #775: Creditor Negotiation Assistant

## Problem Statement

Users don't know how to negotiate with creditors and miss thousands in potential savings:
- No baseline for what APR reductions are realistic (what rates do competitors offer?)
- No settlement negotiation strategy (should I offer 60% or 75% of balance?)
- No personalized scripts - leading with the wrong approach to a creditor damages chances
- No ranking of which debts are worth negotiating (auto loans rarely budge; credit cards often negotiate)
- No tracking of negotiation success rates by creditor type (learn what works)

Users leave money on the table: A 2% APR reduction on a $10,000 credit card saves $200/year × 3 years = $600+ in interest.

---

## Proposed Solution

### Overview

A **creditorNegotiationAssistantService** that:
- **Assesses negotiation strength**: Uses credit score, payment history quality, and account tenure to gauge leverage
- **Generates personalized scripts**: Different opening for a 750 credit score vs. a 600 score
- **Ranks debts by feasibility**: Which debts are actually worth negotiating? (credit cards: 65% success; auto loans: 25%)
- **Suggests realistic targets**: What APR reduction is reasonable? (benchmark against competitor rates)
- **Provides settlement playbooks**: "Offer 60%, ready to negotiate to 65% if they push back"
- **Logs negotiation outcomes**: Track what worked, what didn't; improve over time

### Key Components

#### 1. **Credit Strength Assessment**

Uses credit score to gauge negotiation leverage:

| Score | Level | Leverage | Message |
|-------|-------|----------|---------|
| 750+ | Excellent | 0.9 | Creditors value your business; strong negotiating position |
| 700–749 | Good | 0.7 | Can negotiate; creditors prefer to work with you |
| 650–699 | Fair | 0.5 | Selective negotiation; choose fights carefully |
| 600–649 | Poor | 0.3 | Limited leverage; frame as hardship preservation |
| <600 | Very Poor | 0.1 | Minimal leverage; settlement-focused approach |

**Script Adaptation**:
- **Excellent credit**: "I've consistently made on-time payments. I'm considering competitor offers at lower rates; can you match?"
- **Poor credit**: "I'm experiencing hardship. I want to work with you rather than fall behind. Can we discuss options?"

#### 2. **Payment Quality Scoring**

Analyzes payment history to justify negotiation:

```
Perfect      (0 late payments)               → 100 points
Excellent    (1-2 minor lates)              → 85 points
Good         (occasional lates)             → 70 points
Fair         (frequent lates)               → 50 points
Poor         (chronic delinquency)          → 25 points
```

**Impact on Negotiation**:
- Perfect/Excellent history: Lead with APR reduction ("reward loyalty")
- Fair/Poor history: Lead with hardship program ("prevent delinquency")

#### 3. **Account Tenure Multiplier**

Creditors value long-standing customers; use as leverage:

| Tenure | Multiplier | Message |
|--------|-----------|---------|
| 0–6 months | 0.3x | New account; minimal leverage |
| 6 months–2 years | 0.6x | Established; some loyalty value |
| 2–5 years | 1.0x | Valued customer; standard leverage |
| 5+ years | 1.3x | Loyal customer; strong leverage |

**Script**:
- "I've been a valued customer for **4 years** with perfect payment history..."

#### 4. **Creditor-Specific Benchmarks**

Each debt type has different negotiation profiles:

| Debt Type | Avg APR | Negotiable Floor | Max Reduction | Settlement % | Success Rate |
|-----------|---------|-----------------|---------------|--------------|--------------|
| **Credit Card** | 22.5% | 15% | 8% | 50–75% | 65% |
| **Personal Loan** | 12% | 7% | 5% | 70–85% | 45% |
| **Auto Loan** | 8.5% | 4% | 4% | 85–95% | 25% |
| **Student Loan** | 6% | 3% | 3% | 80–95% | 30% |
| **Mortgage** | 7% | 4% | 3% | 90–98% | 20% |
| **HELOC** | 9.5% | 6% | 3.5% | 75–90% | 50% |

**Negotiation Difficulty**:
- **Easy**: Credit cards (high margin; creditors motivated to retain)
- **Moderate**: HELOC, personal loans
- **Hard**: Auto loans, mortgages, student loans (lower margins; less incentive to reduce)

#### 5. **Personalized Negotiation Scripts**

Four negotiation approaches for each debt:

**A. APR Reduction Script**
```
Opening: "I've been a loyal customer for 3 years with an excellent payment history. 
I'd like to reduce my APR from 18.5% to 15%."

Rationale: "I consistently make on-time payments and maintain a 720 credit score. 
Competitor rates are as low as 15% for accounts like mine."

Closing: "A reduction to 15% would save me approximately $600/year and allow me to 
pay down my balance faster. I'd prefer to keep my business with you."
```

**B. Fee Waiver Script**
```
Opening: "I noticed I was charged a $35 late fee last month. Given my otherwise 
excellent payment history, I'd like to request a one-time waiver."

Rationale: "That late payment was uncharacteristic; I've since set up automatic payments 
to prevent recurrence."

Closing: "Removing this fee would help—can you assist?"
```

**C. Settlement Script**
```
Opening: "I'm experiencing financial hardship. Rather than risk delinquency, 
I'd like to discuss settling this account."

Offer: "I can provide a lump-sum payment of $6,000 (60% of balance) to close this account."

Terms: "Marking as 'paid in full' and removing negative reporting."

Closing: "I can provide the settlement amount within 30 days."
```

**D. Hardship Program Script**
```
Opening: "I'm reaching out because I'm experiencing temporary financial hardship."

Background: "I've been a customer for 3 years and want to work with you to find a solution."

Request: "Would you consider a temporary payment reduction or hardship program?"

Closing: "I'm committed to resolving this and working toward full repayment."
```

#### 6. **Debt Ranking by Feasibility**

Scores each debt on negotiability (0–100):

$$\text{Feasibility Score} = (\text{Payment Quality} \times 0.4) + (\text{Credit Strength} \times 0.35) + (\text{Tenure Multiplier} \times 0.25)$$

**Example**:
- Credit Card: 85 (excellent) + 70 (quality) + 1.0 (tenure) = **High feasibility (80+)**
- Auto Loan: 40 (30% success baseline) = **Low feasibility (45)**

**Recommendation**:
- Rank 1 (Credit Card): 92/100 → "Negotiate this first; ~65% success probability"
- Rank 2 (HELOC): 76/100 → "Good secondary target; ~50% success probability"
- Rank 3 (Auto Loan): 48/100 → "Not worth negotiating; <25% success probability"

#### 7. **Negotiation Playbook**

Full strategic guide for a single debt:

```json
{
  "debt": "Credit Card - Chase Sapphire",
  "balance": 5000,
  "currentApr": 18.5,
  "negotiationStrength": "GOOD (72/100)",
  "creditScore": 720,
  "negotiationOptions": {
    "aprReduction": {
      "script": "Hello, I've been a loyal customer for 4 years with perfect payment history...",
      "targetApr": 15,
      "expectedSavings": 175,
      "successProbability": 65,
      "difficulty": "moderate"
    },
    "feeWaiver": {
      "successProbability": 70,
      "difficulty": "easy"
    },
    "settlement": {
      "settlementOffer": 3750,
      "successProbability": 50,
      "difficulty": "hard",
      "warning": "Impacts credit score; use only if critical cash flow"
    }
  },
  "recommendedApproach": "Lead with APR reduction; excellent payment history + credit score is your leverage",
  "stepByStep": [
    { "step": 1, "action": "Request call with retention team", "timing": "This week" },
    { "step": 2, "action": "Present APR reduction request", "timing": "During call" },
    { "step": 3, "action": "Ask about fee waivers if APR goes well", "timing": "Build on success" },
    { "step": 4, "action": "Get agreement in writing", "timing": "Before hanging up" },
    { "step": 5, "action": "Follow up in 30 days to confirm", "timing": "Verify application" }
  ]
}
```

---

## API Contract

### Request: `POST /api/debts/negotiate/suggest`

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
      "id": "debt-cc-001",
      "name": "Chase Sapphire Preferred",
      "type": "credit-card",
      "apr": 18.5,
      "balance": 5000,
      "minimumPayment": 150,
      "openedDate": "2020-06-15"
    },
    {
      "id": "debt-auto-001",
      "name": "Toyota Loan",
      "type": "auto-loan",
      "apr": 6.5,
      "balance": 12000,
      "minimumPayment": 325,
      "openedDate": "2021-09-20"
    }
  ],
  "creditScore": 720,
  "options": {
    "focusOnHighFeasibility": true
  }
}
```

#### Validation Rules
- `debts`: Non-empty array (required)
- `debts[].id`: String (optional)
- `debts[].name`: String (optional)
- `debts[].type`: One of [mortgage, student-loan, heloc, credit-card, auto-loan, personal-loan, medical] (required)
- `debts[].apr`: Numeric, 0–100 (optional)
- `debts[].balance`: Numeric, ≥0 (required)
- `debts[].minimumPayment`: Numeric, ≥0 (required)
- `debts[].openedDate`: ISO 8601 date (optional)
- `creditScore`: Numeric, 300–850 (optional, default: 650)
- `options`: Object (optional)

---

### Response: `200 OK`

```json
{
  "success": true,
  "data": {
    "creditProfile": {
      "creditScore": 720,
      "level": "good",
      "score": 0.7,
      "message": "Good negotiating position; creditors value your business"
    },
    "debtRanking": [
      {
        "debtId": "debt-cc-001",
        "name": "Chase Sapphire Preferred",
        "type": "credit-card",
        "balance": 5000,
        "apr": 18.5,
        "feasibilityScore": 92,
        "feasibilityRank": "high",
        "paymentQuality": "Perfect (0 late payments)",
        "accountAge": 48,
        "accountTenure": "valued",
        "potentialAprSavings": 600,
        "estimatedSettlementRange": [2500, 3750],
        "negotiationSuccessProbability": 65,
        "expectedResponseTime": "2-3 weeks"
      },
      {
        "debtId": "debt-auto-001",
        "name": "Toyota Loan",
        "type": "auto-loan",
        "balance": 12000,
        "apr": 6.5,
        "feasibilityScore": 48,
        "feasibilityRank": "low",
        "paymentQuality": "Perfect (0 late payments)",
        "accountAge": 30,
        "accountTenure": "established",
        "potentialAprSavings": 120,
        "estimatedSettlementRange": [10200, 11400],
        "negotiationSuccessProbability": 25,
        "expectedResponseTime": "4-6 weeks"
      }
    ],
    "topNegotiationTargets": [
      {
        "debtId": "debt-cc-001",
        "debtName": "Chase Sapphire Preferred",
        "debtType": "credit-card",
        "balance": 5000,
        "currentApr": 18.5,
        "negotiationProfile": {
          "creditScore": 720,
          "creditStrength": "good",
          "paymentQuality": "Perfect (0 late payments)",
          "accountAge": "48 months (valued)",
          "overallNegotiationStrength": 92
        },
        "negotiationOptions": {
          "aprReduction": {
            "script": "Hello, I've been a loyal customer for 4 years with an excellent payment history. I'd like to discuss reducing my APR from 18.5% to 15%.",
            "rationale": "I've consistently made on-time payments and maintain a good credit score. Recent competitors are offering rates as low as 15% for accounts like mine.",
            "closingStatement": "I'd like to keep my business with you. A rate reduction to 15% would save me approximately $600 and allow me to pay down my balance faster.",
            "targetApr": 15,
            "expectedMonthlySavings": 50,
            "successProbability": 65,
            "difficulty": "moderate"
          },
          "feeWaiver": {
            "script": "I noticed I've been charged annual fees on this account. I'd like to request a one-time waiver given my good payment history.",
            "rationale": "As a long-standing customer with excellent payment history, I believe I qualify for an annual fee waiver.",
            "closingStatement": "Removing these fees would help me redirect funds to paying down my balance. Can you help make this adjustment?",
            "feeType": "annual-fee",
            "successProbability": 70,
            "difficulty": "easy"
          },
          "settlement": {
            "script": "I'm experiencing financial hardship and would like to discuss settling this account. I can offer a lump-sum payment to close the account.",
            "rationale": "Rather than risk prolonged delinquency, I'd like to settle at 75% of the balance today.",
            "settlementOffer": 3750,
            "settlementPercent": 75,
            "closingStatement": "I can provide the settlement amount of $3,750 within 30 days in exchange for marking this account 'paid in full' and removing negative reporting.",
            "expectedSavings": 1250,
            "successProbability": 50,
            "difficulty": "hard",
            "warning": "Settlement will negatively impact credit score; use only if cash flow is critical"
          }
        },
        "recommendedApproach": {
          "strategy": "Lead with APR reduction, then request fee waivers",
          "stepByStep": [
            {
              "step": 1,
              "action": "Request a call with the creditor's retention team",
              "timing": "This week",
              "expectedOutcome": "Speak with someone authorized to negotiate"
            },
            {
              "step": 2,
              "action": "Lead with APR reduction request",
              "timing": "During call",
              "expectedOutcome": "APR reduction of 2-5%"
            },
            {
              "step": 3,
              "action": "Request fee waivers if applicable",
              "timing": "If APR discussion goes well",
              "expectedOutcome": "$25-100 in fee reversals"
            },
            {
              "step": 4,
              "action": "Get all agreements in writing before hanging up",
              "timing": "End of call",
              "expectedOutcome": "Email confirmation of changes"
            },
            {
              "step": 5,
              "action": "Follow up in 30 days to confirm changes were applied",
              "timing": "30 days after call",
              "expectedOutcome": "Verification of rate change or fee reversal"
            }
          ]
        },
        "timelineEstimate": {
          "decisionTime": "2-3 weeks",
          "implementationTime": "3-5 business days after approval",
          "overallTimeline": "2-3 weeks to see impact on next statement"
        },
        "successFactors": [
          "Good negotiating position due to excellent credit",
          "Perfect (0 late payments)",
          "Account in good standing for 48 months",
          "Negotiating credit-card with 65% industry success rate"
        ]
      }
    ],
    "aggregatedMetrics": {
      "totalDebtBalance": 17000,
      "currentTotalAprCost": 1275,
      "estimatedAnnualSavings": 600,
      "potentialMultipleDebtSavings": 1800,
      "averageFeasibilityScore": 70,
      "highFeasibilityCount": 1,
      "estimatedPayoffAcceleration": 50
    },
    "recommendation": {
      "strategy": "Sequential Negotiation",
      "approach": "Start with highest-feasibility debts; deploy APR reduction wins to accelerate payoff",
      "priority": "Chase Sapphire Preferred (92% feasibility)",
      "timelineWeeks": 4,
      "expectedOutcome": "Potential APR reductions saving $600 annually"
    }
  },
  "message": "Creditor negotiation strategies generated"
}
```

#### Response Schema

- **creditProfile**: User's credit strength and financial leverage
- **debtRanking**: All debts scored by negotiation feasibility (descending)
  - _feasibilityScore_: 0–100 (higher = more winnable)
  - _feasibilityRank_: high/moderate/low
  - _negotiationSuccessProbability_: Estimated % chance of success
- **topNegotiationTargets**: Detailed playbooks for top 1–3 debts
  - _negotiationProfile_: Credit score, payment quality, account age
  - _negotiationOptions_: Scripts for APR, fees, settlement, hardship
  - _recommendedApproach_: Step-by-step action plan
  - _successFactors_: Why this debt is negotiable
- **aggregatedMetrics**: Portfolio-level savings estimate
  - _estimatedAnnualSavings_: From highest-feasibility debt
  - _potentialMultipleDebtSavings_: If all top debts negotiate successfully
- **recommendation**: Overall strategy and timeline

---

## Implementation Details

### Core Algorithm

1. **Assess Leverage**: Score credit strength (credit score) + payment quality (history) + tenure (how long held)
2. **Rank Debts**: Calculate feasibility for each debt using weighted formula
3. **Generate Scripts**: Create personalized narratives based on credit tier and debt type
4. **Generate Playbooks**: Full strategic guide (all 4 negotiation approaches) for top 3 debts
5. **Return Ranking**: All debts scored + detailed playbooks for highest-feasibility targets

### Key Methods

- **`assessCreditStrength()`**: Classify credit tier; return leverage score (0–1.0)
- **`scorePaymentQuality()`**: Analyze late payment history; return quality score (0–100)
- **`calculateTenureMultiplier()`**: Months held; return multiplier (0.3–1.3)
- **`generateNegotiationScript()`**: Create APR/fee/settlement/hardship scripts
- **`rankDebtsByFeasibility()`**: Score all debts; sort by negotiability
- **`generatePlaybook()`**: Full strategic guide for single debt (all negotiation options)
- **`optimize()`**: Main orchestrator; fetch payment histories, rank debts, generate top playbooks

---

## Files Changed

### Created
- **`backend/services/creditorNegotiationAssistantService.js`** (~800 lines)
  - Singleton service instance exported by default
  - Full creditor negotiation logic with script generation

### Modified
- **`backend/routes/debts.js`**
  - Added import: `creditorNegotiationAssistantService`
  - Added endpoint: `POST /api/debts/negotiate/suggest` (~40 lines)
  - Includes 8 body validators for debts, credit score, options

---

## Integration Points

### External Dependencies
- `express-validator` for input validation (array, object, isNumeric, custom)
- `ApiResponse` utility class for standardized HTTP responses
- `asyncHandler` middleware for error handling
- Database query for payment history (fetch last 24 months of transaction records)

### Downstream Integration
- Could feed negotiation results into payment plan generation (APR reduction → lower minimum payment)
- Could trigger alerts when negotiation success logged (update debt APR in system)
- Could track negotiation outcomes over time (success/failure by creditor type)
- Could recommend settlement vs. payoff based on success probability

---

## Example Workflows

### Workflow 1: Excellent Credit, Old Account

**Profile**:
- Credit Score: 780 (excellent)
- Credit Card: 18.5% APR, $5,000 balance, opened 2017 (8 years)
- Payment History: Perfect (no late payments)

**Analysis**:
- Feasibility: 95 (excellent credit + perfect history + long tenure)
- Recommended: **Lead with loyalty angle** ("I've been with you 8 years with perfect payments")
- Success Probability: 70% (excellent position)

**Output**:
- Open with APR reduction (15%)
- Expected savings: $175/year
- Playbook: 5-step script + objection handling

---

### Workflow 2: Fair Credit, Recent High Balance Jump

**Profile**:
- Credit Score: 670 (fair)
- Credit Card: 22% APR, $8,000 balance (jumped from $2,000 in 3 months), opened 2022
- Payment History: 2 late payments in last 6 months

**Analysis**:
- Feasibility: 45 (fair credit + spotty history + short tenure)
- Recommended: **Lead with hardship angle** ("I want to prevent further delinquency")
- Success Probability: 30% (limited leverage)

**Output**:
- Downgrade to fee waiver request or hardship program
- Settlement option: Offer 70% ($5,600) to close
- Playbook: Emphasize commitment to working together

---

### Workflow 3: Good Credit, Multiple Debts

**Profile**:
- Credit Score: 715 (good)
- 3 debts: Credit Card (92% feasibility), HELOC (76%), Auto Loan (48%)
- Payment History: Excellent overall

**Analysis**:
- Prioritize credit card (65% success)
- Defer auto loan negotiation (waste of effort)
- Secondary target: HELOC (50% success)

**Output**:
- Rank 1: CC ($600 potential savings)
- Rank 2: HELOC ($200 potential savings)
- Rank 3: Auto Loan (not worth negotiating)
- Total Portfolio Strategy: "Focus on high-feasibility debts; auto loan not worth time"

---

## Acceptance Criteria

✅ Credit score maps to 5-tier leverage model (excellent/good/fair/poor/very-poor)  
✅ Payment quality scores from 0–100 based on late payment frequency  
✅ Account tenure multiplier scales 0.3–1.3 by months held  
✅ Creditor-specific benchmarks for 6 debt types (APR, settlement %, success rate)  
✅ Personalized scripts generated for APR reduction, fee waiver, settlement, hardship  
✅ Debt ranking by feasibility (0–100) using weighted formula  
✅ Full playbooks for top 1–3 debts with step-by-step action plans  
✅ API endpoint validates all inputs; handles missing optional fields  
✅ Aggregated metrics (portfolio savings estimate, high-feasibility count)  
✅ Error handling graceful (missing debts, invalid credit score)  

---

## PR Checklist

- [x] Code follows existing project patterns (service singletons, asyncHandler, ApiResponse)
- [x] All monetary values rounded to cent precision
- [x] Input validation comprehensive (type, range, ISO date checks)
- [x] No errors on static analysis
- [x] Creditor benchmarks based on realistic industry data
- [x] Script generation personalized by credit tier and debt type
- [x] Feasibility scoring combines credit strength, payment quality, tenure
- [x] Playbook generation provides actionable step-by-step guidance
- [x] Success probabilities calibrated to debt type
- [x] Response schema transparent and decision-ready
- [x] Backward compatibility maintained (no API breaks)

---

## Future Enhancements

1. **Outcome Tracking**: Log negotiation results (success/failure); refine success probabilities over time
2. **Script A/B Testing**: "Which opening script works best for Chase?" — track conversations
3. **Hardship Program Library**: Federated hardship programs by creditor (Discover has different terms than AmEx)
4. **Competitor Rate Scraping**: Real-time competitor rates (vs. static benchmarks)
5. **Co-Applicant Analysis**: Dual-income households; which person should call creditor?
6. **Seasonal Negotiation Timing**: "Best time to call creditor X is Q4" (based on historical success rates)
7. **Multi-Round Negotiation**: Script for "I went from 18% to 15%; can we get to 12%?" (round 2)
8. **Hardship Verification**: Check creditor's income verification requirements before requesting hardship
9. **Post-Negotiation Tracking**: Monitor account for promised changes (rate actually reduced? Fee actually waived?)
10. **Negotiation Success Rate Dashboard**: Show user trends (% successful negotiations by debt type over time)

---

## Notes

- Settlement calculations assume creditor agrees to "pay in full" in exchange for lump sum; some creditors require continued payments
- APR reduction estimates are industry benchmarks; actual success depends on individual creditor policies
- Hardship programs may require income verification or proof of financial difficulty (unemployment letter, etc.)
- Success probabilities based on creditor type, not individual creditor (all credit cards ~65%, not Chase-specific)
- Credit card APRs typically negotiable; auto loans, mortgages rarely negotiate
- Perfect payment history is strongest negotiating asset; emphasize 100% on-time record
- "Recent competitor rates" statement most effective with credit cards and personal loans (low switching costs)
- Settlement impacts credit score for 7 years; recommend only if cash flow critical
- Some creditors may require 6+ months of hardship before offering programs
- Follow-up call 30–45 days after negotiation essential (confirm changes applied to account)
