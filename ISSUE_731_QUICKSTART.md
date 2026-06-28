# Goal Cascade Risk Propagation - Quick Start Guide

## What is it?

When one goal slips (like an emergency fund or debt payoff), it can silently make other dependent goals unrealistic. The Cascade Engine automatically detects these impacts and suggests fixes.

## 5-Minute Setup

### 1. Create Goal Dependencies

**Define which goals depend on others:**

```bash
curl -X POST http://localhost:3000/api/goal-cascade/dependencies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "upstreamGoalId": "emergency-fund-id",
    "downstreamGoalId": "vacation-fund-id",
    "dependencyType": "sequential",
    "requiredProgress": 100,
    "isBlocking": true,
    "relationshipReason": "Safety first - emergency fund before vacation"
  }'
```

**Common Patterns:**
- Emergency Fund → All discretionary goals (vacation, luxury items)
- Debt Payoff → Investment goals
- Home Down Payment → Home renovation goals

### 2. Monitor for Slippage

**Check if a goal is falling behind:**

```bash
curl http://localhost:3000/api/goal-cascade/analyze/{goalId}/slippage \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response tells you:**
- Is the goal slipping? ✓ or ✗
- How far behind? (progress gap %)
- Severity: low, medium, high, critical

### 3. Analyze Cascade Impact

**When slippage detected, run analysis:**

```bash
curl -X POST http://localhost:3000/api/goal-cascade/analyze/{goalId} \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerEvent": "progress_decline",
    "maxDepth": 3
  }'
```

**You get:**
- 📊 **Impact Summary**: How many goals affected, risk level
- 📅 **Revised Deadlines**: New target dates for all affected goals
- 💰 **Funding Changes**: Adjusted monthly contributions
- 🔧 **Mitigation Plans**: Actionable strategies to fix it

### 4. Apply Mitigation

**Choose and apply a recommended fix:**

```bash
curl -X POST http://localhost:3000/api/goal-cascade/mitigations/{strategyId}/apply \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Strategy Options:**
1. **Extend Deadlines** (easiest) - Give all goals more time
2. **Increase Funding** - Boost contributions to upstream goal
3. **Reprioritize** - Pause lower-priority goals
4. **Relax Dependencies** - Allow parallel progress

---

## Real-World Example

### Scenario
You have:
- 🏦 **Emergency Fund** (target: $10k, current: $3k, deadline: 6 months)
- ✈️ **Vacation Fund** (depends on emergency fund reaching 100%)
- 🏠 **Home Down Payment** (depends on emergency fund reaching 50%)

### What Happens

1. **Emergency Fund Slips** - You're 40% behind schedule
2. **Cascade Triggers** - System detects impact
3. **Analysis Runs** - Calculates effects:
   - Vacation Fund: +60 days delay
   - Home Down Payment: +30 days delay
4. **Mitigation Suggested** - "Extend all deadlines by 45 days"
5. **You Apply** - One click updates all goals

---

## Dashboard Overview

### Check Cascade Status

```bash
curl http://localhost:3000/api/goal-cascade/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Shows:**
- Active cascades requiring action
- High-risk cascades
- Total goal dependencies
- Recent cascade history

---

## Typical Dependency Patterns

### Pattern 1: Sequential Chain
```
Emergency Fund (100%) → Vacation Fund → Luxury Purchase
```
Each goal must fully complete before next starts.

### Pattern 2: Partial Gates
```
Emergency Fund (50%) → Home Down Payment
```
Downstream can start once upstream reaches 50%.

### Pattern 3: Funding Priority
```
Debt Payoff → Investment Goals
```
Debt gets funding priority; investments get remainder.

---

## Automation

### Auto-Detect Slippage

Set up triggers to auto-run analysis:

```javascript
// Runs daily, checks all goals
{
  "triggerName": "Daily Progress Check",
  "triggerType": "progress_decline",
  "thresholdValue": 10.0,  // 10% behind schedule
  "checkFrequency": "daily",
  "autoRunAnalysis": true,
  "notifyUser": true
}
```

### Notification Settings

Configure how you're alerted:
- **In-App**: Always on
- **Push Notification**: High/severe only
- **Email**: Critical cascades only

---

## Integration with Other Features

### With Goal Explainability (#715)
```javascript
// Cascade events appear in adjustment timeline
GET /goals/{goalId}/adjustments
// Shows: "Deadline extended due to upstream goal slippage"
```

### With Deadline Reforecasting (#717)
```javascript
// Trigger reforecast after cascade
POST /api/deadline-reforecast/{goalId}
// Uses cascade-adjusted deadline as baseline
```

### With Contribution Smoothing (#713)
```javascript
// Contributions adjust to new cascade-based priorities
GET /api/goal-contributions/{goalId}/recommendations
```

---

## Troubleshooting

### "Circular dependency detected"
**Problem**: Goal A depends on Goal B, which depends on Goal A.
**Fix**: Remove one dependency or use `allowParallelProgress`.

### "Too many goals affected"
**Problem**: Cascade hits max depth (5 levels).
**Fix**: Reduce dependency chains or increase `maxDepth`.

### "Mitigation failed to apply"
**Problem**: Goal no longer exists or is archived.
**Fix**: Review affected goals, remove stale dependencies.

---

## Best Practices

1. **Start Simple**: Create 2-3 dependencies, test cascade, then expand
2. **Use Soft Dependencies**: Set `strength: 'advisory'` for non-critical relationships
3. **Monitor Weekly**: Check dashboard for new cascades
4. **Act Fast**: Apply mitigations within 7 days for best results
5. **Review Annually**: Clean up outdated dependencies

---

## API Quick Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dependencies` | POST | Create dependency |
| `/dependencies` | GET | List all dependencies |
| `/analyze/:goalId` | POST | Run cascade analysis |
| `/analyze/:goalId/slippage` | GET | Check goal slippage |
| `/analysis/:analysisId` | GET | Get analysis details |
| `/history` | GET | Cascade history |
| `/mitigations/:id/apply` | POST | Apply mitigation |
| `/dashboard` | GET | Overview summary |
| `/goals/:id/impact-preview` | GET | Preview potential cascade |

---

## Next Steps

1. ✅ Create your first goal dependency
2. ✅ Check for slippage on active goals
3. ✅ Run a cascade analysis
4. ✅ Review and apply a mitigation strategy
5. ✅ Set up automated triggers
6. ✅ Monitor dashboard weekly

---

## Support

- **Documentation**: See `ISSUE_731_IMPLEMENTATION.md`
- **API Reference**: Full endpoint details in implementation doc
- **Examples**: See usage examples section above

---

**Done!** You're now tracking goal cascades and preventing silent failures. 🎯
