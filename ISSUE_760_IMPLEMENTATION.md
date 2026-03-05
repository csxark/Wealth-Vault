# Issue #760 Implementation - Automated Debt Payment Orchestrator

## Overview
Implemented an intelligent debt payment orchestration service that schedules and automates debt payments across multiple accounts with dynamic monthly rebalancing, rate change detection, and automated strategy adjustments.

## Service: `debtPaymentOrchestratorService.js`
- **Location**: `backend/services/debtPaymentOrchestratorService.js`
- **Size**: 520 lines
- **Purpose**: Orchestrate optimal payment allocation and automate debt payment scheduling

### Key Methods

#### `calculateAvailableCashFlow(userId, payload)`
- Calculates monthly available cash for debt payments
- Returns:
  - `monthlyIncome`: User's total monthly income
  - `monthlyExpenses`: User's total monthly expenses
  - `minCashBuffer`: Emergency buffer to maintain
  - `availableCashFlow`: Income - Expenses - Buffer (available for debt payments)
- Input: monthlyIncome, monthlyExpenses, minCashBuffer (optional, defaults to $500)

#### `detectRateChanges(userId, debtRecords)`
- Compares current APR against last known APR
- Returns array of rate changes with:
  - Previous and current APR
  - Change magnitude
  - Alert level (high if >2% change, medium otherwise)
- Enables proactive strategy adjustment if rates increase

#### `calculateTotalMinimumPayment(debts)`
- Sums minimum payment requirements across all active debts
- Simple utility for budget planning

#### `allocateExtraPayment(debts, extraPayment, strategy)`
- Intelligently distributes available extra payment among debts
- Supports three strategies:
  - **Avalanche**: Highest APR debt first (interest-minimizing)
  - **Snowball**: Smallest balance debt first (psychological wins)
  - **Hybrid**: Balanced APR-to-balance ratio
- Returns ordered allocation with priority ranking

#### `generatePaymentRecommendation(userId, payload)`
- Creates next month's complete payment recommendation
- Returns:
  - Cash flow analysis
  - Minimum payment requirement
  - Extra payment allocation plan (with strategy and priority)
  - Per-debt recommended payment breakdown
  - Rate change alerts
  - System alerts (low cash flow, high-interest debts)

#### `setupPaymentSchedule(userId, payload)`
- Initializes automated payment schedule configuration
- Configuration includes:
  - Strategy (avalanche/snowball/hybrid)
  - Payment frequency (monthly/bi-weekly/weekly)
  - Rebalance frequency (monthly/quarterly)
  - Auto-increase percentage (0-10%) when balance decreases
- Returns schedule config in "pending-activation" status

#### `rebalancePayments(userId, payload)`
- Recalculates optimal payment allocation based on latest debt data
- Detects:
  - Closed debts (to celebrate wins and redirect payments)
  - Balance reduction (to trigger auto-increase if configured)
  - APR changes
- Auto-increases payment intensity if balance reduced and auto-increase enabled

#### `orchestratePayments(userId, payload)` [Main Entry Point]
- Orchestrates full payment planning and scheduling
- Returns:
  - Next month's payment recommendation
  - Debt snapshot (total balance, minimum payments, average APR)
  - Orchestration capabilities (what automation is supported)
  - Next review date

## API Endpoints

### 1. `POST /api/debts/orchestration/orchestrate`
**Purpose**: Generate next month's payment recommendation with orchestration

**Request Validation (5 validators)**:
```json
{
  "monthlyIncome": 5000,
  "monthlyExpenses": 3200,
  "minCashBuffer": 500,
  "strategy": "avalanche",
  "autoIncreasePercentage": 5
}
```

**Response Format**:
```json
{
  "success": true,
  "message": "Debt payment orchestration generated with next-month recommendation",
  "data": {
    "status": "ready",
    "nextMonthRecommendation": {
      "month": "2026-03",
      "strategy": "avalanche",
      "cashFlow": {
        "monthlyIncome": 5000,
        "monthlyExpenses": 3200,
        "minCashBuffer": 500,
        "availableCashFlow": 1300
      },
      "minimumPayments": {
        "total": 800,
        "count": 3
      },
      "extraPayment": {
        "available": 500,
        "allocated": 450,
        "unallocated": 50
      },
      "paymentPlan": [
        {
          "debtId": "uuid-1",
          "debtName": "Credit Card",
          "currentBalance": 15000,
          "apr": 18.5,
          "minimumPayment": 300,
          "recommendedExtra": 400,
          "totalRecommendedPayment": 700,
          "allocationPriority": 1
        }
      ],
      "rateChanges": [],
      "alerts": [
        {
          "type": "high-interest-debt",
          "severity": "medium",
          "message": "1 high-interest debt(s) (>15% APR) detected"
        }
      ]
    },
    "debtSnapshot": {
      "totalDebts": 3,
      "totalBalance": 50000,
      "totalMinimumPayment": 800,
      "weightedAveragAPR": 12.45,
      "highestAPR": 18.5,
      "lowestAPR": 5.2
    },
    "orchestrationCapabilities": {
      "autoPaymentScheduling": true,
      "monthlyRebalancing": true,
      "rateChangeDetection": true,
      "alerting": true,
      "strategySupport": ["avalanche", "snowball", "hybrid"]
    },
    "nextReviewDate": "2026-04-03T..."
  }
}
```

### 2. `POST /api/debts/orchestration/schedule`
**Purpose**: Setup automated payment schedule with dynamic rebalancing

**Request Validation (4 validators)**:
```json
{
  "strategy": "avalanche",
  "frequency": "monthly",
  "rebalanceFrequency": "monthly",
  "autoIncreasePercentage": 5
}
```

**Response Format**:
```json
{
  "success": true,
  "message": "Automated payment schedule configured",
  "data": {
    "schedule": {
      "userId": "user-uuid",
      "strategy": "avalanche",
      "frequency": "monthly",
      "rebalanceFrequency": "monthly",
      "autoIncreasePercentage": 5,
      "startDate": "2026-03-03T...",
      "debts": 3,
      "status": "pending-activation",
      "createdAt": "2026-03-03T...",
      "config": {
        "strategy": "avalanche",
        "frequency": "monthly",
        "autoIncrease": true,
        "autoIncreasePercentage": 5,
        "rebalanceMonthly": true,
        "rebalanceQuarterly": false
      }
    }
  }
}
```

## Key Features

### 1. Cash Flow Analysis
- Tracks available monthly cash (`Income - Expenses - Buffer`)
- Intelligently splits between minimum payments and extra payments
- Dynamic: can vary month-to-month based on input

### 2. Intelligent Allocation
- Supports three strategies (avalanche, snowball, hybrid)
- Allocates extra payments to debts in priority order
- Respects balance constraints (doesn't over-allocate)

### 3. Rate Change Detection
- Compares current APR against historical baseline
- Triggers alerts for significant changes (>0.5% threshold)
- High-severity alert if change >2%
- Example: Card promo expires, rate jumps from 0% to 18%

### 4. Alert System
- **Rate change alerts**: When APRs shift
- **Cash flow alerts**: Low (<$100) or moderate (<$500) available payment capacity
- **High-interest alerts**: Debts with APR >15%
- Severity levels: high, medium

### 5. Auto-Increase
- Automatically increases payment intensity when balance decreases
- Configurable percentage (0-10% per reduction cycle)
- Example: Balance drops $5K → increase payment 5% automatically
- Maintains momentum after debt closed

### 6. Monthly Rebalancing
- Recalculates optimal payment allocation each month
- Detects and celebrates closed debts
- Redirects payments from closed debts to remaining ones
- Adjusts strategy if rates change

### 7. Payment Scheduling
- Supports multiple frequencies (monthly, bi-weekly, weekly)
- Can rebalance monthly or quarterly (flexible)
- Ready for integration with payment platforms

## Use Case Examples

### Scenario 1: Stable Income, Aggressive Payoff
- Monthly income: $5000, expenses: $3200, buffer: $500
- Available for debt: $1300
- Minimum payments: $800
- Extra available: $500
- Recommendation: Allocate $400 to high-APR card, $50 to next priority

### Scenario 2: Volatile Income with Auto-Increase
- Setup: Avalanche strategy, monthly rebalancing, 5% auto-increase
- Month 1: Balance $50K, recommend $500 extra
- Month 2: Principal reduced to $47K, auto-increase triggers → recommend $525 extra (5% raise)
- Month 3: Another $500 principal reduction → recommend $551 extra
- Result: Accelerating payoff due to debt reduction momentum

### Scenario 3: Rate Change Detected
- Card 1 was 0% promo, now expired to 18%
- Rate change alert: "Previous APR: 0%, Current APR: 18%, High severity"
- Automatic rebalancing: Avalanche strategy now prioritizes Card 1
- Payment recommendation updated to allocate extra to Card 1

## Files Changed

### Modified
- `backend/routes/debts.js`:
  - Line 30: Added import for `debtPaymentOrchestratorService`
  - Lines 1003-1067: Added two endpoints with 9 validation rules

### Created
- `backend/services/debtPaymentOrchestratorService.js` (520 lines)

## Integration Notes
- Uses existing `protect` middleware for auth
- Uses existing `asyncHandler` and `ApiResponse` patterns
- Reads from `debts` table (balance, APR, minimum payment)
- Ready for integration with payment platform APIs (future work)
- No data persistence (recommendations in-memory only)
- Can be paired with Issue #747 (adherence scoring) for realistic recommendations

## Next Steps (Not Implemented)
- Webhook listeners for payment platform confirmation
- Payment execution via ACH/credit transfer APIs
- Payment history tracking and reconciliation
- Failed payment retry logic
- Notification system for upcoming payments

## Testing Recommendations
1. **Basic recommendation**: $5K income, $3K expenses, $500 buffer → expect $1500 available
2. **Multi-debt allocation**: 3 debts with different APRs → expect highest-APR gets priority (avalanche)
3. **Rate change detection**: Simulate APR increase → expect alert with severity level
4. **Low cash flow alert**: <$100 available → expect alert
5. **Auto-increase**: Setup 5% auto-increase, track balance reduction → expect payment increase
6. **Different strategies**: Same debts with avalanche vs snowball → expect different allocation orders
