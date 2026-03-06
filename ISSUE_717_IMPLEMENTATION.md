# Adaptive Deadline Reforecasting Engine (#717)

## Overview
Intelligent reforecasting engine that analyzes contribution trends and proposes adjusted target dates with multiple recovery path options when goals become unrealistic.

## Problem Solved
Static deadlines become misleading after sustained cashflow changes. Users need realistic projections based on actual contribution capacity, not original optimistic estimates.

## Features

### 1. Contribution Capacity Analysis
Multi-window trend analysis:
- **Last 30 days**: Recent contribution behavior
- **Last 60 days**: Medium-term patterns
- **Last 90 days**: Extended trend analysis
- **Lifetime average**: Historical baseline

**Trend Detection**:
- **Improving**: Contributions increasing over time
- **Declining**: Contributions decreasing
- **Stable**: Consistent contribution pattern

**Weighted Capacity Calculation**: 50% recent + 30% medium + 20% extended

### 2. Realistic Projection
- Projects completion date based on **current** contribution capacity
- Identifies deadline gaps (days/months behind schedule)
- Calculates confidence level (high/medium/low) based on contribution consistency

### 3. Recovery Path Options
Generates **at least 4 actionable recovery paths**:

#### Path 1: Increase Contributions
- Calculates required monthly increase to meet original deadline
- Shows increase amount and percentage needed
- Assesses viability based on trend and increase magnitude
- **Pros**: Meets original deadline, no extension needed
- **Cons**: Requires budget increase, may strain finances

#### Path 2: Extend Deadline
- Proposes new deadline matching current contribution pace
- Shows extension duration (days/months)
- **Pros**: No contribution increase, sustainable, reduces pressure
- **Cons**: Delays goal completion, original deadline not met

#### Path 3: Hybrid Approach
- Balanced compromise: moderate increase + moderate extension
- Splits the difference between Paths 1 and 2
- **Pros**: More achievable than full increase, shorter than full extension
- **Cons**: Still requires both changes

#### Path 4: Reduce Target Amount
- Adjusts target downward to match capacity
- Makes goal more achievable
- **Pros**: No contribution increase, realistic target
- **Cons**: Reduces original goal amount

### 4. Smart Recommendations
Selects best path based on:
- **Viability** score (high/medium/low)
- **Contribution trend** (improving → prefer increase; declining → prefer extension)
- **Effort level** required (none/low/moderate/high/very_high)

## API Endpoints

### Get Reforecast
```http
GET /api/deadline-reforecast/{goalId}
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "reforecast": {
      "goalId": "uuid",
      "goalName": "House Down Payment",
      "analysisDate": "2026-03-03T10:30:00Z",
      "currentStatus": {
        "currentAmount": 15000,
        "targetAmount": 50000,
        "remainingAmount": 35000,
        "progressPercentage": 30,
        "originalDeadline": "2027-06-01T00:00:00Z",
        "daysToDeadline": 455
      },
      "capacityAnalysis": {
        "currentMonthlyCapacity": 1200,
        "trend": {
          "direction": "declining",
          "strength": "moderate",
          "recentVsMediumChange": -12,
          "mediumVsExtendedChange": -8
        },
        "recent30DayAvg": 1100,
        "medium60DayAvg": 1250,
        "extended90DayAvg": 1350
      },
      "projection": {
        "projectedCompletionDate": "2028-09-15T00:00:00Z",
        "isDeadlineRealistic": false,
        "delayDays": 471,
        "monthsBehindSchedule": 16,
        "confidenceLevel": "medium"
      },
      "recoveryPaths": [
        {
          "pathId": "increase_contributions",
          "title": "Increase Monthly Contributions",
          "description": "Increase your monthly contribution to meet the original deadline...",
          "type": "contribution_increase",
          "viability": "low",
          "changes": {
            "currentMonthlyContribution": 1200,
            "requiredMonthlyContribution": 2300,
            "increaseAmount": 1100,
            "increasePercentage": 92,
            "newDeadline": "2027-06-01T00:00:00Z",
            "targetAmount": 50000
          },
          "impact": {
            "timeToCompletion": "15 months",
            "totalAdditionalContributions": 16500,
            "effortLevel": "very_high"
          },
          "pros": [
            "Meets original deadline",
            "No deadline extension needed",
            "Maintains original goal timeline"
          ],
          "cons": [
            "Requires 92% increase in monthly contributions",
            "May strain current budget",
            "Goes against recent contribution trend"
          ]
        },
        {
          "pathId": "extend_deadline",
          "title": "Extend Goal Deadline",
          "description": "Extend the deadline to 9/15/2028 while maintaining your current contribution pace.",
          "type": "deadline_extension",
          "viability": "high",
          "changes": {
            "currentMonthlyContribution": 1200,
            "requiredMonthlyContribution": 1200,
            "increaseAmount": 0,
            "increasePercentage": 0,
            "newDeadline": "2028-09-15T00:00:00Z",
            "extensionDays": 471,
            "extensionMonths": 16,
            "targetAmount": 50000
          },
          "impact": {
            "timeToCompletion": "29 months",
            "totalAdditionalContributions": 0,
            "effortLevel": "low"
          },
          "pros": [
            "No increase in monthly contributions needed",
            "Maintains sustainable contribution pace",
            "Reduces financial pressure"
          ],
          "cons": [
            "Delays goal completion by 16 months",
            "Original deadline not met",
            "May affect other financial goals"
          ]
        },
        {
          "pathId": "hybrid_approach",
          "title": "Balanced Approach",
          "description": "Moderate increase in contributions plus reasonable deadline extension...",
          "type": "hybrid",
          "viability": "medium",
          "changes": {
            "currentMonthlyContribution": 1200,
            "requiredMonthlyContribution": 1650,
            "increaseAmount": 450,
            "increasePercentage": 38,
            "newDeadline": "2028-02-28T00:00:00Z",
            "extensionDays": 236,
            "extensionMonths": 8,
            "targetAmount": 50000
          },
          "impact": {
            "timeToCompletion": "22 months",
            "totalAdditionalContributions": 9900,
            "effortLevel": "moderate"
          },
          "pros": [
            "Balanced compromise between time and money",
            "Only 38% increase needed",
            "Shorter extension (8 months vs 16 months)",
            "More achievable than full contribution increase"
          ],
          "cons": [
            "Still requires some contribution increase",
            "Still extends original deadline",
            "Requires commitment to both changes"
          ]
        },
        {
          "pathId": "reduce_target",
          "title": "Adjust Target Amount",
          "description": "Reduce target amount to $43,000.00 to make goal more achievable...",
          "type": "target_reduction",
          "viability": "medium",
          "changes": {
            "currentMonthlyContribution": 1200,
            "requiredMonthlyContribution": 1200,
            "increaseAmount": 0,
            "increasePercentage": 0,
            "newDeadline": "2027-06-01T00:00:00Z",
            "targetAmount": 43000,
            "targetReduction": 7000,
            "targetReductionPercentage": 14
          },
          "impact": {
            "timeToCompletion": "15 months",
            "totalAdditionalContributions": 0,
            "effortLevel": "low"
          },
          "pros": [
            "No increase in contributions needed",
            "More realistic goal based on current capacity",
            "Reduces financial stress",
            "Likely to meet adjusted target"
          ],
          "cons": [
            "Reduces target by $7,000.00",
            "May not fully meet original goal objective",
            "Requires acceptance of lower target"
          ]
        }
      ],
      "recommendation": {
        "pathId": "extend_deadline",
        "title": "Extend Goal Deadline",
        "viability": "high",
        ...
      }
    }
  }
}
```

### Get Capacity Analysis Only
```http
GET /api/deadline-reforecast/{goalId}/capacity-analysis
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "analysis": {
      "goalId": "uuid",
      "contributions": {
        "last30Days": [...],
        "last60Days": [...],
        "last90Days": [...],
        "allTime": [...]
      },
      "capacity": {
        "recent30DayAvg": 1100,
        "medium60DayAvg": 1250,
        "extended90DayAvg": 1350,
        "lifetimeAvg": 1400
      },
      "trend": {
        "direction": "declining",
        "strength": "moderate",
        "recentVsMediumChange": -12,
        "mediumVsExtendedChange": -8
      },
      "currentCapacity": 1200,
      "analyzedAt": "2026-03-03T10:30:00Z"
    }
  }
}
```

### Accept Recovery Path
```http
POST /api/deadline-reforecast/{goalId}/accept-path
Authorization: Bearer {token}
Content-Type: application/json

{
  "pathId": "extend_deadline",
  "pathData": {
    "pathId": "extend_deadline",
    "title": "Extend Goal Deadline",
    "type": "deadline_extension",
    "changes": {
      "newDeadline": "2028-09-15T00:00:00Z",
      "extensionDays": 471,
      "targetAmount": 50000
    },
    ...
  }
}

Response:
{
  "success": true,
  "data": {
    "success": true,
    "goal": {
      "id": "uuid",
      "goalName": "House Down Payment",
      "targetDate": "2028-09-15T00:00:00Z",
      "targetAmount": "50000",
      "customProperties": {
        "lastReforecast": {
          "date": "2026-03-03T10:30:00Z",
          "pathId": "extend_deadline",
          "pathType": "deadline_extension",
          "previousDeadline": "2027-06-01T00:00:00Z",
          "previousTarget": "50000",
          "reason": "Extend the deadline to 9/15/2028..."
        }
      }
    },
    "appliedPath": {...}
  }
}
```

## Usage Examples

### Frontend Integration
```javascript
// Get reforecast for a goal
const fetchReforecast = async (goalId) => {
  const response = await fetch(`/api/deadline-reforecast/${goalId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data } = await response.json();
  const { reforecast } = data;
  
  // Display projection
  console.log(`Projected completion: ${reforecast.projection.projectedCompletionDate}`);
  console.log(`Delay: ${reforecast.projection.monthsBehindSchedule} months`);
  console.log(`Confidence: ${reforecast.projection.confidenceLevel}`);
  
  // Display recovery paths
  reforecast.recoveryPaths.forEach(path => {
    console.log(`\n${path.title} (${path.viability} viability):`);
    console.log(`- ${path.description}`);
    console.log(`- Effort: ${path.impact.effortLevel}`);
    console.log(`Pros: ${path.pros.join(', ')}`);
    console.log(`Cons: ${path.cons.join(', ')}`);
  });
  
  // Show recommended path
  console.log(`\nRecommended: ${reforecast.recommendation.title}`);
};

// Accept a recovery path
const acceptPath = async (goalId, path) => {
  const response = await fetch(`/api/deadline-reforecast/${goalId}/accept-path`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      pathId: path.pathId,
      pathData: path
    })
  });
  
  const { data } = await response.json();
  console.log('Goal updated:', data.goal);
  console.log('Applied changes:', data.appliedPath);
};
```

### Dashboard Widget Example
```jsx
function ReforecastWidget({ goalId }) {
  const [reforecast, setReforecast] = useState(null);
  
  useEffect(() => {
    fetchReforecast(goalId).then(setReforecast);
  }, [goalId]);
  
  if (!reforecast) return <Loading />;
  
  const { projection, recoveryPaths, recommendation } = reforecast;
  
  return (
    <div className="reforecast-widget">
      <h3>Goal Projection</h3>
      
      {!projection.isDeadlineRealistic && (
        <Alert type="warning">
          Your goal is {projection.monthsBehindSchedule} months behind schedule.
          Current pace projects completion on {new Date(projection.projectedCompletionDate).toLocaleDateString()}.
        </Alert>
      )}
      
      <h4>Recommended Action: {recommendation.title}</h4>
      <p>{recommendation.description}</p>
      
      <button onClick={() => acceptPath(goalId, recommendation)}>
        Accept Recommendation
      </button>
      
      <h4>Other Options</h4>
      {recoveryPaths.filter(p => p.pathId !== recommendation.pathId).map(path => (
        <PathOption key={path.pathId} path={path} onAccept={() => acceptPath(goalId, path)} />
      ))}
    </div>
  );
}
```

## Service Methods

### DeadlineReforecastService

```javascript
import deadlineReforecastService from './services/deadlineReforecastService.js';

// Generate full reforecast with all recovery paths
const reforecast = await deadlineReforecastService.generateReforecast(goalId, userId);

// Analyze contribution capacity only
const analysis = await deadlineReforecastService.analyzeContributionCapacity(goalId, userId);

// Accept a recovery path and update goal
const result = await deadlineReforecastService.acceptReforecastPath(
  goalId,
  userId,
  'extend_deadline',
  pathData
);
```

## Algorithm Details

### Contribution Capacity Calculation
```javascript
// Weighted average (more weight to recent data)
currentCapacity = (recent30DayAvg * 0.5) + (medium60DayAvg * 0.3) + (extended90DayAvg * 0.2)
```

### Trend Detection
```javascript
recentChange = ((recent30 - medium60) / medium60) * 100
mediumChange = ((medium60 - extended90) / extended90) * 100

if (recentChange > 10 && mediumChange > 10) → Improving (strong)
if (recentChange > 5 || mediumChange > 5) → Improving (moderate)
if (recentChange < -10 && mediumChange < -10) → Declining (strong)
if (recentChange < -5 || mediumChange < -5) → Declining (moderate)
else → Stable
```

### Viability Assessment
```javascript
if (increasePercentage <= 15%) → High viability
if (increasePercentage <= 30% && improving) → High viability
if (increasePercentage <= 30% && !improving) → Medium viability
if (increasePercentage <= 50% && improving) → Medium viability
if (increasePercentage <= 50% && !improving) → Low viability
if (increasePercentage > 50%) → Low viability
```

### Confidence Level
```javascript
variance = standardDeviation([recent30, medium60, extended90])

if (stable trend && variance < 20%) → High confidence
if (improving trend && variance < 30%) → High confidence
if (stable/improving && variance < 40%) → Medium confidence
else → Low confidence
```

## Best Practices

### When to Trigger Reforecast
1. **Quarterly reviews**: Run every 3 months for active goals
2. **After contribution changes**: When user increases/decreases contributions
3. **Risk escalation**: When goal risk score reaches medium/high (integrate with #716)
4. **User request**: Allow manual reforecast trigger from dashboard
5. **Milestone checks**: At 25%, 50%, 75% progress marks

### Integration Points
- **Early Warning System (#716)**: Trigger reforecast when risk escalates
- **Goal Dashboard**: Display reforecast summary in goal cards
- **Alerts**: Suggest reforecast when deadline pressure increases
- **Reports**: Include reforecast in monthly/quarterly goal reports

### UI/UX Recommendations
1. **Visual timeline**: Show original vs projected vs recommended deadlines
2. **Comparison matrix**: Side-by-side path comparison
3. **Interactive sliders**: Let users adjust contribution amounts and see updated projections
4. **One-click accept**: Easy path acceptance with confirmation modal
5. **History tracking**: Show previous reforecasts and decisions

## Testing

### Test Scenarios

#### Scenario 1: Behind Schedule, Declining Trend
```javascript
- Goal: $50k target, $15k current
- Contributions declining: $1350 → $1250 → $1100
- Result: Recommends deadline extension (high viability)
```

#### Scenario 2: Behind Schedule, Improving Trend
```javascript
- Goal: $50k target, $15k current
- Contributions improving: $800 → $1000 → $1250
- Result: Recommends hybrid approach or moderate increase (medium viability)
```

#### Scenario 3: On Track
```javascript
- Goal: $50k target, $30k current
- Consistent contributions: $2000/month
- Result: Confirms original deadline is realistic (no action needed)
```

#### Scenario 4: Significantly Behind
```javascript
- Goal: $50k target, $5k current, 6 months to deadline
- Low contributions: $500/month
- Result: Recommends target reduction or major extension
```

### API Testing
```bash
# Get reforecast
curl http://localhost:5000/api/deadline-reforecast/{goalId} \
  -H "Authorization: Bearer TOKEN"

# Get capacity analysis
curl http://localhost:5000/api/deadline-reforecast/{goalId}/capacity-analysis \
  -H "Authorization: Bearer TOKEN"

# Accept path
curl -X POST http://localhost:5000/api/deadline-reforecast/{goalId}/accept-path \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pathId":"extend_deadline","pathData":{...}}'
```

## Done Criteria ✅

- ✅ Reforecasting engine analyzes contribution capacity over multiple time windows
- ✅ Projects realistic completion date based on current pace
- ✅ Provides at least 4 actionable recovery paths:
  - ✅ Path 1: Increase contributions to meet deadline
  - ✅ Path 2: Extend deadline to match capacity
  - ✅ Path 3: Hybrid approach (balanced)
  - ✅ Path 4: Reduce target amount
- ✅ API provides realistic projected date
- ✅ Tradeoff options include pros/cons and viability assessment
- ✅ Smart recommendation based on trend analysis
- ✅ Accept path endpoint to update goal

## Files Created

### New Files
1. `backend/services/deadlineReforecastService.js` - Core reforecasting engine (700+ lines)
2. `backend/routes/deadlineReforecast.js` - API endpoints

### Modified Files
1. `backend/server.js` - Registered new routes

## Performance Notes

- **Caching**: Consider caching reforecast results for 24 hours
- **Async processing**: For batch reforecasts across multiple goals
- **Database indexes**: Ensure `goalContributions` has index on `(goalId, contributedAt)`

## Future Enhancements

1. **Machine learning**: Predict future contribution patterns
2. **Seasonal adjustment**: Account for known seasonal income variations
3. **Multi-goal optimization**: Reforecast across all goals to optimize combined progress
4. **What-if scenarios**: Let users test different contribution amounts
5. **Automated acceptance**: Auto-accept low-impact paths with user consent
6. **SMS/Email reports**: Send periodic reforecast summaries
