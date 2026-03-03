# Issue #746 Implementation - Variable APR & Repricing-Aware Optimizer

## Overview
Implemented a variable APR optimizer that models debt payoff under changing interest rates with stress-band scenarios (base/optimistic/pessimistic), supporting avalanche/snowball/hybrid strategies.

## Service: `debtVariableAprOptimizerService.js`
- **Location**: `backend/services/debtVariableAprOptimizerService.js`
- **Size**: 410 lines
- **Purpose**: Variable APR rate schedule support and strategy optimization under different rate scenarios

### Key Methods

#### `getEffectiveApr(baseApr, rateSchedule, month)`
- Retrieves the effective APR for a debt at a given month
- Parses future rate changes from schedule and applies chronologically
- Returns applicable APR based on current month

#### `createStressBandDebts(baseDebts, stressBand)`
- Creates modified debt set for stress band scenario
- **Base case**: No adjustment (current rates)
- **Optimistic**: -1% APR adjustment (rates favorable)
- **Pessimistic**: +2% APR adjustment (rates unfavorable)

#### `simulatePayoffStrategy(debts, strategy, rateSchedules, horizonMonths)`
- Month-by-month amortization simulator
- **Strategies supported**:
  - **Avalanche**: Targets highest APR debt first (interest-minimizing)
  - **Snowball**: Targets smallest balance debt first (momentum-building)
  - **Hybrid**: Targets highest APR-to-balance ratio (balanced)
- **Simulation order per month**:
  1. Look up effective APR from rate schedule
  2. Accrue monthly interest (APR / 12 / 100)
  3. Apply minimum payments
  4. Apply strategic extra payments (10% of total minimums)
  5. Detect debt closures
  6. Record monthly breakdown
- **Output**: Months to payoff, total interest paid, monthly-level breakdown with debt states

#### `recommendStrategy(baseDebts, strategies, rateSchedules, horizonMonths)`
- Evaluates all strategies under all three stress bands
- Compares total interest paid for each strategy within each band
- Returns recommended best strategy per band with savings vs alternatives
- Enables user to see "best approach for different rate environments"

#### `optimize(userId, payload)` [Main Entry Point]
- Retrieves user's active debts
- Validates rate schedules (month + apr per debt schedule)
- Calls `recommendStrategy` for comprehensive analysis
- Returns scenarios across all stress bands + baseline

## API Endpoint: `POST /api/debts/variable-apr/optimize`

### Request Validation (15 validators)
```json
{
  "horizonMonths": 360,  // 1-600, optional
  "strategies": ["avalanche", "snowball", "hybrid"],  // subset of valid strategies, optional
  "rateSchedules": {
    "debt-uuid-1": [
      {"month": 1, "apr": 5.0},
      {"month": 12, "apr": 6.5},
      {"month": 24, "apr": 7.0}
    ],
    "debt-uuid-2": [
      {"month": 6, "apr": 12.0}
    ]
  }
}
```

### Validation Details
- `horizonMonths`: Numeric, 1-600 range
- `strategies`: Each must be in ['avalanche', 'snowball', 'hybrid']
- `rateSchedules`: Object mapping debt IDs to rate change arrays
  - Each schedule entry: month (1-600), apr (0-50%)
- All rate months sorted chronologically; effective APR is last applicable rate

### Response Format
```json
{
  "success": true,
  "message": "Variable APR optimization complete with stress band scenarios",
  "data": {
    "baseline": {
      "monthsToPayoff": 48,
      "totalInterestPaid": 12450.00,
      "strategy": "current_minimum_payments"
    },
    "scenarios": [
      {
        "stressBand": "base",
        "description": "Base case (current rates)",
        "strategies": [
          {
            "strategy": "avalanche",
            "monthsToPayoff": 45,
            "totalInterestPaid": 11200.00,
            "monthlyBreakdown": [...]
          },
          {...}
        ],
        "recommended": {
          "strategy": "avalanche",
          "monthsToPayoff": 45,
          "totalInterestPaid": 11200.00,
          "estimatedSavings": [
            {
              "strategy": "snowball",
              "additionalInterest": 450.00,
              "monthsAdditional": 2
            }
          ]
        }
      },
      {
        "stressBand": "optimistic",
        "description": "Optimistic case (rates down)"
        ...
      },
      {
        "stressBand": "pessimistic",
        "description": "Pessimistic case (rates up)"
        ...
      }
    ],
    "analysis": {
      "debtCount": 3,
      "totalBalance": 50000.00,
      "averageAPR": 13.50,
      "rateScheduleCount": 2
    }
  }
}
```

## Key Features

### 1. Rate Schedule Support
- Debts can have multiple rate-change events
- Each event specifies month (when rate changes) and new APR
- Chronologically sorted; interest accrues at effective rate for each month

### 2. Stress-Band Scenarios
- **Base**: Current expected rates
- **Optimistic**: APR reduced by 1% (economic improvement scenario)
- **Pessimistic**: APR increased by 2% (economic downturn scenario)
- User sees strategy recommendations for each scenario

### 3. Strategy Comparison
- **Avalanche**: Mathematically optimal (minimizes interest)
- **Snowball**: Psychological wins (eliminate debts faster)
- **Hybrid**: Balanced approach (good APR targeting + balance progress)
- Each scenario shows which strategy is best under that rate environment

### 4. Repricing Awareness
- Recognizes rate changes mid-payoff (e.g., intro promo expiration)
- Recalculates strategy optimality as rates change
- Shows user how repricing events impact payoff timeline

## Files Changed

### Modified
- `backend/routes/debts.js`:
  - Line 28: Added import for `debtVariableAprOptimizerService`
  - Lines 913-975: Added new endpoint with 15 validation rules

### Created
- `backend/services/debtVariableAprOptimizerService.js` (410 lines)

## Integration Notes
- Uses existing `protect` middleware for auth
- Uses existing `asyncHandler` and `ApiResponse` patterns
- Reads from `debts` table (schema fragmentation handled via normalization)
- No data persistence (simulations in-memory only)
- Pairs well with Issue #745 (what-if simulator) for general payoff what-ifs
- Pairs with Issue #744 (consolidation recommender) as alternative strategy

## Testing Recommendations
1. **Single debt with rate schedule**: Add $100K credit card, promo 0% APR for 12 months then 18%
2. **Multiple debts, cross-band comparison**: 3 debts with different repricing timelines
3. **Edge case - no rate changes**: Verify defaults to single APR per debt
4. **Edge case - extreme APR swing**: Pessimistic scenario with +2% vs optimistic with -1%
5. **Strategy comparison**: Confirm avalanche most interest-efficient across all bands
