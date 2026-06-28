-- ============================================================================
-- MULTI-ACCOUNT AGGREGATION & HOUSEHOLD PORTFOLIO MANAGEMENT (#656)
-- ============================================================================

-- Household Groups - Multi-account household aggregation
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core Details
    name TEXT NOT NULL,
    description TEXT,
    householdType TEXT DEFAULT 'family', -- 'family', 'joint', 'business', 'trust'
    createdBy UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Aggregation Settings
    baseCurrency TEXT DEFAULT 'USD',
    aggregationFrequency TEXT DEFAULT 'daily', -- 'real_time', 'hourly', 'daily', 'weekly'
    rebalancingEnabled BOOLEAN DEFAULT FALSE,
    collaborativeApprovalsRequired BOOLEAN DEFAULT FALSE,
    minApproversRequired INTEGER DEFAULT 1,
    
    -- Privacy & Visibility
    isPrivate BOOLEAN DEFAULT TRUE,
    hiddenAssets JSONB DEFAULT '[]'::jsonb, -- Array of vault/holding IDs to hide
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_households_created_by ON households(createdBy);
CREATE INDEX idx_households_type ON households(householdType);

-- Household Members - Multi-member roles and permissions
CREATE TABLE IF NOT EXISTS household_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    userId UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Role-Based Access Control
    role TEXT NOT NULL DEFAULT 'member', -- 'primary', 'secondary', 'viewer', 'approver', 'advisor'
    permissions JSONB DEFAULT '[]'::jsonb, -- Advanced permissions override
    
    -- Approval Authority
    canApproveRebalancing BOOLEAN DEFAULT FALSE,
    canApproveTransfers BOOLEAN DEFAULT FALSE,
    canViewAllAccounts BOOLEAN DEFAULT TRUE,
    
    -- Account Visibility
    visibleVaultIds JSONB DEFAULT '[]'::jsonb, -- Empty = all, otherwise list of visible vault IDs
    hiddenVaultIds JSONB DEFAULT '[]'::jsonb, -- Vaults hidden from this member
    
    -- Relationship
    relationship TEXT, -- 'spouse', 'child', 'parent', 'business_partner', 'trustee', 'advisor', 'other'
    joinedAt TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'active', -- 'active', 'pending', 'inactive', 'revoked'
    
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW(),
    
    -- Ensure unique membership
    CONSTRAINT unique_household_member UNIQUE(householdId, userId)
);

CREATE INDEX idx_household_members_household ON household_members(householdId);
CREATE INDEX idx_household_members_user ON household_members(userId);
CREATE INDEX idx_household_members_role ON household_members(role);

-- Household Accounts - Links vaults to households
CREATE TABLE IF NOT EXISTS household_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    vaultId UUID NOT NULL,
    accountName TEXT NOT NULL, -- 'Primary Checking', 'Emergency Fund', etc.
    accountType TEXT NOT NULL, -- 'checking', 'savings', 'investment', 'retirement', 'real_estate', 'crypto'
    
    -- Ownership
    primaryOwnerId UUID REFERENCES users(id) ON DELETE SET NULL,
    isJoint BOOLEAN DEFAULT FALSE,
    jointOwnerIds JSONB DEFAULT '[]'::jsonb, -- Array of user IDs
    
    -- Tax Reporting
    requiredForTaxReporting BOOLEAN DEFAULT FALSE,
    taxFileId TEXT,
    
    -- Visibility & Privacy
    isHidden BOOLEAN DEFAULT FALSE,
    hiddenFromMemberIds JSONB DEFAULT '[]'::jsonb,
    
    -- Aggregation Settings
    includeInNetWorth BOOLEAN DEFAULT TRUE,
    weight NUMERIC(5,4) DEFAULT 1.0, -- For weighted averaging in allocation
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    addedAt TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_household_vault UNIQUE(householdId, vaultId)
);

CREATE INDEX idx_household_accounts_household ON household_accounts(householdId);
CREATE INDEX idx_household_accounts_vault ON household_accounts(vaultId);
CREATE INDEX idx_household_accounts_joint ON household_accounts(isJoint);

-- Household Snapshots - Daily aggregated net worth & allocation snapshots
CREATE TABLE IF NOT EXISTS household_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    snapshotDate DATE NOT NULL,
    
    -- Net Worth Components
    totalNetWorth NUMERIC(20,2) NOT NULL,
    totalAssets NUMERIC(20,2) NOT NULL,
    totalLiabilities NUMERIC(20,2) NOT NULL,
    cashBalance NUMERIC(20,2) DEFAULT 0,
    investmentValue NUMERIC(20,2) DEFAULT 0,
    realEstateValue NUMERIC(20,2) DEFAULT 0,
    cryptoValue NUMERIC(20,2) DEFAULT 0,
    
    -- Aggregation Details
    accountCount INTEGER DEFAULT 0,
    baseCurrency TEXT DEFAULT 'USD',
    includesHiddenAccounts BOOLEAN DEFAULT FALSE,
    
    -- Allocation
    assetAllocation JSONB DEFAULT '{}', -- { stocks: 60, bonds: 30, crypto: 10, cash: 0 }
    allocationVsTarget JSONB DEFAULT '{}', -- Variance from target
    
    -- Metadata
    calculatedAt TIMESTAMP DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_household_snapshots_household_date ON household_snapshots(householdId, snapshotDate);
CREATE INDEX idx_household_snapshots_date ON household_snapshots(snapshotDate);

-- Rebalancing Orders - Household-wide rebalancing moves
CREATE TABLE IF NOT EXISTS household_rebalancing_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    initiatedBy UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Rebalancing Details
    orderType TEXT NOT NULL, -- 'auto', 'manual', 'scenario'
    targetAllocation JSONB NOT NULL, -- Target % allocation
    currentAllocation JSONB NOT NULL, -- Current % allocation before rebalancing
    
    -- Suggested Moves
    suggestedMoves JSONB NOT NULL, -- [{fromVault, toVault, asset, quantity, reason}]
    estimatedTransactionCosts NUMERIC(20,2) DEFAULT 0,
    estimatedTaxImpact NUMERIC(20,2) DEFAULT 0,
    
    -- Approvals (for collaborative sign-off)
    requiresApproval BOOLEAN DEFAULT FALSE,
    approvals JSONB DEFAULT '[]'::jsonb, -- [{userId, approvalDate, notes}]
    allApprovalsReceived BOOLEAN DEFAULT FALSE,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'proposed', -- 'proposed', 'approved', 'executing', 'completed', 'cancelled'
    executedAt TIMESTAMP,
    executionNotes TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_rebalancing_household ON household_rebalancing_orders(householdId);
CREATE INDEX idx_rebalancing_initiated_by ON household_rebalancing_orders(initiatedBy);
CREATE INDEX idx_rebalancing_status ON household_rebalancing_orders(status);

-- Joint Goals - Household-level financial goals
CREATE TABLE IF NOT EXISTS household_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    createdByUserId UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Goal Details
    goalName TEXT NOT NULL,
    goalType TEXT NOT NULL, -- 'education', 'home', 'vacation', 'retirement', 'emergency', 'custom'
    description TEXT,
    
    -- Financial Target
    targetAmount NUMERIC(20,2) NOT NULL,
    currentAmount NUMERIC(20,2) DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    deadline TIMESTAMP NOT NULL,
    priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    
    -- Household Contribution Strategy
    fundingStrategy TEXT DEFAULT 'proportional', -- 'proportional', 'equal', 'custom'
    memberContributions JSONB DEFAULT '{}', -- {userId: targetAmount}
    
    -- Collaboration
    approvalRequired BOOLEAN DEFAULT FALSE,
    requiresConsensus BOOLEAN DEFAULT FALSE,
    approvedBy JSONB DEFAULT '[]'::jsonb, -- [userId]
    
    -- Tracking
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'abandoned'
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_household_goals_household ON household_goals(householdId);
CREATE INDEX idx_household_goals_deadline ON household_goals(deadline);
CREATE INDEX idx_household_goals_status ON household_goals(status);

-- Household Spending - Consolidated spending across all member accounts
CREATE TABLE IF NOT EXISTS household_spending_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    summaryDate DATE NOT NULL,
    summaryPeriod TEXT DEFAULT 'month', -- 'day', 'week', 'month', 'quarter', 'year'
    
    -- Spending Totals
    totalSpending NUMERIC(20,2) NOT NULL,
    totalIncome NUMERIC(20,2) DEFAULT 0,
    netCashFlow NUMERIC(20,2) DEFAULT 0,
    
    -- Member Breakdown
    memberSpending JSONB DEFAULT '{}', -- {userId: amount}
    memberIncome JSONB DEFAULT '{}', -- {userId: amount}
    
    -- Category Breakdown
    categoryBreakdown JSONB DEFAULT '{}', -- {categoryName: amount}
    
    -- Trends
    percentChangeFromPrior NUMERIC(5,2) DEFAULT 0,
    forecastedMonthlySpend NUMERIC(20,2) DEFAULT 0,
    
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_household_spending_household_date ON household_spending_summaries(householdId, summaryDate);

-- Collaborative Approvals - General approval workflow for household changes
CREATE TABLE IF NOT EXISTS household_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    householdId UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    
    -- Request Details
    requestType TEXT NOT NULL, -- 'rebalancing', 'transfer', 'goal_change', 'member_add', 'account_link'
    referenceId UUID, -- ID of the request (e.g., rebalancing order ID)
    requestedBy UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description TEXT,
    
    -- Approval Workflow
    requiredApprovers JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of user IDs who can approve
    currentApprovals JSONB DEFAULT '[]'::jsonb, -- [{userId, approvalDate, notes}]
    rejections JSONB DEFAULT '[]'::jsonb, -- [{userId, rejectionDate, reason}]
    minApprovalsRequired INTEGER DEFAULT 1,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'withdrawn'
    decidedAt TIMESTAMP,
    decidedBy UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Metadata
    expiresAt TIMESTAMP, -- Request expiration
    metadata JSONB DEFAULT '{}',
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_household_approvals_household ON household_approvals(householdId);
CREATE INDEX idx_household_approvals_status ON household_approvals(status);
CREATE INDEX idx_household_approvals_type ON household_approvals(requestType);
