# Issue #654: AI-Powered Smart Asset Allocation Advisor

## Overview
Implement intelligent asset allocation recommendations powered by AI/ML to help users build and optimize portfolios based on their unique financial situation, goals, and risk tolerance.

## Problem Statement
- Users don't know optimal asset allocation
- Allocation needs vary by age, goals, income, risk tolerance
- Allocation should adapt as market conditions change
- Hard to validate if current allocation is appropriate
- No guidance on glide path adjustments

## Solution Components

### 1. User Profiling System
**Purpose:** Understand user's unique situation and risk tolerance

**Data Points:**
- Age & retirement timeline
- Income level & job stability
- Risk tolerance (conservative/moderate/aggressive)
- Financial goals (retirement, home, education)
- Timeline to each goal
- Existing portfolio value
- Upcoming expenses
- Debt situation

**Output:** Risk Profile Score (0-100)

**Algorithm:**
```
Risk Score = (Age Factor × 15%) + (Income Factor × 20%) + 
             (Risk Tolerance × 30%) + (Time Horizon × 20%) + 
             (Goal Importance × 15%)
```

### 2. Goal-Based Allocation Calculator
**Purpose:** Calculate allocation needed to reach specific targets

**Features:**
- For each goal: calculate required annual return
- Map to asset classes (equities, bonds, alternatives)
- Calculate allocation percentage
- Show funding gaps

**Example:**
- Goal: $1M by age 65 (20 years)
- Current: $200K
- Required annual return: 8.7% → 70% equities / 30% bonds

### 3. ML-Powered Allocation Engine
**Purpose:** Recommend optimal allocation using historical data

**Factors Considered:**
- Risk-adjusted returns by asset class
- Correlation matrix between assets
- Current market regime (bull/bear/sideways)
- Volatility conditions (VIX levels)
- Interest rate environment

**Optimization Method:** Modern Portfolio Theory
- Minimize variance for target return
- Maximize Sharpe ratio for risk tolerance

### 4. Market Adaptation System
**Purpose:** Adjust recommendations based on current conditions

**Triggers:**
- VIX > 30 → reduce equity allocation
- Interest rates rising → reduce bond duration
- Recession signals → increase defensive allocation
- Bull market extended → trim equities

### 5. Glide Path Planning
**Purpose:** Auto-adjust allocation as goals approach

**Strategy:**
- 20+ years to goal: Aggressive (80/20)
- 10-20 years: Moderate (60/40)
- 5-10 years: Conservative (40/60)
- < 5 years: Very conservative (20/80)

**Features:**
- Automatic yearly adjustments
- Preserve principal as goal date approaches
- Lock in gains before key milestones

### 6. Scenario Projections
**Purpose:** Show potential outcomes under different scenarios

**Scenarios:**
- Base case (50th percentile)
- Optimistic (90th percentile)
- Pessimistic (10th percentile)
- Reverse sequence risk
- Market crash scenarios

**Output:** Range of ending values, success probability

### 7. Peer Benchmarking
**Purpose:** Compare allocation to similar profiles

**Comparison Groups:**
- By age decade (30s, 40s, 50s, etc.)
- By income level
- By risk tolerance
- By goal type

**Metrics:**
- Peer allocation distribution
- Percentile ranking
- Common deviations

### 8. One-Click Apply
**Purpose:** Instantly apply recommended allocation

**Features:**
- Generate rebalancing trades
- Tax-aware rebalancing
- Transaction summary
- Multi-account support

## Database Schema

### New Tables (8)

1. **userProfiles**
   - userId, riskTolerance, riskScore, ageGroup
   - incomeLevel, jobStability, employmentType
   - debtRatio, liquidityRatio, netWorth
   - updatedAt

2. **allocationRecommendations**
   - userId, vaultId, recommendationDate
   - equityPercentage, bondPercentage, cashPercentage
   - alternativesPercentage, realEstatePercentage
   - confidenceScore, expectedReturn, expectedVolatility
   - sharpeRatio, status (active/archived)

3. **allocationTargets**
   - userId, vaultId, goalId
   - equityPercentage, bondPercentage, cashPercentage, alternativesPercentage
   - targetDate, expectedReturn
   - fundingGap, probability

4. **glidePaths**
   - userId, vaultId, goalId
   - startAllocation (JSON), endAllocation (JSON)
   - startDate, targetDate
   - adjustmentFrequency (yearly/quarterly)
   - currentAllocation (JSON), nextAdjustmentDate

5. **scenarioProjections**
   - userId, vaultId, scenarioType (base/optimistic/pessimistic/crash)
   - periodStart, periodEnd
   - projections (JSON: year by year)
   - successProbability, endingValue
   - volatility, maxDrawdown

6. **assetClassAllocations**
   - userId, vaultId, allocationId
   - assetClass (equities, bonds, cash, alternatives, real_estate)
   - percentage, targetValue, currentValue
   - variance, drift

7. **peerBenchmarks**
   - profileGroup (age_income_risk combination)
   - assetClass, medianAllocation, p25, p75
   - count, lastUpdated

8. **allocationChangeHistory**
   - userId, vaultId, allocationId
   - previousAllocation (JSON), newAllocation (JSON)
   - reason, changedDate, changedBy

## Service Architecture

### userProfiler.js
- analyzeProfile(userId) → Risk score
- calculateRiskScore() → 0-100 score
- updateProfile() → Save changes
- getProfileSummary()

### allocationRecommender.js
- recommendAllocation(userId) → Optimal allocation
- optimizePortfolio() → Modern Portfolio Theory
- calculateForReturn(targetReturn) → Asset mix
- compareAllocationStrategies()

### glidepathCalculator.js
- generateGlidePath(userId, goalId) → Yearly adjustments
- calculateAdjustment(years) → Current allocation
- simulateGlidePath() → Full projection
- scheduleAutoAdjustments()

### scenarioProjector.js
- projectScenarios(userId, allocation) → Multiple outcomes
- runMonteCarloSimulation() → 1000+ iterations
- calculateSuccessProbability() → % chance of success
- analyzeReverseSequenceRisk()

### peerBenchmarking.js
- getPeerGroup(userId) → Similar profiles
- compareAllocation(userId) → vs peers
- calculatePercentile() → 0-100 rank
- identifyAnomalies()

## Implementation Timeline
- **Phase 1 (Days 1-3):** User profiling + database
- **Phase 2 (Days 4-6):** Allocation recommender + goal calculator
- **Phase 3 (Days 7-10):** Glide path + scenario projections
- **Phase 4 (Days 11-15):** Peer benchmarking + market adaptation
- **Phase 5 (Days 16-20):** API endpoints
- **Phase 6 (Days 21-25):** Frontend components
- **Phase 7 (Days 26-30):** Testing + documentation

## Key Formulas

### Risk Score Calculation
```
RiskScore = (Age/70 × 15) + (min(Income/200k, 1) × 20) + 
            (RiskTolerance × 30) + (TimeHorizon/50 × 20) + 
            (GoalImportance × 15)
```

### Required Annual Return
```
RequiredReturn = ((TargetValue/CurrentValue)^(1/Years)) - 1
```

### Glide Path Allocation
```
EquityPercentage = StartEquity - ((StartEquity - EndEquity) × (YearsElapsed / TotalYears))
```

### Success Probability (Monte Carlo)
```
SuccessProbability = (Successful Simulations / Total Simulations) × 100
```

## Deliverables
1. ✅ Implementation plan (this document)
2. ⏳ Database migration (0024_asset_allocation.sql)
3. ⏳ Updated schema.js with 8 new tables
4. ⏳ userProfiler.js service
5. ⏳ allocationRecommender.js service
6. ⏳ glidepathCalculator.js service
7. ⏳ scenarioProjector.js service
8. ⏳ peerBenchmarking.js service
9. ⏳ API endpoints (15+ routes)
10. ⏳ Frontend components (6+ React components)
11. ⏳ Unit tests (80%+ coverage)
12. ⏳ Integration tests

## Success Criteria
- ✅ Risk scores calculated accurately
- ✅ Recommendations match MPT optimization
- ✅ Glide paths auto-adjust on schedule
- ✅ Scenario projections within 5% error margin
- ✅ All recommendations stored and retrievable
- ✅ Peer benchmarking groups validated
- ✅ Zero data loss on allocation changes

## Notes
- Use historical S&P 500, Bond, and mixed return data for Monte Carlo
- VIX data needed for market adaptation triggers
- Consider tax implications in rebalancing
- Privacy: anonymize peer benchmarking data
- Real estate allocation needs appraisal data integration
