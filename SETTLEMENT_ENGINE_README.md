# Settlement Engine - Real-Time Collaborative Expense Splitting

## Overview

The Settlement Engine provides comprehensive expense splitting and settlement tracking capabilities for collaborative expenses. It supports multiple split types, real-time payment tracking, settlement optimization, and automated payment reminders.

## Features

### 1. **Multiple Split Types**
- **Equal Split**: Divide expenses equally among participants
- **Percentage Split**: Custom percentage allocation
- **Custom Split**: Specify exact amounts for each participant
- **Weighted Split**: Split based on weights (income, usage, etc.)
- **Itemized Split**: Restaurant bills with individual and shared items

### 2. **Settlement Tracking**
- Real-time settlement status (pending, partial, completed, cancelled)
- Individual transaction tracking
- Payment history and audit trail
- Overdue detection and escalation

### 3. **Settlement Optimization**
- Graph-based algorithm to minimize number of transactions
- Net balance calculation across multiple settlements
- Optimal payment path suggestions

### 4. **Automated Reminders**
- Initial reminders on due date
- Follow-up reminders (3 days overdue)
- Escalation reminders (7 days overdue)
- Final reminders (30 days overdue)
- Weekly settlement summaries

### 5. **Recurring Settlements**
- Support for recurring expenses (weekly, monthly, quarterly)
- Automatic settlement creation
- Configurable frequency and due dates

## Database Schema

### Settlements Table
```sql
CREATE TABLE settlements (
  id UUID PRIMARY KEY,
  expense_id UUID REFERENCES expenses(id),
  creator_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  total_amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  split_type TEXT NOT NULL,
  split_rule JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  settled_amount NUMERIC(12,2) DEFAULT 0,
  remaining_amount NUMERIC(12,2),
  due_date TIMESTAMP,
  is_recurring BOOLEAN DEFAULT false,
  recurring_frequency TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### Settlement Transactions Table
```sql
CREATE TABLE settlement_transactions (
  id UUID PRIMARY KEY,
  settlement_id UUID REFERENCES settlements(id),
  payer_id UUID REFERENCES users(id),
  payee_id UUID REFERENCES users(id),
  amount NUMERIC(12,2) NOT NULL,
  amount_due NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  amount_remaining NUMERIC(12,2),
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  notes TEXT,
  paid_at TIMESTAMP,
  due_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Split Rules Table
```sql
CREATE TABLE split_rules (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  split_type TEXT NOT NULL,
  participants JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Payment Reminders Table
```sql
CREATE TABLE payment_reminders (
  id UUID PRIMARY KEY,
  settlement_id UUID REFERENCES settlements(id),
  transaction_id UUID REFERENCES settlement_transactions(id),
  recipient_id UUID REFERENCES users(id),
  reminder_type TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  scheduled_for TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  delivery_method TEXT DEFAULT 'email',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Create Expense Split
```http
POST /api/expense-splits/create
Authorization: Bearer <token>

{
  "title": "Dinner at Restaurant",
  "totalAmount": 150.00,
  "splitType": "equal",
  "participants": [
    { "userId": "user-1", "name": "Alice" },
    { "userId": "user-2", "name": "Bob" },
    { "userId": "user-3", "name": "Charlie" }
  ],
  "dueDate": "2026-02-15T00:00:00Z",
  "currency": "USD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "settlement": {
      "id": "settlement-id",
      "title": "Dinner at Restaurant",
      "totalAmount": "150.00",
      "splitType": "equal",
      "status": "pending",
      "settledAmount": "0.00",
      "remainingAmount": "150.00"
    },
    "transactions": [
      {
        "id": "txn-1",
        "payerId": "user-1",
        "payeeId": "user-1",
        "amount": "50.00",
        "status": "pending"
      }
    ],
    "summary": {
      "totalParticipants": 3,
      "totalAmount": 150,
      "splitType": "equal",
      "transactionCount": 2
    }
  }
}
```

### Record Payment
```http
POST /api/expense-splits/:transactionId/pay
Authorization: Bearer <token>

{
  "amount": 50.00,
  "paymentMethod": "venmo",
  "paymentReference": "VEN-12345",
  "notes": "Paid via Venmo"
}
```

### Get Settlement Summary
```http
GET /api/expense-splits/summary/:userId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOwed": 125.50,
    "totalOwedToUser": 200.00,
    "netPosition": 74.50,
    "status": "creditor",
    "transactions": {
      "asPayer": 5,
      "asPayee": 8,
      "total": 13
    }
  }
}
```

### Calculate Split (Preview)
```http
POST /api/expense-splits/calculate-split
Authorization: Bearer <token>

{
  "totalAmount": 200.00,
  "splitType": "percentage",
  "participants": [
    { "userId": "user-1", "name": "Alice", "percentage": 40 },
    { "userId": "user-2", "name": "Bob", "percentage": 35 },
    { "userId": "user-3", "name": "Charlie", "percentage": 25 }
  ]
}
```

### Calculate Itemized Split
```http
POST /api/expense-splits/calculate-itemized
Authorization: Bearer <token>

{
  "items": [
    { "userId": "user-1", "amount": 25.00, "description": "Burger" },
    { "userId": "user-2", "amount": 30.00, "description": "Steak" }
  ],
  "sharedItems": [
    { "amount": 15.00, "description": "Appetizer" },
    { "amount": 10.00, "description": "Dessert" }
  ],
  "participants": [
    { "userId": "user-1", "name": "Alice" },
    { "userId": "user-2", "name": "Bob" }
  ]
}
```

### Optimize Settlement Path
```http
POST /api/expense-splits/optimize
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "original": {
      "transactionCount": 8,
      "totalAmount": 450.00
    },
    "optimized": {
      "transactionCount": 3,
      "transactions": [
        { "from": "user-1", "to": "user-2", "amount": 50.00 },
        { "from": "user-3", "to": "user-2", "amount": 75.00 }
      ],
      "savings": 5
    }
  },
  "message": "Optimized settlement reduces transactions by 5"
}
```

### Cancel Settlement
```http
POST /api/expense-splits/:settlementId/cancel
Authorization: Bearer <token>
```

## Split Types

### 1. Equal Split
Divides the total amount equally among all participants.

**Example:**
- Total: $150
- Participants: 3
- Each pays: $50

### 2. Percentage Split
Allocates amounts based on specified percentages (must sum to 100%).

**Example:**
- Total: $200
- Alice: 40% = $80
- Bob: 35% = $70
- Charlie: 25% = $50

### 3. Custom Split
Specify exact amounts for each participant (must sum to total).

**Example:**
- Total: $100
- Alice: $40
- Bob: $35
- Charlie: $25

### 4. Weighted Split
Allocates based on weights (e.g., income, usage).

**Example:**
- Total: $300
- Alice (weight: 2): $150
- Bob (weight: 1): $75
- Charlie (weight: 1): $75

### 5. Itemized Split
For restaurant bills with individual and shared items.

**Example:**
- Alice's items: $25
- Bob's items: $30
- Shared items: $25 (split equally)
- Alice pays: $37.50
- Bob pays: $42.50

## Settlement Optimization Algorithm

The settlement engine uses a graph-based algorithm to minimize the number of transactions required to settle all debts.

**Example:**
```
Original debts:
- Alice owes Bob $50
- Alice owes Charlie $30
- Bob owes Charlie $20

Optimized:
- Alice owes Charlie $10
- Alice owes Bob $30
(Reduced from 3 to 2 transactions)
```

## Payment Reminders

### Reminder Schedule
- **Initial**: On due date
- **Follow-up**: 3 days overdue
- **Escalation**: 7 days overdue
- **Final**: 30 days overdue
- **Weekly Summary**: Every Monday

### Reminder Types
- `initial`: Payment due today
- `follow_up`: Payment overdue (3 days)
- `escalation`: Payment overdue (1 week)
- `final`: Payment overdue (1 month)

## Background Jobs

### Settlement Reminder Job
- **Schedule**: Daily at 9 AM
- **Function**: Sends automated payment reminders
- **Features**:
  - Overdue detection
  - Escalation logic
  - Weekly summaries
  - Delivery via email/SMS/push

## Usage Examples

### Creating an Equal Split
```javascript
const settlement = await settlementEngine.createSettlement({
  title: "Team Lunch",
  totalAmount: 120,
  splitType: "equal",
  participants: [
    { userId: "user-1", name: "Alice" },
    { userId: "user-2", name: "Bob" },
    { userId: "user-3", name: "Charlie" },
    { userId: "user-4", name: "David" }
  ],
  dueDate: "2026-02-20",
  creatorId: "user-1"
});
```

### Recording a Payment
```javascript
const payment = await settlementEngine.recordPayment({
  transactionId: "txn-123",
  amount: 30,
  paymentMethod: "venmo",
  paymentReference: "VEN-789"
});
```

### Getting Optimal Settlement Path
```javascript
const optimized = await settlementEngine.calculateOptimalSettlement("user-1");
console.log(`Reduced from ${optimized.original.transactionCount} to ${optimized.optimized.transactionCount} transactions`);
```

## Error Handling

All API endpoints return standardized error responses:

```json
{
  "success": false,
  "errors": [
    {
      "msg": "Total amount must be greater than 0",
      "param": "totalAmount",
      "location": "body"
    }
  ]
}
```

## Security

- All endpoints require authentication (`protect` middleware)
- Input validation via `express-validator`
- Settlement access control (participants only)
- Rate limiting on settlement creation
- Payment amount validation

## Future Enhancements

1. **Payment Platform Integration**
   - Venmo, PayPal, Zelle direct payments
   - Automatic payment verification

2. **Smart Split Suggestions**
   - ML-based split recommendations
   - Historical pattern analysis

3. **Multi-Currency Support**
   - Automatic currency conversion
   - Real-time exchange rates

4. **Group Management**
   - Predefined groups for recurring splits
   - Group-level settlement tracking

5. **Advanced Analytics**
   - Spending patterns by group
   - Settlement velocity metrics
   - Payment reliability scores

## Support

For issues or questions, please contact the development team or create an issue in the repository.

---

**Version**: 1.0.0  
**Last Updated**: February 9, 2026  
**Issue**: #290
