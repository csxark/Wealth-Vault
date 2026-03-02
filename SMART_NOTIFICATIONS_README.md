# Real-Time Budget Alerts & Smart Notifications Implementation
Feature: Issue #626

## Overview

This implementation brings intelligent, multi-level budget alerting with smart notifications and AI-driven spending recommendations to prevent silent budget overruns and reduce alert fatigue.

## User Pain Points Addressed

1. **Silent Overruns**: Users discover overspending only at month-end - too late to adjust behavior
   - **Solution**: Real-time alerts at 80%, 95%, 100%, 150% of budget thresholds

2. **Alert Fatigue**: Too many notifications cause users to ignore all alerts
   - **Solution**: Smart notification throttling (max 3 per day), quiet hours, channel preferences

3. **No Spending Control**: Users can't react in real-time to budget status
   - **Solution**: Real-time dashboard showing current spending, alerts, and recommendations

4. **One-Size-Fits-All Approach**: Same alert rules for all categories
   - **Solution**: Per-category, customizable multi-level alert rules

## Architecture

### Database Schema

#### New Tables (`0007_smart_notifications_and_recommendations.sql`)

1. **smart_alert_rules** - Configurable multi-level budget alert thresholds
   - Per-user, per-category alert rules
   - Multi-level thresholds (80%, 95%, 100%, 150%)
   - Notification channels, quiet hours, frequency limiting
   - Template support for quick setup

2. **smart_recommendations** - AI-generated spending reduction recommendations
   - Merchant consolidation suggestions
   - Spending pattern insights
   - Budget optimization recommendations
   - Confidence scores and implementation difficulty

3. **spending_benchmarks** - Peer comparison data
   - Category-level statistics across user cohorts
   - Percentile calculations (10th, 25th, 75th, 90th)
   - Trend analysis (month-over-month, year-over-year)

4. **user_spending_profiles** - User's aggregated spending data
   - Historical spending patterns
   - Top merchants and consolidation opportunities
   - Volatility and spending trends
   - Percentile position vs peers

5. **merchant_consolidation_analysis** - Specific consolidation opportunities
   - Identify fragmented spending across merchants
   - Calculate savings potential from consolidation
   - Track implementation status and actual savings

6. **notification_history** - Complete audit trail of notifications
   - Track delivery across channels (email, in-app, SMS, push)
   - User interaction data (read, clicked, dismissed)
   - Delivery failures for retry logic

7. **daily_spending_summary** - Pre-computed daily summaries
   - Today's spending by category
   - Alerts triggered today
   - Comparison to historical averages

### Services

#### 1. Smart Notifications Service (`smartNotificationsService.js`)

**Key Functions:**

- `createSmartAlertRule(userId, categoryId, config)` - Create multi-level alert rules
- `evaluateSmartAlerts(userId, categoryId, currentSpent, budgetAmount)` - Evaluate and trigger alerts
- `getSmartAlertRules(userId, categoryId)` - Retrieve user's rules
- `updateSmartAlertRule(ruleId, config)` - Update existing rules
- `markNotificationAsRead(notificationId, userId)` - Track notification interaction

**Features:**
- Multi-level threshold support: 80%, 95%, 100%, 150%
- Smart alert deduplication to prevent duplicate alerts
- Quiet hours support (don't notify during sleep time)
- Daily notification limit (default 3 per day)
- Multiple notification channels (email, in-app, SMS, push)
- Cache invalidation for real-time updates

#### 2. Smart Recommendations Service (`smartRecommendationsService.js`)

**Key Functions:**

- `generateMerchantConsolidationRecommendations()` - Analyze spending fragmentation
- `generateSpendingPatternInsights()` - Detect trends and volatility
- `getRecommendations(userId, filters)` - Retrieve recommendations
- `acceptRecommendation(recommendationId, userId)` - Track acceptance
- `dismissRecommendation(recommendationId, userId, reason)` - Track dismissal

**Features:**
- Detects when spending is spread across too many merchants
- Calculates potential savings from consolidation
- Identifies spending trend changes (increasing/decreasing)
- Detects high volatility patterns
- Confidence scoring for recommendations
- User feedback collection

#### 3. Smart Benchmarking Service (`smartBenchmarkingService.js`)

**Key Functions:**

- `calculateCategoryBenchmarks(categoryId, tenantId)` - Compute cohort statistics
- `createUserSpendingProfile(userId, categoryId)` - Create user's profile
- `getBenchmarks(categoryId, tenantId)` - Retrieve benchmarks
- `compareToPheer(userId, categoryId)` - Compare to peer spending
- `getUserSpendingProfile(userId, categoryId)` - Get user's profile

**Features:**
- Peer group comparison by spending category
- Percentile calculations (10%, 25%, 75%, 90%)
- Identifies spending outliers
- Tracks trends vs previous months
- Top merchant analysis

#### 4. Smart Alerts Event Handler (`smartAlertsEventHandler.js`)

**Key Functions:**

- `handleSmartAlertEvent(event)` - Process expense events
- `processScheduledSmartAlerts()` - Batch processing of rules

**Features:**
- Real-time triggering on expense creation/update
- Async recommendation generation (non-blocking)
- Event-driven architecture using outbox pattern
- Integration with existing budget alert system

### API Endpoints

Base path: `/api/smart-alerts`

#### Smart Alert Rules

```javascript
// Create alert rule with 80%, 95%, 100%, 150% thresholds
POST /rules
{
  categoryId: UUID,
  budgetAmount: 500,
  period: "monthly",  // daily, weekly, monthly, quarterly, yearly
  alertLevels: [80, 95, 100, 150],
  notificationChannels: ["in-app", "email"],
  maxNotificationsPerDay: 3,
  quietHours: {
    enabled: true,
    start_hour: 20,
    end_hour: 8,
    timezone: "UTC"
  }
}

// Get user's alert rules
GET /rules?categoryId=UUID

// Update alert rule
PUT /rules/:ruleId

// Disable alert rule
DELETE /rules/:ruleId
```

#### Notifications

```javascript
// Get notification history
GET /notifications?type=budget_alert&days=30&limit=50

// Mark notification as read
PUT /notifications/:notificationId/read
```

#### Recommendations

```javascript
// Get recommendations
GET /recommendations?categoryId=UUID&status=suggested&limit=5

// Accept recommendation
PUT /recommendations/:recommendationId/accept

// Dismiss recommendation with reason
PUT /recommendations/:recommendationId/dismiss
{
  reason: "Already using another strategy"
}
```

#### Benchmarking

```javascript
// Get category benchmarks
GET /benchmarks/:categoryId?period=monthly

// Compare to peers
GET /comparison/:categoryId
```

#### Dashboard

```javascript
// Comprehensive dashboard data
GET /dashboard?categoryId=UUID

// Today's spending summary
GET /daily-summary
```

## Configuration

### Default Alert Thresholds

```javascript
{
  level: 1,
  percentage: 80,
  description: "Warning - 80% of budget reached",
  severity: "info"
},
{
  level: 2,
  percentage: 95,
  description: "Alert - 95% of budget reached",
  severity: "warning"
},
{
  level: 3,
  percentage: 100,
  description: "Critical - Budget fully spent",
  severity: "danger"
},
{
  level: 4,
  percentage: 150,
  description: "Overspent - 50% over budget",
  severity: "critical"
}
```

### Notification Channels

- `in-app` - In-application notifications
- `email` - Email notifications
- `sms` - SMS notifications (extensible)
- `push` - Push notifications (extensible)

### Smart Scheduling

- `quietHours`: Don't send notifications during configured hours
- `maxNotificationsPerDay`: Prevent alert fatigue (default: 3)
- `preferredNotificationTime`: Time to send daily/weekly summaries
- `sendDailySummary`: Flag for daily summary emails
- `sendWeeklySummary`: Flag for weekly summary emails

## Integration Points

### 1. Expense Event Processing
When an expense is created/updated:
1. Smart alert rules are evaluated
2. If thresholds are crossed, notifications are sent
3. Recommendations are generated asynchronously
4. Spending profiles are updated for benchmarking

### 2. Outbox Pattern Integration
Uses the existing outbox dispatcher to:
- Ensure reliable event processing
- Support multiple notification channels
- Track delivery status per channel

### 3. WebSocket Real-Time Updates (Future)
- Push alert notifications in real-time
- Update dashboard with current spending
- Immediate recommendation delivery

## Database Migrations

### Required Migration

Run migration file: `/backend/drizzle/0007_smart_notifications_and_recommendations.sql`

This creates:
- 7 new tables
- 25+ indexes for query optimization
- Constraint definitions

### Schema Integration

Drizzle ORM schemas are defined in:
- `/backend/db/schema-smart-notifications.js` - All table definitions
- Updated `/backend/db/schema.js` - Exports the new schema

## Performance Considerations

### Caching Strategy

- Alert rules cached for 30 minutes
- Recommendations cached for 1 hour
- Benchmarks cached for 24 hours
- Cache invalidation on updates

### Indexes

- Per-user rule lookups: `idx_smart_alert_rules_tenant_user`
- Active rules filtering: `idx_smart_alert_rules_active_period`
- Notification filtering: `idx_notification_history_user_type_sent`
- Daily summary lookups: `idx_daily_summary_user_date`

### Query Optimization

- Use `READ_COMMITTED` isolation for aggregate computations
- Batch notification processing
- Async recommendation generation (non-blocking)
- Pre-computed daily summaries

## Usage Examples

### 1. Create Multi-Level Budget Alert

```javascript
// User creates an alert for $500 dining budget
const rule = await smartNotificationsService.createSmartAlertRule(
  userId,
  diningCategoryId,
  {
    budgetAmount: 500,
    period: 'monthly',
    alertLevels: [80, 95, 100, 150],
    notificationChannels: ['in-app', 'email'],
    maxNotificationsPerDay: 3,
    tenantId
  }
);

// Thresholds automatically created:
// - $400 (80%): "Warning"
// - $475 (95%): "Alert" 
// - $500 (100%): "Critical"
// - $750 (150%): "Overspent"
```

### 2. Handle Expense Event

```javascript
// When user adds a $150 dining expense
const alerts = await smartNotificationsService.evaluateSmartAlerts(
  userId,
  diningCategoryId,
  currentSpent,  // Now $450
  500            // Budget
);

// If at 90% of budget ($450):
// - 80% threshold already triggered (cached)
// - No duplicate alert sent
// - User sees: "Alert - 95% of budget reached" at $475
```

### 3. Get Recommendations

```javascript
// User requests spending recommendations
const recommendations = await smartRecommendationsService.getRecommendations(
  userId,
  { categoryId: diningCategoryId, status: 'suggested' }
);

// Returns:
// [
//   {
//     type: 'merchant_consolidation',
//     title: 'Consolidate dining spending',
//     description: 'You use 5 different restaurants...',
//     estimatedMonthlySavings: 45,
//     actionItems: [...]
//   },
//   {
//     type: 'spending_pattern',
//     title: 'Spending trend increasing 15%',
//     description: 'Your dining costs are rising...',
//     ...
//   }
// ]
```

### 4. Peer Comparison

```javascript
// User checks how they compare to peers
const comparison = await smartBenchmarkingService.compareToPheer(
  userId,
  diningCategoryId,
  tenantId
);

// Returns:
// {
//   userSpending: 450,
//   avgSpending: 380,  // Average peer spending
//   percentile: 72,    // User is 72nd percentile
//   isOutlier: false,
//   comparison: {
//     vsAverage: 'above',
//     vsAverageAmount: 70,
//     vsAveragePct: '18.4%'
//   },
//   insight: 'Your spending is above average for this category'
// }
```

## Alert Deduplication

Prevents sending the same alert multiple times:

```javascript
// Alert at 95% ($475)
// User spends another $10 (now $485)
// Same 95% alert won't fire again within 1 hour
// Next alert fires at 100% ($500)
```

### Deduplication Algorithm

- Hash generated from: `ruleId:currentSpent:threshold`
- 1-hour cooldown window between identical alerts
- Stored in `alertDeduplication` table
- TTL-based cleanup

## Future Enhancements

### Phase 2 Features

1. **Category Templates**
   - Pre-built alert rule templates
   - "Aggressive Saver", "Moderate", "Flexible" presets

2. **Machine Learning Recommendations**
   - Predictive alerts based on spending patterns
   - Seasonal adjustment factors
   - Personalized thresholds based on user behavior

3. **Group Alerts** (for shared budgets)
   - Notify when shared budget thresholds are crossed
   - Show who spent what in shared category

4. **Integration with Payment Methods**
   - Different alert rules for credit vs debit
   - Installment payment tracking

5. **Advanced Benchmarking**
   - Geographic peer groups
   - Income-based cohorts
   - Family size comparisons

### WebSocket Real-Time Updates

```javascript
// Server sends real-time budget updates
socket.on('budget-alert', {
  type: 'threshold_crossed',
  category: 'Dining',
  percentage: 95,
  currentSpent: 475,
  budget: 500
});

// User gets live dashboard updates
socket.on('dashboard-update', {
  totalSpending: 2150,
  categoriesAtRisk: ['Dining', 'Entertainment'],
  alerts: [...]
});
```

## Monitoring & Debugging

### Log Examples

```
INFO: Smart alert rule created {
  userId: "abc123",
  categoryId: "food-123",
  budgetAmount: 500,
  alertLevels: [80, 95, 100, 150]
}

INFO: Budget alerts processed {
  userId: "abc123",
  categoryId: "food-123",
  alertsTriggered: 1,
  currentSpent: 450
}

DEBUG: Alert deduplicated - recently sent {
  userId: "abc123",
  ruleId: "rule-456",
  level: 2,
  timeSinceLast: 1200000 // 20 minutes
}
```

### Performance Metrics

- Alert evaluation: < 100ms per expense
- Recommendation generation: async (< 5 seconds)
- Benchmark calculation: daily batch job
- Notification delivery: < 1 second per channel

## Testing

### Unit Tests

```bash
npm run test backend/services/smartNotificationsService.test.js
npm run test backend/services/smartRecommendationsService.test.js
npm run test backend/services/smartBenchmarkingService.test.js
```

### Integration Tests

```bash
npm run test:e2e e2e/smart-alerts.spec.ts
```

### Load Testing

```bash
# Simulate 100 users with real-time expense updates
npm run load-test -- --users=100 --endpoint=/api/smart-alerts
```

## Deployment Checklist

- [ ] Run migration: `drizzle-kit migrate:prod`
- [ ] Verify schema tables created
- [ ] Enable smart alerts in tenant settings
- [ ] Set up Redis for caching
- [ ] Configure email service for notifications
- [ ] Deploy services and routes
- [ ] Test alert triggering with sample expense
- [ ] Monitor notification delivery
- [ ] Verify benchmarks calculation (daily job)

## Troubleshooting

### Alerts Not Firing

1. Check alert rule is active: `SELECT * FROM smart_alert_rules WHERE id = ?`
2. Verify spending is above threshold: Check `category_budget_aggregates`
3. Check deduplication: `SELECT * FROM alert_deduplication WHERE id = ?`
4. Review logs for evaluation errors

### Recommendations Missing

1. Check minimum transaction count (3+ months data required)
2. Verify merchant data in expenses table
3. Check recommendations cache: `cacheService.get('recommendations:...')`
4. Review async generation errors in logs

### Benchmarks Outdated

1. Check `last_updated_at` in `spending_benchmarks`
2. Verify scheduled batch job is running
3. Check user count in cohort (`cohort_size`)
4. Verify `data_quality_score` > 0.7 for valid benchmarks

## Contributing

When extending smart alerts functionality:

1. Add new schemas to `schema-smart-notifications.js`
2. Implement service methods with caching
3. Add API endpoints to `smartAlerts.js`
4. Update event handler for new triggers
5. Include test cases for new features
6. Update this README

## References

- Migration file: `0007_smart_notifications_and_recommendations.sql`
- Schema file: `schema-smart-notifications.js`
- Services: `smartNotificationsService.js`, `smartRecommendationsService.js`, `smartBenchmarkingService.js`
- Routes: `smartAlerts.js`
- Event handler: `smartAlertsEventHandler.js`
- GitHub Issue: #626
