# Automated Bill Payment & Recurring Transaction Manager

## Overview
The Automated Bill Payment & Recurring Transaction Manager provides intelligent automation for managing recurring expenses, scheduling bill payments, sending timely reminders, and executing auto-payments. This feature helps users stay on top of their financial obligations while reducing manual effort.

## Key Features

### 1. **Automatic Recurring Transaction Detection** 🔍
- **Pattern Recognition**: Analyzes historical transactions to identify recurring patterns
- **Frequency Detection**: Automatically detects weekly, biweekly, monthly, quarterly, and yearly patterns
- **Confidence Scoring**: Assigns confidence scores (0-1) based on consistency and data quality
- **Amount Variance Tracking**: Monitors amount fluctuations to ensure accurate predictions

### 2. **Bill Payment Scheduling** 📅
- **Manual Scheduling**: Schedule one-time or recurring payments
- **Auto-Payment Execution**: Automatically process payments on scheduled dates
- **Payment Methods**: Support for credit cards, debit cards, bank accounts, and more
- **Confirmation Tracking**: Generate and store payment confirmation numbers

### 3. **Payment Reminders** 🔔
- **Multi-Level Reminders**: Send reminders 7, 3, and 1 day(s) before due date
- **Due Today Alerts**: Special alerts for payments due on the current day
- **Multiple Channels**: Email, SMS, push notifications, and in-app alerts
- **Customizable Timing**: Configure reminder preferences per payment

### 4. **Subscription Tracking** 💳
- **Centralized Management**: Track all subscriptions in one place
- **Renewal Alerts**: Get notified before subscriptions renew
- **Cost Analysis**: View total monthly and annual subscription costs
- **Cancellation Tracking**: Monitor trial periods and cancellation dates

### 5. **Payment Analytics** 📊
- **Success Rate Tracking**: Monitor payment completion rates
- **Spending Insights**: Analyze recurring payment trends
- **Payment History**: Complete audit trail of all transactions
- **Cost Optimization**: Identify opportunities to reduce recurring expenses

## Database Schema

### Recurring Transactions Table
```sql
CREATE TABLE recurring_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  name TEXT NOT NULL,
  merchant_name TEXT,
  amount NUMERIC(12,2) NOT NULL,
  frequency TEXT NOT NULL, -- weekly, biweekly, monthly, quarterly, yearly
  next_due_date TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'active',
  is_auto_pay_enabled BOOLEAN DEFAULT false,
  confidence DOUBLE PRECISION DEFAULT 0.85,
  detection_method TEXT DEFAULT 'pattern',
  occurrence_count INTEGER DEFAULT 0,
  average_amount NUMERIC(12,2),
  variance_amount DOUBLE PRECISION,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Scheduled Payments Table
```sql
CREATE TABLE scheduled_payments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  recurring_transaction_id UUID REFERENCES recurring_transactions(id),
  payee_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP,
  status TEXT DEFAULT 'pending',
  is_auto_pay BOOLEAN DEFAULT false,
  confirmation_number TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Payment Reminders Table
```sql
CREATE TABLE payment_reminders_tracking (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  scheduled_payment_id UUID REFERENCES scheduled_payments(id),
  reminder_type TEXT NOT NULL,
  reminder_date TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Subscription Tracking Table
```sql
CREATE TABLE subscription_tracking (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  service_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  billing_cycle TEXT NOT NULL,
  renewal_date TIMESTAMP NOT NULL,
  status TEXT DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT true,
  total_spent NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Recurring Transaction Detection
```http
POST /api/recurring-payments/detect
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "detected": 5,
    "patterns": [
      {
        "merchant": "netflix",
        "amount": 15.99,
        "frequency": "monthly",
        "confidence": 0.92
      }
    ]
  }
}
```

### Get Recurring Transactions
```http
GET /api/recurring-payments/recurring?status=active
Authorization: Bearer <token>
```

### Create Manual Recurring Transaction
```http
POST /api/recurring-payments/recurring
Authorization: Bearer <token>

{
  "name": "Netflix Subscription",
  "amount": 15.99,
  "frequency": "monthly",
  "nextDueDate": "2026-03-01",
  "isAutoPayEnabled": true
}
```

### Schedule Payment
```http
POST /api/recurring-payments/schedule
Authorization: Bearer <token>

{
  "payeeName": "Electric Company",
  "amount": 125.50,
  "scheduledDate": "2026-02-15",
  "dueDate": "2026-02-20",
  "isAutoPay": true,
  "paymentMethod": "bank_account"
}
```

### Get Upcoming Payments
```http
GET /api/recurring-payments/upcoming?days=30
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "payeeName": "Electric Company",
      "amount": "125.50",
      "scheduledDate": "2026-02-15",
      "status": "pending"
    }
  ],
  "count": 1
}
```

### Execute Auto-Payment
```http
POST /api/recurring-payments/pay/:id
Authorization: Bearer <token>
```

### Get Payment History
```http
GET /api/recurring-payments/history?limit=50
Authorization: Bearer <token>
```

### Payment Analytics
```http
GET /api/recurring-payments/analytics
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPayments": 120,
    "completedPayments": 114,
    "failedPayments": 6,
    "totalPaid": 15420.50,
    "successRate": 95.0,
    "avgPaymentAmount": 135.27
  }
}
```

### Subscription Management
```http
POST /api/recurring-payments/subscriptions
GET /api/recurring-payments/subscriptions?status=active
PUT /api/recurring-payments/subscriptions/:id
DELETE /api/recurring-payments/subscriptions/:id
```

## Background Jobs

### Recurring Payment Processor
Runs on multiple schedules:

**Payment Processing** (Daily at 6 AM):
- Processes all auto-payments scheduled for the day
- Updates payment status and confirmation numbers
- Handles payment failures and retries

**Reminder Sending** (Every 4 hours):
- Sends payment reminders based on due dates
- Tracks reminder delivery status
- Supports multiple notification channels

**Recurring Payment Generation** (Daily at midnight):
- Creates scheduled payments from recurring transactions
- Calculates next due dates
- Prevents duplicate payment scheduling

## Detection Algorithm

### Pattern Recognition
The system analyzes transactions using:

1. **Merchant Grouping**: Normalizes merchant names
2. **Amount Consistency**: Checks for amount variance < 5%
3. **Date Interval Analysis**: Detects regular payment intervals
4. **Minimum Occurrences**: Requires at least 3 occurrences
5. **Confidence Calculation**: Based on data quality and consistency

### Frequency Detection
```javascript
Average Interval → Frequency
7 days ± 3 days → Weekly
14 days ± 3 days → Biweekly
30 days ± 3 days → Monthly
90 days ± 6 days → Quarterly
365 days ± 9 days → Yearly
```

### Confidence Scoring
```
Base Score: 0.5
+ Occurrences ≥ 12: +0.3
+ Occurrences ≥ 6: +0.2
+ Variance < 2%: +0.2
+ Variance < 5%: +0.1
Maximum: 0.95
```

## Auto-Payment Workflow

1. **Scheduling**: User schedules payment with auto-pay enabled
2. **Reminder Generation**: System creates reminder schedule
3. **Reminder Sending**: Sends alerts at configured intervals
4. **Payment Processing**: Executes payment on scheduled date
5. **Confirmation**: Generates confirmation number
6. **Recurring Update**: Updates next due date for recurring transactions

## Payment Methods

Supported payment methods:
- **Credit Card**: Visa, Mastercard, Amex, Discover
- **Debit Card**: Bank-issued debit cards
- **Bank Account**: ACH direct debit
- **Digital Wallets**: PayPal, Venmo, etc.
- **Other**: Check, cash (manual only)

## Security Features

- **Payment Limits**: Auto-pay capped at $10,000 per transaction
- **Confirmation Required**: Large payments require manual approval
- **Audit Trail**: Complete history of all payment activities
- **Encryption**: All payment data encrypted at rest and in transit
- **Authentication**: All endpoints require valid JWT token

## Usage Examples

### Detect Recurring Patterns
```javascript
const result = await fetch('/api/recurring-payments/detect', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

console.log(`Detected ${result.data.detected} recurring patterns`);
```

### Schedule Auto-Payment
```javascript
const payment = await fetch('/api/recurring-payments/schedule', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    payeeName: 'Rent',
    amount: 1500,
    scheduledDate: '2026-03-01',
    isAutoPay: true,
    paymentMethod: 'bank_account'
  })
});
```

### Track Subscriptions
```javascript
const subscriptions = await fetch('/api/recurring-payments/subscriptions', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const totalMonthly = subscriptions.data.summary.totalMonthly;
console.log(`Total monthly subscriptions: $${totalMonthly}`);
```

## Best Practices

1. **Review Auto-Detections**: Always verify automatically detected recurring transactions
2. **Set Payment Limits**: Configure appropriate limits for auto-payments
3. **Monitor Failures**: Regularly check payment failure reports
4. **Update Payment Methods**: Keep payment information current
5. **Review Subscriptions**: Audit subscriptions quarterly to eliminate unused services

## Future Enhancements

1. **Smart Scheduling**: ML-based optimal payment date suggestions
2. **Bill Negotiation**: Automated bill negotiation for utilities
3. **Cashback Optimization**: Recommend best payment methods for rewards
4. **Budget Integration**: Auto-adjust budgets based on recurring payments
5. **Vendor Integration**: Direct integration with major billers

---

**Version**: 1.0.0  
**Last Updated**: February 9, 2026  
**Issue**: #298
