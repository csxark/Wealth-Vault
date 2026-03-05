# Debt Management & Payoff Planning - Implementation Guide

## Issue #665: Comprehensive Debt Management Solution

This implementation provides a complete debt management system with payoff strategies, amortization schedules, prepayment simulations, and timeline projections.

---

## Database Schema (Migration 0027)

### Core Tables

#### 1. **debts**
- Stores individual debt records for each user
- Tracks principal, current balance, APR, and payment status
- Supports multiple debt types: credit cards, personal loans, mortgages, auto loans, student loans, medical, etc.
- Fields:
  - `principal_amount`: Original loan amount
  - `current_balance`: Currently owed amount
  - `annual_rate`: APR as decimal (e.g., 5.5 for 5.5%)
  - `monthly_payment`: Minimum required payment
  - `payoff_date`: Projected or actual payoff date
  - `status`: active, paid_off, deferred, closed, charged_off

#### 2. **debt_payments**
- Records all payment history and transactions
- Tracks principal and interest breakdown for each payment
- Identifies extra payments for accelerated payoff analysis
- Fields:
  - `payment_amount`: Total payment made
  - `principal_amount`: Principal portion
  - `interest_amount`: Interest portion
  - `is_extra_payment`: Flag extra/accelerated payments
  - `payment_method`: online, check, auto_debit, phone, in_person

#### 3. **amortization_schedules**
- Stores computed amortization schedules (versioned)
- Tracks different schedule types: standard, accelerated, custom
- Maintains history for schedule comparisons
- Fields:
  - `schedule_type`: How the schedule was computed
  - `total_months`: Full payoff period
  - `total_interest`: Total interest over life
  - `is_current`: Most recent schedule flag

#### 4. **amortization_items**
- Individual payment line items within a schedule
- Month-by-month breakdown with principal/interest split
- Includes beginning and ending balance for each payment
- Essential for detailed payment projections

#### 5. **payoff_strategies**
- User's chosen debt payoff strategy
- Supports: avalanche, snowball, hybrid, custom
- Stores priority order of debts
- Calculates projections (payoff months, freedom date, interest saved)
- Fields:
  - `strategy_type`: avalanche, snowball, custom
  - `extra_monthly_payment`: Additional payments beyond minimums
  - `priority_order`: JSON array of debt IDs in priority sequence
  - `projected_payoff_months`: Estimated months to fully pay off
  - `projected_freedom_date`: Estimated date debt-free

#### 6. **payoff_simulations**
- Results of running a strategy over time
- Stores month-by-month simulation results
- Enables comparison between strategies
- Tracks interest saved and time accelerated
- Can mark favorite simulations for reference

#### 7. **payoff_simulation_items**
- Month-by-month breakdown of simulation
- Shows payments, interest, principal, and remaining balance
- Tracks cumulative totals through simulation
- Essential for timeline visualization

#### 8. **prepayment_analyses**
- Analysis of prepayment opportunities for individual debts
- Calculates interest savings from extra payments
- Estimates new payoff dates
- Includes ROI and opportunity cost analysis
- Provides recommendations (recommended/neutral/not_recommended)

#### 9. **debt_milestones**
- Important debt payment events and achievements
- Tracks: 25% paid, 50% paid, 75% paid, 100% paid off
- Can mark actual achievement dates
- Enables gamification and motivation

### Database Views

#### v_debt_summary
- Real-time snapshot of all user debts
- Aggregate counts by type (credit cards, personal loans, etc.)
- Average APR and highest/lowest rates
- Total balance and monthly obligations

#### v_debt_payoff_timeline
- Chronological payoff schedule across all debts
- Shows when each debt will be paid off
- Includes payment details month by month

#### v_payoff_comparison
- Compare active strategies side-by-side
- Shows projected months and freedom dates
- Interest savings projections

### Helper Functions

#### calculate_payoff_date()
- Calculates projected payoff date given:
  - Current balance
  - APR
  - Payment amount
- Returns timestamp or NULL if never pays off

#### generate_amortization_schedule()
- Generates full amortization schedule for a debt
- Returns month-by-month payment breakdown
- Includes principal, interest, and balance progression

---

## Services Implementation

### 1. **debtAmortizationService.js**
Core amortization calculations and schedule generation.

**Key Methods:**

```javascript
// Calculate monthly payment (standard amortization formula)
calculateMonthlyPayment(principal, annualRate, termMonths)

// Calculate months to pay off given payment amount
calculatePayoffMonths(balance, annualRate, monthlyPayment)

// Generate full amortization schedule
generateAmortizationSchedule(balance, annualRate, monthlyPayment, startDate)

// Generate schedule with extra payments
generatePrepaymentSchedule(balance, annualRate, monthlyPayment, extraMonthlyPayment)

// Store schedule in database
storeAmortizationSchedule(tenantId, userId, debtId, schedule, scheduleType)

// Get current schedule for debt
getCurrentSchedule(tenantId, debtId)

// Calculate interest savings from prepayment
calculateInterestSavings(standardSchedule, prepaymentSchedule)

// Analyze prepayment opportunity
analyzePrepayment(tenantId, userId, debtId, extraPayment, paymentFrequency)

// Export schedule as CSV
exportScheduleAsCSV(tenantId, debtId)
```

### 2. **payoffStrategyService.js**
Strategy generation and comparison for debt payoff.

**Strategies:**

**Avalanche Strategy**
- Targets highest APR debts first
- Mathematically optimal for minimizing total interest
- Best for large interest savings
- Method: Sort by APR (descending), prioritize highest rates

**Snowball Strategy**
- Targets smallest balance debts first
- Provides psychological wins with quick debt payoffs
- Best for motivation and momentum
- Method: Sort by balance (ascending), prioritize smallest amounts

**Hybrid Strategy**
- Balanced 60/40 approach
- Combines snowball motivation with avalanche math
- Score: 60% APR weight + 40% balance weight
- Best for mixed debt situations

**Key Methods:**

```javascript
// Generate strategies
generateAvalancheStrategy(tenantId, userId, extraMonthlyPayment)
generateSnowballStrategy(tenantId, userId, extraMonthlyPayment)
generateHybridStrategy(tenantId, userId, extraMonthlyPayment)

// Simulate strategy
simulateStrategy(tenantId, userId, strategyId, monthsToSimulate)

// Compare strategies
compareStrategies(tenantId, userId, monthsToSimulate)

// Create and save strategy
createStrategy(tenantId, userId, strategyData)

// Get recommendations
getRecommendations(tenantId, userId)
```

### 3. **debtPayoffTimelineService.js**
Timeline generation, milestones, and freedom date calculations.

**Key Methods:**

```javascript
// Generate timeline for all debts
generateTimelineForAllDebts(tenantId, userId)

// Generate timeline for single debt
generateTimelineForDebt(tenantId, userId, debtId)

// Calculate freedom date (when all debts paid off)
calculateFreedomDate(tenantId, userId)

// Get countdown to freedom
getPayoffCountdown(tenantId, userId)

// Project balance at future date
projectBalanceAtDate(tenantId, userId, targetDate)

// Get/store milestones
storeMilestones(tenantId, userId, debtId, milestones)
```

**Milestones Generated:**
- 25% principal paid
- 50% principal paid
- 75% principal paid
- 100% debt paid off (freedom date)
- 50% interest paid
- Custom user-defined milestones

---

## API Endpoints

### Amortization Schedules

#### GET `/api/debts/:id/amortization`
Get amortization schedule for specific debt
```json
Response:
{
  "debt": { "id": "...", "name": "Credit Card" },
  "schedule": {
    "schedule": [
      {
        "paymentNumber": 1,
        "paymentDate": "2026-04-02",
        "principalAmount": 250.00,
        "interestAmount": 35.00,
        "paymentAmount": 285.00,
        "endingBalance": 9750.00
      },
      ...
    ],
    "totalInterest": 2150.00,
    "totalPayments": 12150.00,
    "payoffDate": "..." ,
    "months": 60
  }
}
```

#### GET `/api/debts/:id/amortization/export`
Export amortization schedule as CSV file

### Payoff Strategies

#### POST `/api/debts/strategies/avalanche`
Generate and save avalanche strategy
```json
Request: { "extraMonthlyPayment": 100 }
Response: Strategy saved with projections
```

#### POST `/api/debts/strategies/snowball`
Generate and save snowball strategy

#### POST `/api/debts/strategies/hybrid`
Generate and save hybrid strategy

#### GET `/api/debts/strategies/recommendations`
Get AI-powered strategy recommendation based on debt profile

#### GET `/api/debts/strategies/compare`
Compare all active strategies side-by-side

### Simulations

#### POST `/api/debts/simulate`
Run simulation of a strategy
```json
Request: { "strategyId": "...", "monthsToSimulate": 360 }
Response: {
  "simulation": { "id": "...", "totalMonthsToPayoff": 67, ... },
  "items": [ month-by-month breakdown ],
  "summary": { "monthsToPayoff": 67, "freedomDate": "...", "totalInterestPaid": ... }
}
```

### Prepayment Analysis

#### POST `/api/debts/:id/prepayment-analysis`
Analyze impact of extra payments
```json
Request: { "extraPaymentAmount": 200 }
Response: {
  "analysis": { "monthsSaved": 15, "interestSaved": 1250.00, ... },
  "savings": { "standardInterest": 5000, "prepaymentInterest": 3750, ... },
  "prepaymentSchedule": { full schedule with extra payments }
}
```

### Timeline & Freedom Date

#### GET `/api/debts/timeline/all`
Get complete payoff timeline for all debts
```json
Response: {
  "debts": [ array of user debts ],
  "debtPayoffs": [ 
    { "debtName": "...", "payoffDate": "...", "monthsToPayoff": 60, ... }
  ],
  "freedomDate": "2032-03-15",
  "summary": {
    "totalDebts": 5,
    "totalBalance": 75000.00,
    "totalMonthlyPayment": 2500,
    "monthsToFreedom": 84
  }
}
```

#### GET `/api/debts/:id/timeline`
Get detailed timeline for specific debt
```json
Response: {
  "debt": { debt details },
  "payoffDate": "...",
  "totalMonths": 60,
  "milestones": [
    { "type": "principal_threshold", "name": "25% paid off", "month": 15, "date": "..." },
    ...
  ],
  "annualSummary": [
    { "year": 1, "totalPayment": 15000, "principalPaid": 3000, "interestPaid": 12000 },
    ...
  ]
}
```

#### GET `/api/debts/countdown`
Get countdown to financial freedom
```json
Response: {
  "freedomDate": "2032-03-15",
  "daysRemaining": 2187,
  "yearsRemaining": 6.0,
  "monthsRemaining": 72,
  "totalDebts": 5,
  "totalBalance": 75000.00,
  "totalMonthlyPayment": 2500.00,
  "estimatedInterestRemaining": 125000.00
}
```

#### POST `/api/debts/project-balance`
Project debt balance at future date
```json
Request: { "targetDate": "2028-12-31" }
Response: {
  "projectionDate": "2028-12-31",
  "projections": [
    { "debtName": "Credit Card", "currentBalance": 10000, "projectedBalance": 7500, ... },
    ...
  ],
  "totalProjectedBalance": 45000.00
}
```

---

## Implementation Features

### 1. Debt Inventory System
- Store unlimited number of debts
- Track by type, creditor, account number
- Record payment history
- Support for multiple debt types
- Soft delete/deactivation of paid debts

### 2. Payoff Strategy Generators
- **Avalanche**: Highest interest first (mathematically optimal)
- **Snowball**: Smallest balance first (psychological motivation)
- **Hybrid**: Balanced 60/40 approach
- **Custom**: User-defined priority order
- Strategy comparison and recommendations

### 3. Amortization Schedules
- Generate month-by-month payment breakdowns
- Show principal vs. interest split
- Track remaining balance progression
- Version control for schedule changes
- Export to CSV format

### 4. Prepayment Simulations
- Model impact of extra monthly payments
- Calculate interest savings
- Project early payoff dates
- Compare prepayment scenarios
- Analyze ROI vs. investment alternatives

### 5. Payoff Timelines
- Visual timeline of all debt payoffs
- Freedom date calculation
- Annual summary views
- Progress milestones (25%, 50%, 75%, 100%)
- Interest threshold milestones
- Project future balances at any date

### 6. Advanced Calculations
- Handles variable interest rates
- Supports various payment frequencies
- Accounts for missed payments
- Calculates opportunity cost
- Provides default risk assessment

---

## Usage Examples

### Create Avalanche Strategy with Extra Payments

```javascript
POST /api/debts/strategies/avalanche
Body: { "extraMonthlyPayment": 500 }

// Response includes:
// - Debt priority order (highest APR first)
// - Projected payoff months
// - Freedom date
// - Interest saved vs. minimum payments
```

### Simulate Payoff Timeline

```javascript
POST /api/debts/simulate
Body: { "strategyId": "strategy-uuid", "monthsToSimulate": 360 }

// Response includes:
// - Month-by-month simulation
// - Cumulative amounts
// - Current payoff predictions
// - Debt elimination schedule
```

### Analyze Prepayment Impact

```javascript
POST /api/debts/{creditCard}/prepayment-analysis
Body: { "extraPaymentAmount": 200 }

// Response includes:
// - Months saved
// - Interest saved
// - New payoff date
// - Full prepayment schedule
```

### Get Freedom Date Countdown

```javascript
GET /api/debts/countdown

// Response shows exact date whenall debts will be paid off
// Includes days, months, years remaining
// Shows total interest still to be paid
```

---

## Data Models

### Debt Model
```javascript
{
  id: UUID,
  tenantId: UUID,
  userId: UUID,
  name: string,
  debtType: 'credit_card' | 'personal_loan' | 'mortgage' | 'auto_loan' | 'student_loan' | 'medical' | 'other',
  creditorName: string,
  principalAmount: decimal,
  currentBalance: decimal,
  annualRate: decimal,
  monthlyPayment: decimal,
  originationDate: timestamp,
  payoffDate: timestamp,
  status: 'active' | 'paid_off' | 'deferred' | 'closed' | 'charged_off',
  isActive: boolean
}
```

### Amortization Schedule Item
```javascript
{
  paymentNumber: integer,
  paymentDate: date,
  principalAmount: decimal,
  interestAmount: decimal,
  paymentAmount: decimal,
  beginningBalance: decimal,
  endingBalance: decimal
}
```

### Strategy Model
```javascript
{
  strategyType: 'avalanche' | 'snowball' | 'hybrid' | 'custom',
  extraMonthlyPayment: decimal,
  priorityOrder: array<UUID>,
  projectedPayoffMonths: integer,
  projectedFreedomDate: timestamp,
  projectedInterestSaved: decimal
}
```

---

## Performance Optimizations

1. **Amortization Calculations**: Limit to 600 months (50 years) max
2. **Schedule Storage**: Version control prevents duplicate storage
3. **Indexed Queries**: Tenant/user/status indexes for fast lookups
4. **Materialized Views**: Pre-computed summary and comparison data
5. **CSV Export**: Generated on-demand, not stored
6. **Simulation Caching**: Can save favorite simulations

---

## Error Handling

- Validates all monetary amounts (non-negative)
- Checks for missing required fields
- Handles edge cases (zero interest, immediate payoff)
- Validates debt ownership before operations
- Multi-tenant isolation

---

## Potential Enhancements

1. **AI Recommendations**: ML models for optimal strategy based on income/spending
2. **Debt Consolidation**: Suggest consolidation opportunities
3. **Refinance Detection**: Monitor market rates for refi opportunities
4. **Predictive Analytics**: Forecast future debts
5. **Mobile Notifications**: Push notifications for milestones
6. **Social Features**: Share payoff progress with accountability partners
7. **API Integrations**: Link to bank accounts for automatic payment history
8. **Scenario Analysis**: Monte Carlo simulations for income volatility

---

## Conclusion

This implementation provides a comprehensive debt management solution with:
- Complete inventory tracking
- Multiple payoff strategies
- Detailed amortization schedules
- Accurate prepayment simulations
- Clear payoff timelines and freedom dates

Users can now make informed decisions about their debt payoff strategies and track progress toward financial freedom.
