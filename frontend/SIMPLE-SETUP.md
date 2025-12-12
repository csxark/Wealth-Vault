# Simple Database Setup Guide

This guide will help you set up a simple database for storing and fetching data in your Wealth Vault app.

## 🚀 Quick Start

### 1. Set up Supabase
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for your project to be ready
3. Go to Settings > API and copy your Project URL and anon key

### 2. Configure Environment Variables
```bash
cd frontend
npm run setup
```
Follow the prompts to enter your Supabase credentials.

### 3. Set up Database Schema
1. In your Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `simple-schema.sql`
3. Paste and run the SQL script
4. This creates 3 simple tables:
   - `profiles` - User information
   - `transactions` - Financial transactions
   - `goals` - Financial goals

### 4. Test the Setup
1. Start the app: `npm run dev`
2. Sign up or log in
3. Go to **Test DB** in the sidebar
4. Click **Run All Tests** to verify everything works

## 📊 Database Structure

### Profiles Table
```sql
profiles (
  id UUID PRIMARY KEY,           -- User ID (from auth)
  full_name TEXT,                -- User's full name
  phone TEXT,                    -- Phone number
  monthly_income DECIMAL(12,2),  -- Monthly income
  created_at TIMESTAMP           -- When profile was created
)
```

### Transactions Table
```sql
transactions (
  id UUID PRIMARY KEY,           -- Unique transaction ID
  user_id UUID,                  -- User who made the transaction
  amount DECIMAL(12,2),          -- Amount (negative = expense)
  description TEXT,              -- Transaction description
  category TEXT,                 -- safe/impulsive/anxious
  date DATE,                     -- Transaction date
  created_at TIMESTAMP           -- When transaction was created
)
```

### Goals Table
```sql
goals (
  id UUID PRIMARY KEY,           -- Unique goal ID
  user_id UUID,                  -- User who owns the goal
  title TEXT,                    -- Goal title
  target_amount DECIMAL(12,2),   -- Target amount
  current_amount DECIMAL(12,2),  -- Current progress
  target_date DATE,              -- Target completion date
  created_at TIMESTAMP           -- When goal was created
)
```

## 🔧 Using the Database

### Basic Operations

#### Save a Profile
```typescript
import { profiles } from '../lib/simple-db';

const result = await profiles.save({
  id: user.id,
  full_name: 'John Doe',
  phone: '+91 98765 43210',
  monthly_income: 50000
});
```

#### Add a Transaction
```typescript
import { transactions } from '../lib/simple-db';

const result = await transactions.add({
  user_id: user.id,
  amount: -1500,  // Negative = expense
  description: 'Grocery shopping',
  category: 'safe'
});
```

#### Add a Goal
```typescript
import { goals } from '../lib/simple-db';

const result = await goals.add({
  user_id: user.id,
  title: 'House Down Payment',
  target_amount: 1000000,
  target_date: '2025-12-31'
});
```

#### Get All Data
```typescript
// Get user profile
const profile = await profiles.get(user.id);

// Get all transactions
const transactions = await transactions.getAll(user.id);

// Get all goals
const goals = await goals.getAll(user.id);

// Get spending summary
const summary = await utils.getSpendingSummary(user.id);
```

## 🧪 Testing

Use the **Test DB** panel to:
- ✅ Test database connection
- ✅ Test profile operations
- ✅ Test transaction operations
- ✅ Test goal operations
- ✅ Test spending summary
- ✅ Run all tests at once

## 🚨 Troubleshooting

### Common Issues

1. **"column does not exist" error**
   - Make sure you ran the `simple-schema.sql` script
   - Check that all tables were created successfully

2. **"permission denied" error**
   - Ensure Row Level Security (RLS) policies are set up
   - Check that you're logged in with a valid user

3. **"connection failed" error**
   - Verify your Supabase URL and anon key in `.env`
   - Check that your Supabase project is active

### Debug Mode
Enable debug mode in your `.env` file:
```env
VITE_DEBUG=true
```

This will show detailed console logs for all database operations.

## 📝 Next Steps

Once the basic setup is working:

1. **Customize the schema** - Add more fields to tables
2. **Add more operations** - Update, delete, search functions
3. **Add relationships** - Connect tables with foreign keys
4. **Add indexes** - Improve query performance
5. **Add validation** - Ensure data integrity

## 🆘 Need Help?

- Check the console for error messages
- Use the Test DB panel to isolate issues
- Verify your Supabase project settings
- Check the [Supabase documentation](https://supabase.com/docs) 