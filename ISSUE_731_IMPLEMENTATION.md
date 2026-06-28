# Goal Cascade Risk Propagation Engine - Issue #731

## Overview

The **Goal Cascade Risk Propagation Engine** is a dependency-aware system that automatically detects when major goals slip and propagates timeline/funding impacts to downstream dependent goals. It provides visibility into cascade effects, revised deadlines, and actionable mitigation strategies.

## Problem Solved

**Before**: When a major goal (like emergency fund or debt payoff) slips, downstream goals (like home down payment or vacation) silently become unrealistic without visibility. Users don't know:
- Which goals are affected
- By how much deadlines will slip
- What funding adjustments are needed
- What actions can resolve the cascade

**After**: System automatically:
- Detects upstream goal slippage
- Maps dependency interlocks
- Propagates impact to all dependent goals
- Calculates revised deadlines and contributions
- Generates mitigation action plans
- Notifies users with clear rationale

---

## Key Features

### 1. **Instance-Level Goal Dependencies**
- Define explicit relationships between specific goals (not just goal types)
- **Sequential**: Downstream goal can't start until upstream reaches threshold
- **Partial**: Downstream can start when upstream reaches partial progress
- **Funding Priority**: Upstream gets funding priority over downstream
- Configurable blocking rules and parallel progress options

### 2. **Automatic Slippage Detection**
- Monitors goal progress vs. expected timeline
- Detects: deadline misses, progress decline, funding cuts
- Severity levels: low, medium, high, critical
- Triggers cascade analysis automatically

### 3. **Multi-Level Impact Propagation**
- Recursively analyzes up to 5 dependency levels
- Distinguishes direct vs. indirect impacts
- Builds complete cascade path visualization
- Calculates cumulative effects across all goals

### 4. **Impact Calculation**
- **Deadline Impact**: Days slipped, revised completion dates
- **Funding Impact**: Changed monthly contributions, budget gaps
- **Feasibility Assessment**: Whether goals remain achievable
- **Risk Scoring**: 0-100 cascade risk score

### 5. **Intelligent Mitigation Strategies**
- **Extend Deadlines**: Bulk deadline adjustments for all affected goals
- **Increase Funding**: Boost upstream goal to prevent cascade
- **Reprioritize Goals**: Pause lower-priority goals to focus resources
- **Adjust Dependencies**: Allow parallel progress to reduce blocking

### 6. **User Notifications**
- In-app, push, and email notifications
- Priority-based (low, medium, high, urgent)
- Actionable insights with deep links
- Auto-dismiss after expiration

---

## Architecture

### Database Schema

#### **goal_dependencies**
Explicit relationships between goal instances:
```sql
- upstreamGoalId: Goal that must progress first
- downstreamGoalId: Goal that depends on upstream
- dependencyType: sequential | partial | funding_priority
- requiredProgress: % upstream must reach before downstream starts
- fundingImpact: % of funds upstream takes from downstream
- isBlocking: Does upstream delay downstream start?
- allowParallelProgress: Can both progress simultaneously?
- strength: hard | soft | advisory
```

#### **goal_cascade_analyses**
Results of cascade propagation:
```sql
- triggerGoalId: Goal that slipped
- triggerEvent: deadline_miss | progress_decline | funding_reduction
- triggerSeverity: low | medium | high | critical
- totalAffectedGoals: Number of downstream goals impacted
- totalDeadlineSlipDays: Cumulative delay across all goals
- cascadeRiskScore: 0-100 overall risk
- impactGraph: Visualization data (nodes/edges)
- cascadePath: Ordered propagation sequence
```

#### **cascaded_goal_impacts**
Per-goal impact details:
```sql
- affectedGoalId: Goal being impacted
- impactLevel: negligible | low | medium | high | severe
- propagationDepth: How many levels from trigger (1 = direct)
- originalDeadline / revisedDeadline: Timeline changes
- deadlineSlipDays: Days of delay
- originalMonthlyContribution / revisedMonthlyContribution: Funding changes
- remainsFeasible: Still achievable?
- impactReason: Natural language explanation
```

#### **cascade_mitigation_strategies**
Recommended resolution actions:
```sql
- strategyType: extend_deadline | increase_funding | reprioritize | adjust_dependencies
- requiredActions: [{action, goalId, parameter, value}]
- affectedGoals: [{goalId, changeType, oldValue, newValue}]
- resolvesSeverity: full | partial | minimal
- reducesRiskBy: % risk reduction
- implementationDifficulty: easy | medium | hard | very_hard
- recommendationScore: 0-100 suitability score
- isPrimaryRecommendation: Recommended first choice
```

#### **cascade_detection_triggers**
Automated monitoring rules:
```sql
- triggerType: progress_decline | deadline_miss | funding_cut
- thresholdValue: When to trigger analysis
- checkFrequency: hourly | daily | weekly | realtime
- autoRunAnalysis: Auto-trigger on detection?
- notifyUser: Send notification?
```

#### **cascade_notification_queue**
Pending user alerts:
```sql
- cascadeAnalysisId: Related analysis
- notificationType: cascade_detected | mitigation_suggested | critical_impact
- priority: low | medium | high | urgent
- deliveryStatus: pending | sent | delivered | read | dismissed
- expiresAt: Auto-dismiss date
```

---

## API Endpoints

### Goal Dependencies

#### **POST** `/api/goal-cascade/dependencies`
Create a dependency between two goals.

**Request Body:**
```json
{
  "upstreamGoalId": "uuid",
  "downstreamGoalId": "uuid",
  "dependencyType": "sequential",
  "requiredProgress": 100.0,
  "fundingImpact": 0.0,
  "isBlocking": true,
  "allowParallelProgress": false,
  "relationshipReason": "Emergency fund must be complete before vacation",
  "strength": "hard"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dependency": { /* dependency object */ }
  },
  "message": "Goal dependency created successfully"
}
```

**Error Handling:**
- Prevents circular dependencies
- Validates goal existence
- Checks for duplicate dependencies

---

#### **GET** `/api/goal-cascade/dependencies`
Get all goal dependencies for the user.

**Query Parameters:**
- `includeInactive` (boolean): Include deactivated dependencies

**Response:**
```json
{
  "success": true,
  "data": {
    "dependencies": [
      {
        "id": "uuid",
        "upstreamGoalId": "uuid",
        "downstreamGoalId": "uuid",
        "dependencyType": "sequential",
        "requiredProgress": "100.00",
        "isBlocking": true,
        "createdAt": "2026-03-03T10:00:00Z"
      }
    ],
    "count": 1
  }
}
```

---

### Cascade Analysis

#### **POST** `/api/goal-cascade/analyze/:goalId`
Trigger cascade impact analysis for a specific goal.

**Request Body:**
```json
{
  "triggerEvent": "progress_decline",
  "maxDepth": 3
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "id": "uuid",
      "triggerGoalId": "uuid",
      "totalAffectedGoals": 3,
      "cascadeRiskScore": 65,
      "riskLevel": "high",
      "maxDeadlineSlipDays": 45,
      "impactGraph": { /* visualization data */ }
    },
    "impacts": [
      {
        "affectedGoalId": "uuid",
        "impactLevel": "high",
        "deadlineSlipDays": 45,
        "revisedDeadline": "2027-08-15T00:00:00Z",
        "impactReason": "This goal depends on..."
      }
    ],
    "mitigations": [
      {
        "strategyType": "extend_deadline",
        "strategyTitle": "Extend All Affected Goal Deadlines",
        "isPrimaryRecommendation": true,
        "recommendationScore": "85.00"
      }
    ],
    "summary": {
      "totalAffectedGoals": 3,
      "riskLevel": "high",
      "riskScore": 65,
      "maxDeadlineSlipDays": 45,
      "recommendedActions": 1
    }
  }
}
```

---

#### **GET** `/api/goal-cascade/analyze/:goalId/slippage`
Check if a goal is currently slipping.

**Response:**
```json
{
  "success": true,
  "data": {
    "slippage": {
      "goalId": "uuid",
      "isSlipping": true,
      "isAtRisk": true,
      "severity": "high",
      "expectedProgress": 60.0,
      "actualProgress": 35.0,
      "progressGap": 25.0,
      "daysToDeadline": 90,
      "remainingAmount": 15000
    },
    "shouldTriggerCascade": true
  }
}
```

---

#### **GET** `/api/goal-cascade/analysis/:analysisId`
Get detailed cascade analysis by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": { /* full analysis object */ },
    "impacts": [ /* array of impacts */ ],
    "mitigations": [ /* array of strategies */ ]
  }
}
```

---

#### **GET** `/api/goal-cascade/history`
Get cascade analysis history for the user.

**Query Parameters:**
- `limit` (number): Results per page (default: 10)
- `offset` (number): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "analyses": [ /* array of analyses */ ],
    "count": 10,
    "pagination": {
      "limit": 10,
      "offset": 0
    }
  }
}
```

---

### Mitigation Strategies

#### **POST** `/api/goal-cascade/mitigations/:strategyId/apply`
Apply a mitigation strategy.

**Response:**
```json
{
  "success": true,
  "data": {
    "strategyId": "uuid",
    "results": [
      {
        "goalId": "uuid",
        "success": true,
        "action": "extend_deadline"
      }
    ],
    "appliedActions": 3,
    "failedActions": 0
  },
  "message": "Mitigation strategy applied: 3 action(s) succeeded, 0 failed"
}
```

---

#### **GET** `/api/goal-cascade/mitigations/analysis/:analysisId`
Get all mitigation strategies for a cascade analysis.

**Response:**
```json
{
  "success": true,
  "data": {
    "mitigations": [ /* array of strategies */ ],
    "primaryRecommendation": { /* recommended strategy */ }
  }
}
```

---

### Dashboard

#### **GET** `/api/goal-cascade/dashboard`
Get cascade risk dashboard summary.

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalCascadesDetected": 5,
      "activeCascadesRequiringAction": 2,
      "highRiskCascades": 1,
      "totalGoalDependencies": 8,
      "totalGoalsAffected": 12
    },
    "recentCascades": [ /* last 5 analyses */ ],
    "dependencyGraph": {
      "totalDependencies": 8,
      "blockingDependencies": 6,
      "parallelDependencies": 2
    }
  }
}
```

---

#### **GET** `/api/goal-cascade/goals/:goalId/impact-preview`
Preview potential cascade impact if a goal were to slip.

**Response:**
```json
{
  "success": true,
  "data": {
    "goalId": "uuid",
    "currentSlippage": { /* slippage details */ },
    "potentiallyAffectedGoals": 3,
    "downstreamGoals": [
      {
        "goalId": "uuid",
        "dependencyType": "sequential",
        "isBlocking": true
      }
    ],
    "wouldTriggerCascade": true,
    "riskLevel": "high"
  }
}
```

---

## Usage Examples

### 1. Create Goal Dependency
```javascript
// Emergency fund must reach 50% before vacation goal can progress
const response = await fetch('/api/goal-cascade/dependencies', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    upstreamGoalId: emergencyFundGoalId,
    downstreamGoalId: vacationGoalId,
    dependencyType: 'partial',
    requiredProgress: 50.0,
    isBlocking: true,
    relationshipReason: 'Safety net must be in place before leisure spending'
  })
});
```

### 2. Check Goal Slippage
```javascript
const response = await fetch(`/api/goal-cascade/analyze/${goalId}/slippage`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { slippage, shouldTriggerCascade } = response.data;

if (shouldTriggerCascade) {
  // Trigger full cascade analysis
  await fetch(`/api/goal-cascade/analyze/${goalId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      triggerEvent: 'progress_decline',
      maxDepth: 3
    })
  });
}
```

### 3. Apply Mitigation Strategy
```javascript
const response = await fetch(`/api/goal-cascade/mitigations/${strategyId}/apply`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const { results, appliedActions } = response.data;
console.log(`${appliedActions} goal(s) updated successfully`);
```

---

## Integration Points

### With Existing Services

1. **goalDependencyService.js** (Issue #708)
   - Type-based dependencies (emergency fund blocks vacation goals)
   - Instance-based dependencies (this specific goal blocks that goal)
   - Both systems work together

2. **goalAdjustmentExplainabilityService.js** (Issue #715)
   - Log cascade events as adjustment explanations
   - Provide context: "Deadline extended due to upstream goal slippage"

3. **Deadline Reforecasting Engine** (Issue #717)
   - Trigger reforecast when cascade analysis completes
   - Use cascade-adjusted deadlines as new targets

4. **Goal Contribution Smoothing** (Issue #713)
   - Adjust contribution recommendations based on cascade impacts
   - Smooth funding transitions when priorities shift

5. **Push Notifications** (Issue #558)
   - Send cascade alerts via push/email/in-app
   - Priority-based notification delivery

---

## Deployment Checklist

### Database Migration
```bash
# Run schema migration
npm run db:migrate
```

### App.js Integration
```javascript
import goalCascadeRiskPropagationRoutes from './routes/goalCascadeRiskPropagation.js';

app.use('/api/goal-cascade', goalCascadeRiskPropagationRoutes);
```

### Environment Variables
No additional environment variables required.

### Monitoring
- Track cascade detection frequency
- Monitor mitigation application rates
- Alert on severe cascades (risk score > 80)

---

## Testing

Run comprehensive tests:
```bash
npm test -- goalCascadeRiskPropagation
```

Test coverage includes:
- Dependency creation and circular detection
- Slippage detection accuracy
- Impact propagation through multiple levels
- Mitigation strategy generation
- API endpoint authorization

---

## Performance Considerations

- **Cascade Analysis**: O(N * D) where N = goals, D = max depth
- **Circular Detection**: O(V + E) graph traversal
- **Database Queries**: Indexed on userId, goalId, analysisId
- **Caching**: Consider caching dependency graphs for large goal sets

---

## Future Enhancements

1. **ML-Based Slippage Prediction**: Predict likelihood of slippage before it happens
2. **Auto-Apply Mitigations**: Let users opt-in to automatic strategy application
3. **Cascade Simulations**: "What if" analysis before making goal changes
4. **Team Goal Cascades**: Extend to shared/collaborative goals
5. **Historical Analysis**: Identify patterns in goal slippages
6. **Integration with Calendar**: Show cascade impacts on calendar timeline

---

## Related Issues

- **#708**: Goal Dependency Service (type-based dependencies)
- **#715**: Goal Adjustment Explainability Timeline
- **#717**: Adaptive Deadline Reforecasting Engine
- **#713**: Goal Contribution Volatility Smoother
- **#714**: Multi-Goal Budget Guardrail Optimizer

---

## Support

For questions or issues:
1. Check API error responses for detailed messages
2. Review cascade analysis details via GET endpoints
3. Contact support with `analysisId` for assistance

---

## License

Part of Wealth Vault - Financial Wellness Platform
