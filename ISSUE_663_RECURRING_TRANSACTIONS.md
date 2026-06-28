# Issue #663: Recurring Transactions & Bill Tracking

## Overview
Implement intelligent recurring transaction detection and comprehensive bill tracking system to help users automatically identify subscriptions, manage recurring payments, and never miss bill due dates.

## Problem Statement
- Users manually track subscriptions and recurring bills
- Hard to identify recurring patterns across 100+ transactions
- Miss payment deadlines and get charged late fees
- No visibility into total recurring monthly/annual costs
- Can't easily identify duplicate subscriptions or forgotten services
- Overdue payments go unnoticed

## Solution Components

### 1. Recurring Pattern Detection
**Purpose:** Auto-identify recurring transactions from transaction history

**Detection Algorithm:**
- Scan transaction history (6-12 months)
- Group by merchant, amount, and category
- Analyze transaction frequency intervals
- Calculate confidence score based on:
  - Number of occurrences (min 3)
  - Interval consistency (std dev < 5 days for monthly)
  - Amount consistency (variance < 10%)
  - Category classification match

**Frequency Types:**
- Daily (e.g., coffee)
- Weekly (gym membership)
- Bi-weekly (paycheck)
- Monthly (subscriptions, utilities)
- Quarterly (car insurance)
- Annual (software licenses, memberships)
- Custom (every 35 days, etc.)

**Confidence Scoring:**
```
Confidence = (Occurrences × 20%) + (Consistency × 40%) + 
             (Amount Match × 20%) + (Category Match × 20%)
```

### 2. Bill Calendar
**Purpose:** Centralized view of upcoming and past due bills

**Features:**
- Monthly/yearly bill calendar view
- Color coding by status (due, paid, overdue, upcoming)
- Bill notification 7/14 days before due date
- Overdue alerts with highlighted past-due periods
- Bill amount and due date visibility
- Payment history tracking

**Status Types:**
- `scheduled` - Future payment
- `due` - Within 7 days
- `overdue` - Past due date
- `paid` - Completed
- `skipped` - User skipped payment
- `auto_paid` - Paid by automation

### 3. Subscription Dashboard
**Purpose:** Unified view of all subscriptions and recurring costs

**Features:**
- List all detected subscriptions
- Categorize by type (Software, Streaming, Utilities, Insurance, etc.)
- Total monthly/annual recurring cost
- Subscription start date and status
- Sorting by amount, category, frequency
- Compare budget vs actual recurring
- Mark duplicate subscriptions for review

**Metrics:**
- Monthly recurring cost: $XXX
- Annual recurring cost: $X,XXX
- Number of subscriptions: N
- Cost trend (up/down/flat)
- Spending by category

### 4. Duplicate Detection
**Purpose:** Identify and flag duplicate subscriptions

**Logic:**
- Same merchant, similar amounts
- Same category (e.g., 2 video streaming)
- Different payment methods
- User confirmation workflow

**Example:** Detect Netflix on two credit cards

### 5. Overdue Alerts
**Purpose:** Notify users of missed payments

**Triggers:**
- Payment 1 day overdue
- Payment 7 days overdue
- Payment 30 days overdue
- Multiple overdue bills

**Notification Channels:**
- Email
- Push notification
- SMS (optional)
- In-app dashboard badge

### 6. Bill Management Features
- Mark bills as paid manually
- Skip payment (one-time)
- Pause recurring transaction
- Edit amount/frequency
- Cancel subscription
- Add manual recurring transactions

### 7. Payment Automation
// Future enhancement
- Link to bank for auto-payment
- Schedule payments for specific dates
- Pay from specific account/vault
- Retry failed payments

## Database Schema

### New Tables (10)

1. **recurring_transactions**
   - userId, vaultId, merchantId
   - transactionName, description
   - amount, currency, category
   - frequency (daily/weekly/bi-weekly/monthly/quarterly/yearly/custom)
   - customFrequencyDays, customFrequencyCount
   - nextDueDate, lastPaymentDate
   - status (active/paused/cancelled)
   - detectionMethod (auto-detected/manual/imported)
   - confidenceScore (0-100)
   - autoDetectedAt, createdAt, updatedAt

2. **bill_payments**
   - userId, vaultId, recurringTransactionId
   - billDate, dueDate
   - status (scheduled/due/overdue/paid/skipped)
   - amount, actualAmount
   - paymentDate, paymentMethod
   - notes, relatedTransactionId
   - createdAt, updatedAt

3. **subscription_metadata**
   - recurringTransactionId
   - subscriptionType (software/streaming/utilities/insurance/memberships/other)
   - accountId, accountEmail
   - serviceProvider, businessName
   - cancellationUrl, contactInfo
   - autoRenewal, renewalDate
   - estimatedYearlyValue
   - createdAt, updatedAt

4. **duplicate_subscriptions**
   - userId, vaultId
   - primaryRecurringId, duplicateRecurringId
   - confidenceScore
   - reason (same_merchant/similar_amount/same_category)
   - status (pending_review/confirmed_duplicate/false_alarm)
   - createdAt, reviewedAt, reviewedBy

5. **recurring_alerts**
   - userId, vaultId, recurringTransactionId
   - alertType (upcoming/overdue/duplicate/payment_failed)
   - alertDate, dueDate
   - message, severity
   - isRead, isResolved
   - createdAt, acknowledgedAt

6. **bill_categories**
   - userId
   - categoryName, categoryType
   - budgetLimit, description
   - color, icon
   - createdAt, updatedAt

7. **payment_reminders**
   - userId, vaultId, recurringTransactionId
   - reminderDays (7 or 14)
   - lastReminderDate
   - nextReminderDate
   - isActive
   - reminderChannels (email/push/sms)

8. **recurring_transaction_history**
   - recurringTransactionId
   - userId, vaultId
   - previousAmount, newAmount
   - previousFrequency, newFrequency
   - changeDate, changeType
   - reason

9. **merchant_info**
   - merchantId
   - merchantName, displayName
   - logoUrl, websiteUrl
   - industry, category
   - subscriptionType
   - commonFrequency

10. **bill_reports**
    - userId, vaultId
    - reportMonth (YYYY-MM)
    - totalRecurring, totalPaid
    - billCount, paidCount, overdueCount
    - categoryBreakdown (JSON)
    - generatedAt

## Service Architecture

### recurringPatternDetector.js
- detectRecurringPatterns(userId, months = 6) → List of detected patterns
- scorePattern() → Confidence score 0-100
- validatePattern() → Check consistency
- clusterTransactions() → Group similar transactions
- getFrequencyType() → Identify frequency from intervals

### billTrackingEngine.js
- createBill(recurringId, dueDate) → New bill record
- getBillCalendar(userId, month) → Monthly view
- updateBillStatus() → Mark paid/overdue/skipped
- getBillsForMonth() → Monthly summary
- getTotalMonthlyRecurring() → Sum all recurring
- identifyOverdue() → Find past-due bills

### subscriptionManager.js
- getSubscriptions(userId) → All subscriptions with metadata
- getSubscriptionsByCategory() → Grouped by type
- getTotalAnnualCost() → Calculate yearly spending
- getMonthlyRecurringCost() → Calculate monthly
- editSubscription() → Update amount/frequency
- cancelSubscription() → Mark inactive
- pauseSubscription() → Temporarily stop

### duplicateDetector.js
- findDuplicates(userId) → Identify potential duplicates
- calculateDuplicateLikelihood() → Confidence score
- flagDuplicate() → Create duplicate record
- confirmDuplicate() → User confirms
- mergeDuplicates() → Consolidate records

### alertNotificationService.js
- createAlert() → Create alert record
- sendOverdueAlert() → Notify overdue bills
- sendUpcomingAlert() → 7/14 day reminder
- sendDuplicateAlert() → Flag found duplicates
- sendPaymentFailedAlert() → Payment issues
- getUnreadAlerts() → Unread notification count

### recurringReportGenerator.js
- generateMonthlyReport() → Summary for month
- generateAnnualReport() → Yearly breakdown
- getSpendingTrends() → Track changes
- compareMonths() → Month-to-month changes
- exportBillList() → CSV/PDF export

## Implementation Timeline
- **Phase 1 (Days 1-3):** Recurring detection + database
- **Phase 2 (Days 4-6):** Bill tracking engine
- **Phase 3 (Days 7-10):** Subscription manager + duplicate detection
- **Phase 4 (Days 11-14):** Alerts and notifications
- **Phase 5 (Days 15-18):** Reports and analytics
- **Phase 6 (Days 19-22):** API endpoints
- **Phase 7 (Days 23-26):** Frontend components
- **Phase 8 (Days 27-30):** Testing + documentation

## Key Algorithms

### Frequency Detection
```
For each merchant group:
  1. Calculate days between transactions
  2. Calculate mean interval and std dev
  3. If std dev < 10% of mean:
     Frequency = "recurring"
     Interval = ceil(mean days)
  4. Classify as daily/weekly/monthly/etc.
```

### Confidence Scoring
```
Score = 0
If occurrences >= 3:          Score += min(20, occurrences - 2)
If interval consistency > 90%: Score += 40
If amount variance < 10%:      Score += 20
If category match high:        Score += 20
Return min(100, Score)
```

### Duplicate Detection
```
For each pair of recurring transactions:
  If same merchant:           similarity += 30
  If amount within 10%:       similarity += 30
  If same category:           similarity += 25
  If different card/account:  similarity += 15
  Return similarity score
```

## Deliverables
1. ✅ Implementation plan (this document)
2. ⏳ Database migration (0025_recurring_transactions.sql)
3. ⏳ Updated schema.js with 10 new tables
4. ⏳ recurringPatternDetector.js service
5. ⏳ billTrackingEngine.js service
6. ⏳ subscriptionManager.js service
7. ⏳ duplicateDetector.js service
8. ⏳ alertNotificationService.js service
9. ⏳ recurringReportGenerator.js service
10. ⏳ API endpoints (20+ routes)
11. ⏳ Frontend components (8+ React components)
12. ⏳ Unit tests (80%+ coverage)

## Success Criteria
- ✅ Detects recurring patterns with 80%+ accuracy
- ✅ Identifies duplicates with 90%+ confidence
- ✅ Sends alerts within 15 mins of due date
- ✅ Calculates annual recurring cost accurately
- ✅ Bill calendar shows all upcoming bills
- ✅ Zero missed payment notifications
- ✅ Supports all frequency types

## Future Enhancements
- Connect to bank APIs for auto-payment
- Subscription comparison (find better deals)
- Churn prediction (predict cancellations)
- Smart bill reminders (best payment dates)
- Bill negotiation suggestions
- Cashback/rewards tracking for subscriptions
- Shared bill splitting
- Integration with calendar apps

## Notes
- Min 3 occurrences required for auto-detection
- Confidence scores help with false positive filtering
- Allow manual override of detected patterns
- Track all changes to recurring transactions
- Support currencies and multi-currency billing
- Consider timezone for due date calculations
