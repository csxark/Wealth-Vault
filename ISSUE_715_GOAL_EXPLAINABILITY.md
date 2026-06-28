# Goal Adjustment Explainability Timeline - Issue #715

## Overview

The Goal Adjustment Explainability Timeline provides users with transparent, detailed explanations for why their goal contribution recommendations change over time. This builds trust by showing:

- **What changed**: Previous vs. new contribution amounts
- **Why it changed**: Factor-level attribution (income delta, expense delta, deadline pressure, priority shift)
- **When it changed**: Immutable timeline of all adjustment events
- **Human-readable reasons**: Plain language explanations 
- **User engagement**: Track if users understand and acknowledge adjustments

## Problem Statement

Users don't trust changing recommendations because they can't see why adjustments happened over time. This leads to:
- Confusion about recommendation changes
- Lack of trust in the system
- Reduced adoption of AI-generated recommendations
- Difficulty explaining financial decisions to family members

## Solution

Build a comprehensive explainability system that captures and displays the "why" behind every adjustment with:
- Detailed factor-level attribution
- Human-readable explanations
- Interactive timeline visualization
- User feedback and engagement tracking
- Insights about adjustment patterns

## Database Schema

### Core Tables

#### `goal_adjustment_explanations`
Stores detailed explanations for every adjustment event:
- Previous/new recommendation amounts
- Attribution factors (income, expense, deadline, priority changes)
- Confidence scores and stability metrics
- Human-readable summaries and detailed explanations
- User acknowledgment and feedback tracking

#### `goal_adjustment_attribution_details`
Detailed breakdown of contributing factors:
- Factor category (income, expense, deadline, priority, cashflow, macro, user_behavior)
- Impact percentage and amount
- Metric values and comparison text
- Severity indicators

#### `goal_adjustment_timeline`
Immutable chronological record of adjustments:
- Event sequence and date
- Reference to detailed explanation
- User interaction tracking (viewed, acknowledged, etc)
- Engagement score

#### `goal_adjustment_insights`
Pre-computed insights for dashboard:
- Top contributing factors
- Volatility analysis
- Trend analysis
- User trust score
- Clarity score

#### `goal_adjustment_comparison`
Model accuracy tracking:
- Predicted vs actual adjustment amounts
- Contributing factor predictions vs reality
- Model version and accuracy metrics

## API Endpoints

### Get Adjustment History
```
GET /goals/:goalId/adjustments
Query Parameters:
  - limit: number (default: 20)
  - offset: number (default: 0)
  - sortBy: 'date' | 'amount_change' | 'severity' (default: 'date')
  - sortOrder: 'asc' | 'desc' (default: 'desc')

Response:
{
  success: true,
  data: {
    adjustments: [
      {
        id: uuid,
        previousAmount: number,
        newAmount: number,
        amountChange: number,
        amountChangePercentage: number,
        summary: string,
        detailedExplanation: string,
        attributionFactors: [...],
        severity: 'critical' | 'high' | 'normal' | 'minor',
        triggerSource: string,
        createdAt: timestamp,
        ...
      }
    ],
    pagination: { limit, offset, total, pages }
  }
}
```

### Get Adjustment Details
```
GET /goals/:goalId/adjustments/:explanationId

Response:
{
  success: true,
  data: {
    explanation: {
      // Full explanation object with all details
      attributionDetails: [...],
      timelineEntry: {...},
      comparison: {...}
    }
  }
}
```

### Acknowledge Adjustment
```
POST /goals/:goalId/adjustments/:explanationId/acknowledge

Request Body:
{
  userFeedback?: string,
  userFeedbackType?: 'understood' | 'confused' | 'disagree_too_high' | 'disagree_too_low'
}

Response:
{
  success: true,
  data: { adjustment: {...} }
}
```

### Get Adjustment Insights
```
GET /goals/:goalId/adjustment-insights

Response:
{
  success: true,
  data: {
    insights: {
      topFactors: [
        { factor: string, count: number, avg_impact_pct: number }
      ],
      adjustmentFrequency: 'very_stable' | 'stable' | 'volatile' | 'very_volatile',
      adjustmentsLast30Days: number,
      trend: 'increasing_recommendations' | 'decreasing_recommendations' | 'stable',
      userTrustScore: number,
      clarityScore: number,
      improvementAreas: [...]
    }
  }
}
```

### Get Adjustment Timeline Summary
```
GET /goals/:goalId/adjustment-timeline/summary
Query Parameters:
  - days: number (default: 30)

Response:
{
  success: true,
  data: {
    summary: {
      totalAdjustments: number,
      avgAmountChange: number,
      mostCommonSeverity: string,
      mostCommonTrigger: string,
      userEngagement: {
        totalViewed: number,
        totalAcknowledged: number
      },
      recentAdjustments: [...]
    }
  }
}
```

## Service Layer

### GoalAdjustmentExplainabilityService

#### Key Methods

```javascript
// Log a new adjustment event
async logAdjustment(adjustmentData) {
  // adjustmentData includes:
  // - tenantId, userId, goalId
  // - previousAmount, newAmount
  // - attributionFactors (array of factors with impact %)
  // - incomeDelta, expenseDelta
  // - deadlinePressureScore
  // - priorityShift
  // - triggerSource
  // Returns: created explanation record
}

// Get adjustment history with pagination
async getAdjustmentHistory(userId, goalId, options) {
  // Returns: array of enriched explanation records
}

// Get detailed explanation
async getAdjustmentDetails(explanationId) {
  // Returns: full explanation with attributions, timeline, comparison
}

// Mark adjustment as acknowledged
async acknowledgeAdjustment(explanationId, feedbackData) {
  // Updates: user_acknowledged, acknowledged_at, userFeedback
}

// Calculate insights
async updateInsights(userId, goalId) {
  // Analyzes adjustments and updates insights record
  // Returns: insights object
}
```

## Integration Points

### 1. When Creating/Updating Goal Contribution Recommendations
Call the service when a new recommendation is created:

```javascript
// In goalContributionSmoothingService or recommendation engine
const attributionData = analyzeChangeFactors(previousRec, newRec);
await goalAdjustmentExplainabilityService.logAdjustment({
    tenantId,
    userId,
    goalId,
    previousRecommendationId: previousRec.id,
    newRecommendationId: newRec.id,
    previousAmount: previousRec.smoothedAmount,
    newAmount: newRec.smoothedAmount,
    triggerSource: 'cashflow_change', // or other trigger types
    attributionFactors: attributionData.factors,
    incomeDelta: attributionData.incomeDelta,
    expenseDelta: attributionData.expenseDelta,
    confidenceScore: newRec.confidenceScore,
    confidenceLevel: newRec.confidenceLevel
});
```

### 2. Attribution Factor Analysis
Integrate with existing services to calculate factors:

```javascript
// Input: previous and current financial state
// Output: array of attribution factors

const attributionFactors = [
    {
        category: 'income',
        name: 'Income Increase',
        description: 'Monthly income increased by 15%',
        impact_pct: 40,
        impact_amount: 200,
        previous_value: 4000,
        current_value: 4600,
        comparison_text: 'Income increased by 15% vs Aug average',
        severity_indicator: 'significant_change',
        metric_source: 'cashflow_analysis',
        data_lookback_days: 30
    },
    {
        category: 'deadline',
        name: 'Deadline Pressure',
        description: '6 months remaining to reach $10,000 goal',
        impact_pct: 35,
        comparison_text: 'Only 6 months to reach your target',
        severity_indicator: 'moderate_change',
        metric_source: 'calendar_countdown'
    }
];
```

### 3. Dashboard/Frontend Integration
Expose via API endpoints and use in UI:

```javascript
// Fetch adjustment history
const response = await fetch(`/goals/${goalId}/adjustments?limit=20`);
const { data } = await response.json();

// Display timeline
data.adjustments.forEach(adjustment => {
    displayAdjustmentCard({
        date: adjustment.createdAt,
        before: adjustment.previousAmount,
        after: adjustment.newAmount,
        summary: adjustment.summary,
        factors: adjustment.attributionDetails
    });
});

// Track engagement
await fetch(`/goals/${goalId}/adjustments/${explanationId}/acknowledge`, {
    method: 'POST',
    body: { userFeedbackType: 'understood' }
});
```

## Recommendation Change Triggers

### 1. **Cashflow Change** 
Triggered by significant income or expense variations:
- Income increases/decreases by >20%
- Monthly expenses change significantly
- Major expense categories shift

### 2. **Goal Progress Update**
Triggered when goal progress substantially changes:
- User makes large contribution
- Goal completion date estimates shift
- Progress percentage jumps

### 3. **Priority Shift**
Triggered when goal priority changes:
- User manually adjusts priority
- System adjusts based on other goals
- Life event triggers priority change

### 4. **Deadline Pressure**
Triggered as deadline approaches:
- Less than 3 months remaining
- Significant gap to target
- Accelerating required contributions needed

### 5. **Manual Override**
Triggered by user manual adjustment:
- User accepts different amount
- User requests review
- Manual correction needed

## Human-Readable Explanations

Examples of generated summaries:

1. **Income-driven increase:**
   "Your recommended contribution increased by $500 (25%). Your income increased, allowing for higher goal contributions."

2. **Deadline-driven increase:**
   "Your recommended contribution increased by $800 (40%). As your goal deadline approaches, we've adjusted your contribution to help you reach your target."

3. **Expense-driven decrease:**
   "Your recommended contribution decreased by $300 (15%). Your expenses have increased, so we adjusted your goal contribution to maintain your budget."

4. **Multi-factor adjustment:**
   "Your recommended contribution decreased by $200 (10%). While your income increased slightly, higher expenses and shifting priorities led to this adjustment."

## Severity Levels

- **Critical (>50% change)**: Major shift requiring explanation
- **High (30-50% change)**: Significant adjustment
- **Normal (10-30% change)**: Moderate change
- **Minor (<10% change)**: Small refinement

## Metrics & Insights

### Adjustment Frequency
- **Very Stable**: 0 adjustments in 30 days
- **Stable**: 1 adjustment in 30 days
- **Volatile**: 2-3 adjustments in 30 days
- **Very Volatile**: 4+ adjustments in 30 days

### User Trust Score
Calculated from user feedback:
- Positive feedback: +points
- Confused/disagree feedback: -points
- No feedback: neutral

### Clarity Score
Calculated from user engagement:
- User views explanation: +5 points
- User acknowledges: +10 points
- User provides feedback: +5 points
- Score normalized to 0.0-1.0

## Implementation Checklist

- [x] Database schema (4 new tables)
- [x] Service layer with core methods
- [x] API endpoints (GET, POST)
- [x] Attribution factor analysis
- [x] Human-readable summary generation
- [ ] Dashboard timeline visualization
- [ ] Frontend components for explanations
- [ ] User feedback collection
- [ ] Insights dashboard
- [ ] Email notifications for major changes
- [ ] Mobile-friendly explanation cards
- [ ] Accessibility compliance

## Files Created/Modified

### New Files
- `/backend/drizzle/0007_goal_adjustment_explainability.sql` - Migration
- `/backend/db/schema.js` - Schema additions (tables + relations)
- `/backend/services/goalAdjustmentExplainabilityService.js` - Service layer
- `/backend/routes/goalAdjustmentExplainability.js` - API routes

### Modified Files
- `/backend/db/schema.js` - Added 4 new tables and 5 new relations

## Testing

### Unit Tests
- Attribution factor analysis
- Summary generation
- Severity determination
- Score calculations

### Integration Tests
- Full adjustment logging workflow
- API endpoint responses
- Timeline consistency
- Insight calculations

### E2E Tests
- User views adjustment history
- User acknowledges adjustment
- Engagement tracking
- Notification triggers

## Future Enhancements

1. **ML-powered explanations**: Use GPT to generate more natural descriptions
2. **Predictive adjustments**: Show predicted changes before they occur
3. **Comparative analysis**: "You're increasing recommendations faster than similar goals"
4. **Adjustment coaching**: Guide users through understanding recommendations
5. **Customizable explanations**: Let users choose explanation complexity level
6. **Multi-language support**: Explain in user's preferred language
7. **Impact simulation**: "If you increase by $200, you'll reach goal by X date"

## References

- Issue: #715 - Goal Adjustment Explainability Timeline
- Related: #713 - Goal Contribution Volatility Smoother
- Related: #714 - Multi-Goal Budget Guardrail Optimizer
