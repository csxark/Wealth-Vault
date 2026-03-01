-- Family Financial Planning Tables Migration
-- Adds support for children profiles, allowances, spending limits, and child transactions

-- Children Table (for child profiles in family vaults)
CREATE TABLE IF NOT EXISTS children (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    date_of_birth TIMESTAMP,
    age INTEGER,
    relationship TEXT DEFAULT 'child',
    avatar TEXT,
    color TEXT DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    -- Allowance settings
    allowance_enabled BOOLEAN DEFAULT false,
    default_allowance_amount NUMERIC(12, 2) DEFAULT '0',
    allowance_frequency TEXT DEFAULT 'weekly',
    allowance_day INTEGER DEFAULT 1,
    -- Learning settings
    spending_limit_enabled BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT true,
    approval_threshold NUMERIC(12, 2) DEFAULT '25.00',
    -- Gamification
    gamification_enabled BOOLEAN DEFAULT true,
    current_balance NUMERIC(12, 2) DEFAULT '0',
    lifetime_earnings NUMERIC(12, 2) DEFAULT '0',
    lifetime_spent NUMERIC(12, 2) DEFAULT '0',
    metadata JSONB DEFAULT '{"interests": [], "learningLevel": "beginner", "achievements": []}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Allowances Table (for recurring allowance payments)
CREATE TABLE IF NOT EXISTS allowances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    frequency TEXT NOT NULL,
    day_of_week INTEGER,
    day_of_month INTEGER,
    start_date TIMESTAMP DEFAULT NOW(),
    end_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    is_paused BOOLEAN DEFAULT false,
    -- Automation
    auto_transfer BOOLEAN DEFAULT false,
    source_account_id UUID,
    -- Earning conditions
    require_chores BOOLEAN DEFAULT false,
    required_chores_count INTEGER DEFAULT 0,
    -- Notifications
    reminder_days_before INTEGER DEFAULT 1,
    last_payment_date TIMESTAMP,
    next_payment_date TIMESTAMP,
    total_paid NUMERIC(12, 2) DEFAULT '0',
    payment_count INTEGER DEFAULT 0,
    notes TEXT,
    metadata JSONB DEFAULT '{"paymentHistory": [], "adjustments": []}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Child Spending Limits Table (category-specific limits per child)
CREATE TABLE IF NOT EXISTS child_spending_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    -- Limit settings
    limit_type TEXT DEFAULT 'amount',
    limit_amount NUMERIC(12, 2),
    limit_percentage DOUBLE PRECISION,
    transaction_count INTEGER,
    period TEXT DEFAULT 'weekly',
    -- Enforcement
    enforcement_type TEXT DEFAULT 'warn',
    is_active BOOLEAN DEFAULT true,
    -- Current usage
    current_spent NUMERIC(12, 2) DEFAULT '0',
    current_transactions INTEGER DEFAULT 0,
    period_start TIMESTAMP DEFAULT NOW(),
    period_end TIMESTAMP,
    -- Notifications
    alert_at_percentage INTEGER DEFAULT 80,
    last_alert_sent TIMESTAMP,
    metadata JSONB DEFAULT '{"usageHistory": [], "overrideHistory": []}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Child Transactions Table (allowance payments and child expenses)
CREATE TABLE IF NOT EXISTS child_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    -- Transaction details
    type TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    description TEXT NOT NULL,
    -- For expenses
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    merchant TEXT,
    -- For allowance payments
    allowance_id UUID REFERENCES allowances(id) ON DELETE SET NULL,
    -- Status
    status TEXT DEFAULT 'completed',
    -- Approval workflow
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    approval_notes TEXT,
    -- Related expense
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    -- Running balance
    balance_after NUMERIC(12, 2) NOT NULL,
    -- Metadata
    receipt JSONB,
    location JSONB,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{"source": "manual", "device": null, "ipAddress": null}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Child Tasks/Chores Table (for earning allowances)
CREATE TABLE IF NOT EXISTS child_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    -- Task settings
    frequency TEXT DEFAULT 'weekly',
    reward_amount NUMERIC(12, 2) DEFAULT '0',
    is_required BOOLEAN DEFAULT false,
    -- Scheduling
    due_date TIMESTAMP,
    scheduled_date TIMESTAMP,
    -- Status
    status TEXT DEFAULT 'pending',
    completed_at TIMESTAMP,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Recurrence
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern JSONB,
    next_occurrence TIMESTAMP,
    -- Metadata
    category TEXT DEFAULT 'chore',
    difficulty TEXT DEFAULT 'medium',
    estimated_minutes INTEGER,
    tags JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{"completionHistory": [], "streakCount": 0}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Child Savings Goals Table (teaching goal-based saving)
CREATE TABLE IF NOT EXISTS child_savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    target_amount NUMERIC(12, 2) NOT NULL,
    current_amount NUMERIC(12, 2) DEFAULT '0',
    currency TEXT DEFAULT 'USD',
    -- Goal settings
    category TEXT DEFAULT 'toy',
    priority TEXT DEFAULT 'medium',
    deadline TIMESTAMP,
    -- Visual elements
    image_url TEXT,
    color TEXT DEFAULT '#10B981',
    -- Status
    status TEXT DEFAULT 'active',
    completed_at TIMESTAMP,
    -- Parental controls
    parent_contribution NUMERIC(12, 2) DEFAULT '0',
    match_percentage DOUBLE PRECISION DEFAULT 0,
    -- Gamification
    milestone_rewards JSONB DEFAULT '[]',
    is_celebrated BOOLEAN DEFAULT false,
    -- Metadata
    tags JSONB DEFAULT '[]',
    notes TEXT,
    metadata JSONB DEFAULT '{"contributionHistory": [], "milestoneHistory": []}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_children_user_id ON children(user_id);
CREATE INDEX IF NOT EXISTS idx_children_vault_id ON children(vault_id);
CREATE INDEX IF NOT EXISTS idx_allowances_user_id ON allowances(user_id);
CREATE INDEX IF NOT EXISTS idx_allowances_child_id ON allowances(child_id);
CREATE INDEX IF NOT EXISTS idx_child_spending_limits_user_id ON child_spending_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_child_spending_limits_child_id ON child_spending_limits(child_id);
CREATE INDEX IF NOT EXISTS idx_child_transactions_user_id ON child_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_child_transactions_child_id ON child_transactions(child_id);
CREATE INDEX IF NOT EXISTS idx_child_transactions_type ON child_transactions(type);
CREATE INDEX IF NOT EXISTS idx_child_tasks_user_id ON child_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_child_tasks_child_id ON child_tasks(child_id);
CREATE INDEX IF NOT EXISTS idx_child_tasks_status ON child_tasks(status);
CREATE INDEX IF NOT EXISTS idx_child_savings_goals_user_id ON child_savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_child_savings_goals_child_id ON child_savings_goals(child_id);
CREATE INDEX IF NOT EXISTS idx_child_savings_goals_status ON child_savings_goals(status);

-- Add foreign key for children in vaults
ALTER TABLE children 
ADD CONSTRAINT fk_children_vault 
FOREIGN KEY (vault_id) REFERENCES vaults(id) ON DELETE CASCADE;

-- Add foreign key for allowances source account
ALTER TABLE allowances 
ADD CONSTRAINT fk_allowances_source_account 
FOREIGN KEY (source_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
