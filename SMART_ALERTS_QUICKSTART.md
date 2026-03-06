# Smart Notifications & Recommendations - Quick Start Guide

## Getting Started

This guide will help you get the Real-Time Budget Alerts & Smart Notifications feature (#626) up and running.

## Prerequisites

- Node.js 16+
- PostgreSQL 12+
- Redis (for caching)
- Drizzle ORM configured

## 1. Database Setup

### Step 1: Run the Migration

```bash
# Using Drizzle Kit
npx drizzle-kit migrate

# Or manually execute the SQL
psql -U postgres -d wealth_vault < backend/drizzle/0007_smart_notifications_and_recommendations.sql
```

### Step 2: Verify Tables Created

```sql
-- Check all new tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
AND tablename LIKE 'smart_%' OR tablename LIKE 'user_spending%' OR tablename LIKE 'notification_%';

-- Expected output:
-- smart_alert_rules
-- smart_recommendations
-- spending_benchmarks
-- user_spending_profiles
-- merchant_consolidation_analysis
-- notification_history
-- daily_spending_summary
```

## 2. Service Installation

### Step 1: Verify Routes are Registered

Check that `/backend/server.js` includes:

```javascript
import smartAlerts from "./routes/smartAlerts.js";
// ...
app.use("/api/smart-alerts", userLimiter, smartAlerts);
```

### Step 2: Install Dependencies (if needed)

All required dependencies should already be installed:
- express
- drizzle-orm
- pg
- redis

## 3. Configuration

### Environment Variables

Add to your `.env` or `.env.local`:

```bash
# Cache configuration
REDIS_URL=redis://localhost:6379
CACHE_TTL_ALERTS=1800
CACHE_TTL_RECOMMENDATIONS=3600
CACHE_TTL_BENCHMARKS=86400

# Email notifications
EMAIL_FROM=alerts@wealhtvalut.com
SMTP_HOST=your-smtp-host
SMTP_PORT=587

# Alert configuration
MAX_ALERTS_PER_DAY=3
ALERT_COOLDOWN_MINUTES=60
DEFAULT_QUIET_HOURS_START=20
DEFAULT_QUIET_HOURS_END=8
```

### Default Alert Thresholds

Already configured in `smartNotificationsService.js`, but can be customized:

```javascript
const DEFAULT_ALERT_LEVELS = [80, 95, 100, 150]; // Percentages
const DEFAULT_CHANNELS = ['in-app', 'email'];
const DEFAULT_QUIET_HOURS = {
  enabled: false,
  start_hour: 20,
  end_hour: 8,
  timezone: 'UTC'
};
```

## 4. Testing the Feature

### Test 1: Create an Alert Rule

```bash
curl -X POST http://localhost:3000/api/smart-alerts/rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "dining-category-uuid",
    "budgetAmount": 500,
    "period": "monthly",
    "alertLevels": [80, 95, 100, 150],
    "notificationChannels": ["in-app", "email"],
    "rulesName": "Dining Budget Alert"
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "id": "rule-uuid",
    "userId": "user-uuid",
    "categoryId": "dining-uuid",
    "budgetAmount": "500",
    "alertThresholds": [
      { "level": 1, "percentage": 80, "amount": "400", "severity": "info" },
      { "level": 2, "percentage": 95, "amount": "475", "severity": "warning" },
      { "level": 3, "percentage": 100, "amount": "500", "severity": "danger" },
      { "level": 4, "percentage": 150, "amount": "750", "severity": "critical" }
    ]
  }
}
```

### Test 2: Retrieve Alert Rules

```bash
curl -X GET http://localhost:3000/api/smart-alerts/rules \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 3: Trigger an Expense Event

Create an expense that crosses an alert threshold:

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "dining-category-uuid",
    "amount": 350,
    "description": "Restaurant",
    "date": "2024-03-02",
    "merchant": "Restaurant ABC"
  }'
```

This should:
1. Evaluate smart alert rules
2. Trigger alert at 80% if spending >= $400
3. Generate notifications
4. Create recommendation if applicable

### Test 4: Get Recommendations

```bash
curl -X GET http://localhost:3000/api/smart-alerts/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 5: View Dashboard

```bash
curl -X GET http://localhost:3000/api/smart-alerts/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 5. Monitoring

### Check Database Records

```sql
-- View alert rules
SELECT id, user_id, category_id, rules_name, is_active, created_at 
FROM smart_alert_rules 
WHERE user_id = 'your-user-id';

-- View notifications sent
SELECT id, user_id, notification_type, delivery_status, sent_at 
FROM notification_history 
WHERE user_id = 'your-user-id' 
ORDER BY sent_at DESC 
LIMIT 10;

-- View recommendations
SELECT id, user_id, recommendation_type, status, priority_score 
FROM smart_recommendations 
WHERE user_id = 'your-user-id' 
ORDER BY created_at DESC;

-- View benchmarks
SELECT id, category_id, average_spending, cohort_size, benchmark_month_year 
FROM spending_benchmarks 
ORDER BY created_at DESC 
LIMIT 5;
```

### View Application Logs

```bash
# Monitor smart alert service logs
tail -f logs/smart-alerts.log | grep "Smart alert"

# Monitor notification delivery
tail -f logs/notifications.log | grep "delivered\|failed"

# Monitor recommendations generation
tail -f logs/recommendations.log
```

## 6. Common Issues & Troubleshooting

### Issue: No alerts being triggered

**Check**:
1. Alert rule is active: `SELECT * FROM smart_alert_rules WHERE id = ?`
2. Spending >= threshold: `SELECT * FROM expenses WHERE category_id = ? AND user_id = ?`
3. Cache not stale: Check Redis for rule in `smart_notifications:userId:rules`
4. Check logs for evaluation errors

**Solution**:
- Verify threshold calculation: `budgetAmount * (percentage / 100)`
- Clear cache: `redis-cli FLUSHALL`
- Check alert rule `is_active = true`

### Issue: Same alert firing multiple times

**Check**: Deduplication table
```sql
SELECT * FROM alert_deduplication 
WHERE budget_alert_id = 'alert-id' 
ORDER BY created_at DESC 
LIMIT 1;
```

**Solution**:
- Check `deduplication_window_ms` (default 3600000 = 1 hour)
- Verify `last_fired_at` is recent
- Check `is_active = true`

### Issue: No recommendations generated

**Check**:
1. Sufficient spending data (3+ months): 
```sql
SELECT COUNT(*) FROM expenses 
WHERE user_id = ? AND category_id = ? 
AND date > NOW() - INTERVAL '90 days';
```

2. Min merchants for consolidation (3+):
```sql
SELECT COUNT(DISTINCT merchant) FROM expenses 
WHERE user_id = ? AND category_id = ?;
```

**Solution**:
- Requires 3+ months of data
- Requires spending across 3+ different merchants
- Clear cache to regenerate

### Issue: Benchmarks not available

**Check**:
```sql
SELECT * FROM spending_benchmarks 
WHERE category_id = ? 
ORDER BY created_at DESC LIMIT 1;
```

**Solution**:
- Run daily benchmark calculation job
- Ensure minimum 5 users in cohort
- Check `data_quality_score > 0.7`

## 7. Performance Tuning

### Optimize Query Performance

```sql
-- Add missing indexes if not created by migration
CREATE INDEX IF NOT EXISTS idx_smart_alerts_user_active 
ON smart_alert_rules(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_alerts_user_type 
ON notification_history(user_id, notification_type, sent_at DESC);
```

### Monitor Cache Hit Rate

```bash
# Check Redis stats
redis-cli INFO stats | grep hits
redis-cli INFO stats | grep misses

# Monitor cache performance
redis-cli MONITOR | grep "smart_notifications"
```

### Database Query Performance

```sql
-- Enable query timing
SET log_statement = 'all';
SET log_min_duration_statement = 100; -- Log queries > 100ms

-- Analyze slow queries
EXPLAIN ANALYZE 
SELECT * FROM smart_alert_rules 
WHERE user_id = 'user-id' AND is_active = TRUE;
```

## 8. Production Deployment

### Checklist

- [ ] Database migration executed and verified
- [ ] All 7 tables created with correct structure
- [ ] 25+ indexes created for performance
- [ ] Redis cache configured and accessible
- [ ] Email service configured for notifications
- [ ] Environment variables set all servers
- [ ] Rate limiting enabled
- [ ] Monitoring and alerting configured
- [ ] Backup strategy for new tables
- [ ] Load testing completed (100+ concurrent users)

### Environment Setup

```bash
# Test database connection
npm run db:check

# Run pending migrations
npm run db:migrate

# Verify schema
npm run db:inspect

# Start application
npm start

# Monitor logs
npm run logs:smart-alerts
```

### Health Check

```bash
# Verify API is responding
curl http://localhost:3000/api/smart-alerts/rules \
  -H "Authorization: Bearer TEST_TOKEN"

# Should return 200 with empty array or user's rules
```

## 9. Development Workflow

### Adding a New Alert Channel

1. Update `smartNotificationsService.js`:
```javascript
if (channel === 'slack') {
  await slackService.sendMessage(userId, notificationContent);
}
```

2. Add to notification channels enum (update schema if needed)

3. Test: Create rule with `notificationChannels: ['slack']`

### Adding a New Recommendation Type

1. Create detection function in `smartRecommendationsService.js`
2. Call from `generateRecommendations()` 
3. Create test data and verify output
4. Document the recommendation type

### Extending Benchmarking

1. Add new cohort logic in `smartBenchmarkingService.js`
2. Update `demographic_criteria` schema
3. Recalculate benchmarks for new cohort
4. Test peer comparison accuracy

## 10. Resources

### Documentation Files

- [Smart Notifications README](./SMART_NOTIFICATIONS_README.md) - Comprehensive feature guide
- [Implementation Summary](./IMPLEMENTATION_SUMMARY_626.md) - Technical details
- [PR Description #626](./PR_DESCRIPTION_626.md) - Original requirements

### Code Files

- Database: `backend/drizzle/0007_smart_notifications_and_recommendations.sql`
- Schema: `backend/db/schema-smart-notifications.js`
- Services: `backend/services/smart*.js`
- Routes: `backend/routes/smartAlerts.js`
- Event Handler: `backend/services/smartAlertsEventHandler.js`

### API Documentation

OpenAPI/Swagger documentation available at:
```
GET /api/docs#/Smart%20Alerts
```

## Support & Questions

For issues or questions:
1. Check logs in `logs/` directory
2. Review database state using provided SQL queries
3. Check existing GitHub issues for similar problems
4. Create a new issue with detailed reproduction steps

## Next Steps

After getting the basic feature working:

1. **Customize Alert Thresholds** - Adjust default levels for your use case
2. **Configure Email Notifications** - Set up email service details
3. **Add Alert Templates** - Create pre-configured rule templates
4. **Enable Benchmarking** - Run daily benchmark calculation job
5. **Monitor Performance** - Set up alerting on API response times

---

**Version**: 1.0  
**Last Updated**: March 2024  
**Status**: Ready for Production Deployment
