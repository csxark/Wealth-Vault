# Goal Failure Early-Warning Notifications (#716)

## Overview
Real-time notification system that alerts users about goal risks, missed contribution streaks, and deadline proximity issues with actionable recovery recommendations.

## Problem Solved
Users miss critical intervention windows because risk indicators are only visible when actively checking the dashboard. This system proactively alerts users when goals transition to higher risk levels or when contribution inactivity threatens goal success.

## Features Delivered

### 1. Risk Score Monitoring
- **Real-time Risk Calculation**: Multi-factor risk scoring (0-100) based on:
  - Pace ratio (40% weight) - Are contributions keeping up?
  - Deadline proximity (25% weight) - Time pressure analysis
  - Missed contributions (20% weight) - Contribution consistency
  - Achievement probability (15% weight) - Statistical likelihood of success
- **Risk Level Classification**: Low (0-33), Medium (34-66), High (67-100)
- **Transition Detection**: Automatic alerts when risk escalates (e.g., medium→high)

### 2. Contribution Streak Tracking
- **Streak Monitoring**: Tracks active vs missed contribution patterns
- **Threshold Alerts**: Triggers after 2+ consecutive missed contributions
- **Prolonged Inactivity Detection**: Alerts after 30 days without contributions
- **Expected Frequency**: Supports weekly, biweekly, and monthly contribution schedules

### 3. Alert System
Alert types:
- `risk_escalation` - Risk level increased (e.g., medium→high)
- `missed_contribution_streak` - Multiple consecutive missed contributions
- `prolonged_inactivity` - No contributions for extended period
- `recovery_needed` - Critical intervention required

Alert severities: low, medium, high, critical

### 4. Recovery Action Recommendations
Smart, context-aware recommendations:
- **Increase Contributions**: Suggested when pace ratio is below target
- **Extend Deadline**: Recommended when time pressure is critical
- **Adjust Target Amount**: Proposed when achievement probability is low
- **Setup Auto Transfers**: Suggested for missed contribution issues
- **Adjust Frequency**: Recommended for cash flow management
- **Review Goal Relevance**: Suggested during prolonged inactivity

### 5. Multi-Channel Delivery
- **In-app notifications**: Stored in database for dashboard display
- **Push notifications**: Browser push via Web Push API
- **Email alerts**: Optional email notifications (configurable)

## Database Schema

### goalRiskTracking Table
```sql
- id (UUID, PK)
- goalId (UUID, FK → financial_goals)
- userId (UUID, FK → users)
- previousRiskLevel (text: 'low', 'medium', 'high')
- currentRiskLevel (text)
- riskScore (numeric 0-100)
- previousRiskScore (numeric)
- transitionType (text: 'escalation', 'improvement', 'stable')
- contributingFactors (jsonb)
- calculatedAt (timestamp)
- metadata (jsonb)
```

### contributionStreaks Table
```sql
- id (UUID, PK)
- goalId (UUID, FK → financial_goals)
- userId (UUID, FK → users)
- streakType (text: 'active', 'missed', 'recovered')
- currentStreak (integer)
- longestStreak (integer)
- lastContributionDate (timestamp)
- missedCount (integer)
- expectedFrequency (text: 'weekly', 'biweekly', 'monthly')
- nextExpectedDate (timestamp)
- isAtRisk (boolean)
- riskThreshold (integer, default: 2)
- lastUpdated (timestamp)
- metadata (jsonb)
```

### goalFailureAlerts Table
```sql
- id (UUID, PK)
- goalId (UUID, FK → financial_goals)
- userId (UUID, FK → users)
- alertType (text)
- severity (text: 'low', 'medium', 'high', 'critical')
- title (text)
- message (text)
- recoveryActions (jsonb array)
- triggerData (jsonb)
- sentVia (jsonb array: ['in-app', 'push', 'email'])
- isRead (boolean)
- readAt (timestamp)
- isDismissed (boolean)
- dismissedAt (timestamp)
- actionTaken (text)
- actionTakenAt (timestamp)
- createdAt (timestamp)
- expiresAt (timestamp)
- metadata (jsonb)
```

## API Endpoints

### Get User Alerts
```http
GET /api/goal-early-warning/alerts
Authorization: Bearer {token}

Query Parameters:
- goalId (uuid, optional): Filter by specific goal
- unreadOnly (boolean, optional): Return only unread alerts
- limit (integer, default: 20): Results per page
- offset (integer, default: 0): Pagination offset

Response:
{
  "success": true,
  "data": {
    "alerts": [{
      "id": "uuid",
      "goalId": "uuid",
      "alertType": "risk_escalation",
      "severity": "critical",
      "title": "⚠️ Goal Risk Escalated: House Down Payment",
      "message": "Your goal risk level has increased from medium to high...",
      "recoveryActions": [{
        "action": "increase_contributions",
        "title": "Increase Monthly Contributions",
        "description": "Your current pace is 65% of required rate...",
        "priority": "high",
        "estimatedImpact": "Brings you back on track..."
      }],
      "isRead": false,
      "createdAt": "2026-03-03T10:30:00Z"
    }],
    "pagination": { "limit": 20, "offset": 0, "count": 15 }
  }
}
```

### Mark Alert as Read
```http
PUT /api/goal-early-warning/alerts/{alertId}/read
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { "alert": {...} }
}
```

### Dismiss Alert
```http
PUT /api/goal-early-warning/alerts/{alertId}/dismiss
Authorization: Bearer {token}
```

### Record Action Taken
```http
POST /api/goal-early-warning/alerts/{alertId}/action
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "increase_contributions"
}

Response:
{
  "success": true,
  "data": { "alert": {...} }
}
```

### Get Goal Risk Score
```http
GET /api/goal-early-warning/goals/{goalId}/risk
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "risk": {
      "goalId": "uuid",
      "riskScore": 72,
      "riskLevel": "high",
      "factors": {
        "paceRatio": { "value": 0.65, "impact": 25, "status": "warning" },
        "deadlineProximity": { "daysRemaining": 45, "progressPercentage": 55, "impact": 15, "status": "warning" },
        "missedContributions": { "count": 2, "impact": 12, "status": "warning" },
        "achievementProbability": { "value": 42, "impact": 8, "status": "warning" }
      },
      "calculatedAt": "2026-03-03T10:30:00Z"
    }
  }
}
```

### Track Risk Score (Manual Trigger)
```http
POST /api/goal-early-warning/goals/{goalId}/risk/track
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "tracking": {...},
    "transitionType": "escalation",
    "riskData": {...}
  }
}
```

### Get Risk History
```http
GET /api/goal-early-warning/goals/{goalId}/risk/history
Authorization: Bearer {token}

Query Parameters:
- limit (integer, default: 30): Number of history records

Response:
{
  "success": true,
  "data": {
    "history": [{
      "id": "uuid",
      "currentRiskLevel": "high",
      "previousRiskLevel": "medium",
      "riskScore": "72",
      "transitionType": "escalation",
      "calculatedAt": "2026-03-03T10:30:00Z"
    }],
    "count": 30
  }
}
```

### Update Contribution Streak
```http
POST /api/goal-early-warning/goals/{goalId}/contribution-streak
Authorization: Bearer {token}
Content-Type: application/json

{
  "contributionMade": true
}

Response:
{
  "success": true,
  "data": {
    "streak": {
      "streakType": "active",
      "currentStreak": 5,
      "longestStreak": 12,
      "missedCount": 0,
      "isAtRisk": false
    }
  }
}
```

### Monitor All User Goals
```http
POST /api/goal-early-warning/monitor
Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": {
    "results": [{
      "goalId": "uuid",
      "goalName": "House Down Payment",
      "status": "monitored",
      "trackingResult": {...}
    }],
    "monitored": 5
  }
}
```

## Integration Guide

### 1. Track Goal Contributions
When a user makes a contribution to a goal:

```javascript
// After saving contribution
await fetch('/api/goal-early-warning/goals/${goalId}/contribution-streak', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ contributionMade: true })
});
```

### 2. Monitor Risk Periodically
Set up a cron job or scheduled task:

```javascript
// Run daily for all active goals
import goalEarlyWarningService from './services/goalEarlyWarningService.js';

// For a specific user
await goalEarlyWarningService.monitorUserGoals(userId);

// Or via API endpoint
await fetch('/api/goal-early-warning/monitor', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 3. Display Alerts in Dashboard
```javascript
// Fetch unread alerts for user
const response = await fetch('/api/goal-early-warning/alerts?unreadOnly=true', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const { data } = await response.json();
const alerts = data.alerts;

// Display alert with recovery actions
alerts.forEach(alert => {
  console.log(`${alert.title}: ${alert.message}`);
  alert.recoveryActions.forEach(action => {
    console.log(`- ${action.title}: ${action.description}`);
  });
});
```

### 4. Handle User Actions
```javascript
// When user takes action
await fetch(`/api/goal-early-warning/alerts/${alertId}/action`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ action: 'increase_contributions' })
});
```

## Service Methods

### GoalEarlyWarningService

```javascript
import goalEarlyWarningService from './services/goalEarlyWarningService.js';

// Calculate risk score for a goal
const risk = await goalEarlyWarningService.calculateGoalRiskScore(goalId);
// Returns: { goalId, riskScore, riskLevel, factors, calculatedAt }

// Track risk and trigger alerts if needed
const result = await goalEarlyWarningService.trackRiskScore(goalId, userId);
// Returns: { tracking, transitionType, riskData }

// Update contribution streak
const streak = await goalEarlyWarningService.updateContributionStreak(
  goalId, 
  userId, 
  contributionMade // boolean
);

// Get alerts
const alerts = await goalEarlyWarningService.getAlerts({
  userId,
  goalId,
  unreadOnly: true,
  limit: 20,
  offset: 0
});

// Mark alert as read
const alert = await goalEarlyWarningService.markAlertRead(alertId, userId);

// Record action taken
const updatedAlert = await goalEarlyWarningService.recordAlertAction(
  alertId, 
  userId, 
  'increase_contributions'
);

// Get risk history
const history = await goalEarlyWarningService.getRiskHistory(goalId, 30);
```

## Configuration

### Risk Thresholds (Customizable)
```javascript
// In goalEarlyWarningService.js constructor
this.riskThresholds = {
  low: { min: 0, max: 33 },
  medium: { min: 34, max: 66 },
  high: { min: 67, max: 100 }
};

this.missedContributionThreshold = 2; // Alert after 2 missed
this.prolongedInactivityDays = 30; // Alert after 30 days
```

### Notification Channels
Configure in user preferences (existing notification system):
```javascript
preferences.notifications = {
  email: true,    // Send email alerts
  push: true,     // Send push notifications
  inApp: true     // Store in-app notifications
};
```

## Testing

### Test Alert Generation
```bash
# Start server
npm start

# Make API request to trigger monitoring
curl -X POST http://localhost:5000/api/goal-early-warning/monitor \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check alerts
curl http://localhost:5000/api/goal-early-warning/alerts \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Manual Risk Calculation
```bash
# Calculate risk for specific goal
curl http://localhost:5000/api/goal-early-warning/goals/{goalId}/risk \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Production Deployment

### 1. Run Database Migration
```bash
# Schema is already added to schema.js
# Run Drizzle migration
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 2. Setup Cron Job
Add to your scheduler (e.g., node-cron, GitHub Actions, or external cron service):

```javascript
import cron from 'node-cron';
import goalEarlyWarningService from './services/goalEarlyWarningService.js';
import db from './config/db.js';
import { users, financialGoals } from './db/schema.js';
import { eq } from 'drizzle-orm';

// Run daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('[Cron] Running goal early warning monitor');
  
  // Get all active users
  const activeUsers = await db.select({ id: users.id }).from(users);
  
  for (const user of activeUsers) {
    try {
      await goalEarlyWarningService.monitorUserGoals(user.id);
    } catch (error) {
      console.error(`Error monitoring user ${user.id}:`, error);
    }
  }
});
```

### 3. Configure Push Notifications
Ensure VAPID keys are set in .env:
```env
VAPID_SUBJECT=mailto:your-email@example.com
VAPID_PUBLIC_KEY=your-public-key
VAPID_PRIVATE_KEY=your-private-key
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

## Example Alert Flow

1. **User misses 2nd consecutive contribution**
   - `contributionStreaks.missedCount` reaches threshold
   - Alert triggered: `missed_contribution_streak`
   - Recovery actions generated:
     - Setup automatic transfers
     - Adjust contribution frequency
   
2. **Goal risk escalates from medium to high**
   - Risk score increases from 55 to 72
   - Transition detected: `escalation`
   - Alert triggered: `risk_escalation`
   - Recovery actions generated:
     - Increase monthly contributions
     - Extend deadline
     - Adjust target amount

3. **30 days without contribution**
   - No contributions for 30+ days
   - Alert triggered: `prolonged_inactivity`
   - Recovery actions generated:
     - Review goal relevance
     - Make a small contribution

## Alert Examples

### Risk Escalation Alert
```json
{
  "id": "alert-uuid",
  "alertType": "risk_escalation",
  "severity": "critical",
  "title": "⚠️ Goal Risk Escalated: House Down Payment",
  "message": "Your goal 'House Down Payment' risk level has increased from medium to high (score: 72/100). Immediate action recommended.",
  "recoveryActions": [
    {
      "action": "increase_contributions",
      "title": "Increase Monthly Contributions",
      "description": "Your current pace is 65% of the required rate. Consider increasing your monthly contribution.",
      "priority": "high",
      "estimatedImpact": "Brings you back on track to meet your goal deadline."
    }
  ]
}
```

### Missed Contribution Streak Alert
```json
{
  "id": "alert-uuid",
  "alertType": "missed_contribution_streak",
  "severity": "high",
  "title": "📉 Missed Contributions: Emergency Fund",
  "message": "You've missed 2 consecutive contributions for 'Emergency Fund'. Let's get you back on track!",
  "recoveryActions": [
    {
      "action": "setup_auto_transfer",
      "title": "Enable Automatic Transfers",
      "description": "Set up automatic recurring transfers to ensure consistent contributions.",
      "priority": "high",
      "estimatedImpact": "Prevents future missed contributions and maintains progress momentum."
    }
  ]
}
```

## Done Criteria ✅

- ✅ Notification triggers from risk score transitions (low→medium, medium→high)
- ✅ Missed-contribution streak threshold detection (2+ missed)
- ✅ Prolonged inactivity detection (30+ days)
- ✅ In-app alert storage and retrieval
- ✅ Push notification integration
- ✅ Email alert capability (via existing notification service)
- ✅ Recommended recovery actions for each alert type
- ✅ Users receive alerts for risk escalation
- ✅ Users receive alerts for prolonged inactivity
- ✅ Dashboard API endpoints for alert management
- ✅ Alert read/dismiss functionality
- ✅ Action tracking for user responses

## Files Created/Modified

### New Files
1. `backend/services/goalEarlyWarningService.js` - Core early warning logic
2. `backend/routes/goalEarlyWarning.js` - API endpoints

### Modified Files
1. `backend/db/schema.js` - Added 3 new tables with relations
2. `backend/server.js` - Registered new routes

## Next Steps (Optional Enhancements)

1. **Dashboard UI Components**
   - Alert notification bell icon
   - Alert feed component
   - Risk score visualization
   - Recovery action buttons

2. **Advanced Features**
   - ML-based risk prediction
   - Personalized alert frequency
   - Smart snooze (e.g., "remind me in 3 days")
   - Alert aggregation (digest mode)

3. **Analytics**
   - Alert response rate tracking
   - Recovery action effectiveness metrics
   - Risk trend analysis per user

4. **Admin Features**
   - Global risk threshold configuration
   - Alert template customization
   - Bulk alert management
