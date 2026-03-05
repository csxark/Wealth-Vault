# Multi-Goal Budget Guardrail Optimizer #714 - PR Description

## Problem Statement
Auto-adjustments to goal contributions can over-allocate to savings goals and starve essential spending categories. Users might find themselves unable to cover rent, utilities, and basic living expenses because too much of their budget is committed to goals.

## Solution Overview
Implemented a comprehensive **Guardrail Layer** that enforces minimum essential expense coverage before any goal allocations. The system calculates safe-to-allocate amounts and caps goal recommendations to ensure users always have enough for necessities.

## Key Features

### 1. **Smart Minimum Living Cost Calculation**
- Manual configuration or automatic calculation from historical spending
- Three calculation methods:
  - **Manual**: User-defined minimum (default: $2,000/month)
  - **Historical Average**: 6-month rolling average of protected category spending
  - **Percentile-Based**: Conservative 75th percentile estimate

### 2. **Safe Allocation Calculation**
Computes what's truly available for goals:
```
Income
- Essential Living Expenses
- Safety Buffer (15% default)
- Emergency Fund Contribution (3 months)
- Discretionary Minimum
= Safe-to-Allocate Amount
```

### 3. **Guardrail Enforcement**
- **Automatic**: Allocations > limit are capped
- **Strict Mode**: Violations recorded and reported
- **Override Support**: Manual overrides with approval workflow
- **Per-Goal Caps**: Different limits for priority vs. non-priority goals

### 4. **Real-Time Violation Detection**
Tracks 6 violation types:
- `insufficient_income` - Income can't cover essentials
- `insufficient_buffer` - No safety margin
- `essential_expense_shortfall` - Protected categories underfunded
- `emergency_fund_underfunded` - Emergency reserve inadequate
- `max_goal_allocation_exceeded` - Single goal over limit
- `cumulative_goal_overload` - Total goals > safea allocation

Severity levels: `warning`, `caution`, `critical`

### 5. **Compliance Tracking**
Historical snapshots track:
- Monthly compliance status (compliant/non-compliant)
- Health score (0-100)
- Violation counts by severity
- Variance from expected spending
- Trend analysis (improving/stable/declining)

## Database Schema

### Core Tables

**`budget_guardrail_policies`** (350 columns)
- Define per-user/vault guardrail rules
- Configure live-cost thresholds, buffer %, goal caps
- Enforcement mode (strict/lenient)

**`safe_allocation_calculations`** (15 key columns)
- Calculated safe amounts per period
- Income breakdown: essentials + buffers + discretionary
- Goal allocation limits per goal
- Confidence scores (0-100)
- Coverage status: protected/marginal/risky/insufficient

**`guardrail_allocations`** (17 key columns)
- Requested vs. approved amounts
- Reduction reasons and amounts
- Override tracking with approver info
- Implementation status

**`guardrail_violations`** (13 key columns)
- Types, severity, thresholds, shortfall amounts
- Detection timestamps
- Resolution tracking
- Recommended actions

**`guardrail_compliance_snapshots`** (14 key columns)
- Monthly compliance summaries
- Actual vs. expected spending
- Health score trends
- Violation counts

### Views
- `v_active_guardrail_policies` - All active user policies
- `v_latest_safe_allocations` - Most recent calculations
- `v_unresolved_violations` - Open issues requiring attention
- `v_guardrail_health_summary` - 90-day allocation health

## API Endpoints

### Policy Management
- `GET /api/v1/budget-guardrails/policies` - List user policies
- `GET /api/v1/budget-guardrails/policies/default` - Get/create default
- `POST /api/v1/budget-guardrails/policies` - Create new policy
- `PUT /api/v1/budget-guardrails/policies/{id}` - Update policy

### Safe Allocation Calculation
- `POST /api/v1/budget-guardrails/calculate` - Compute safe amounts
- `GET /api/v1/budget-guardrails/latest` - Get latest calculation

### Allocations
- `POST /api/v1/budget-guardrails/allocate` - Allocate to goal (with guardrails)
- `GET /api/v1/budget-guardrails/allocations/pending` - Pending approvals
- `POST /api/v1/budget-guardrails/allocations/{id}/approve` - Approve
- `POST /api/v1/budget-guardrails/allocations/{id}/override` - Override guardrail

### Violations & Compliance
- `GET /api/v1/budget-guardrails/violations` - Get unresolved violations
- `GET /api/v1/budget-guardrails/compliance/history` - Compliance trends
- `GET /api/v1/budget-guardrails/dashboard` - Full dashboard view

## How It Works

### Allocation Flow

1. **Request Submission**
   ```
   User requests $500 allocation to "Vacation" goal
   ```

2. **Safe Amount Calculation**
   ```
   Policy: $3,000 minimum living cost
   Monthly Income: $5,000
   
   Protected:
   - Essential Expenses: $2,800
   - Safety Buffer (15%): $750
   - Emergency Fund: $150
   - Discretionary Min: $200
   = $3,900
   
   Safe-to-Allocate: $5,000 - $3,900 = $1,100
   ```

3. **Goal Cap Calculation**
   ```
   Max allocation % to single goal: 50%
   Goal allocation cap: $1,100 × 50% = $550
   ```

4. **Enforcement Decision**
   ```
   Requested: $500
   Cap: $550
   Approved: $500 ✓ (within guardrail)
   ```

### Violation Example

```
Next month: Income drops to $4,200 (unexpected job cut)

Income: $4,200
Essential Expenses: $2,800
Safety Buffer: $630
Emergency Fund: $150
Discretionary: $200
= $3,780 protected

Safe-to-Allocate: $4,200 - $3,780 = $420

Pending allocations: $800 total

Violation Recorded:
- Type: max_goal_allocation_exceeded
- Severity: critical
- Threshold: $420
- Actual: $800
- Shortfall: $380 (90%)

Recommendation: Reduce goal allocations by 50% or increase income
```

## Configuration Examples

### Conservative (Default)
```json
{
  "minimumMonthlyLivingCost": 2000,
  "safetyBufferPercentage": 15,
  "maxGoalAllocationPercentage": 50,
  "emergencyFundTargetMonths": 3,
  "enforceStrictly": true
}
```

### Aggressive
```json
{
  "minimumMonthlyLivingCost": 1500,
  "safetyBufferPercentage": 10,
  "maxGoalAllocationPercentage": 70,
  "emergencyFundTargetMonths": 2,
  "enforceStrictly": false
}
```

### High-Security
```json
{
  "minimumMonthlyLivingCost": 2500,
  "safetyBufferPercentage": 20,
  "maxGoalAllocationPercentage": 40,
  "emergencyFundTargetMonths": 6,
  "enforceStrictly": true,
  "allowOverride": false
}
```

## Integration with Goal Smoothing (#713)

These two features work together:
1. **Smoothing** (#713) eliminates month-to-month volatility in contributions
2. **Guardrails** (#714) ensure smoothed recommendations never starve essentials

Example:
```
Smoothing calculates: $400/month for goal
Guardrail safe limit: $300/month

Result: $300/month (smoothing applied, guardrail respected)
```

## Testing Scenarios

### Test 1: Normal Allocation
```
Income: $5,000
Essentials: $2,000
Safe allocation: $2,500
Requested: $400 for goal
Result: Approved ✓
```

### Test 2: Over-allocation Blocked
```
Income: $3,500
Essentials: $2,500
Safe allocation: $500
Requested: $800 for goal
Result: Capped at $500 (reduced by $300)
Violation recorded ✓
```

### Test 3: Data Quality Override
```
User has <2 months history
Confidence: very_low
Recommendation: Use manual estimate
```

## Metrics & Monitoring

- **Health Score**: 0-100 based on compliance
- **Compliance Rate**: % of periods with zero violations
- **Coverage Adequacy**: Ratio of safe-to-allocate vs. total requests
- **Violation Density**: Violations per allocation attempt
- **Trend Direction**: Improving/stable/declining compliance

## Future Enhancements

1. **ML-Based Essential Cost Prediction**
   - Predict living cost from transaction ML
   - Category-wise seasonal patterns

2. **Multi-Currency Support**
   - FX-aware guardrails
   - Multi-location expense tracking

3. **Household Rules**
   - Shared guardrail policies
   - Family-wide living cost standards

4. **Integrations**
   - Paycheck-linked guardrail calculations
   - Bill payment SLAs integration
   - Insurance requirement awareness

## Success Criteria ✓

- API always returns allocations respecting minimum living-cost threshold
- Violations are detected and reported in real-time
- Over-allocations are automatically capped or rejected
- Users have full compliance visibility via dashboard
- Historical compliance trends are tracked

---

## Files Changed

### Database
- `backend/drizzle/0022_budget_guardrail_optimizer.sql` - 5 tables, 4 views, 2 triggers

### Backend
- `backend/db/schema.js` - 5 new table definitions + relations
- `backend/services/budgetGuardrailService.js` - Core guardrail logic (600+ lines)
- `backend/routes/budgetGuardrails.js` - 10 API endpoints (300+ lines)
- `backend/server.js` - Route registration

### Documentation
- `ISSUE_714_GUARDRAIL_OPTIMIZER.md` - This file

## API Response Example

```json
{
  "status": 201,
  "data": {
    "id": "calc-2026-03-02-001",
    "userId": "user-123",
    "policyId": "policy-456",
    "projectedIncome": 5000.00,
    "projectedEssentialExpenses": 2800.00,
    "safetyBufferAmount": 750.00,
    "emergencyFundContribution": 150.00,
    "safeToAllocateAmount": 1100.00,
    "safeToAllocatePercentage": 22.00,
    "coverageStatus": "protected",
    "confidenceScore": 78,
    "confidenceLevel": "high",
    "goalAllocationLimits": {
      "goal-1": 550.00,
      "goal-2": 300.00,
      "goal-3": 250.00
    },
    "recommendations": [
      {
        "level": "info",
        "message": "Safe allocation is 22% of income",
        "action": "monitor_expenses"
      }
    ]
  },
  "message": "Safe allocation calculated successfully"
}
```

---

**Ready for integration and testing!** 🚀
