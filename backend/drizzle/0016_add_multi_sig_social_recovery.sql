-- Multi-Sig Treasury & Social Recovery Layer Migration
-- Adds support for Shamir Secret Sharing, guardian-based recovery, and recursive multi-sig approvals

-- Vault Guardians Table (stores encrypted shards for social recovery)
CREATE TABLE IF NOT EXISTS vault_guardians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Guardian identity
    guardian_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    guardian_email TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    guardian_role TEXT DEFAULT 'family', -- 'family', 'lawyer', 'accountant', 'trustee', 'executor', 'friend'
    
    -- Shamir Secret Sharing shard data
    shard_index INTEGER NOT NULL, -- 1-7 for standard configurations
    encrypted_shard TEXT NOT NULL, -- AES-256-GCM encrypted JSON: {encrypted, iv, authTag}
    shard_checksum TEXT NOT NULL, -- SHA-256 hash for integrity
    
    -- Permissions
    can_initiate_recovery BOOLEAN DEFAULT false,
    can_approve_transactions BOOLEAN DEFAULT false,
    approval_weight INTEGER DEFAULT 1, -- For weighted voting
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    activated_at TIMESTAMP,
    last_verified_at TIMESTAMP,
    
    -- Metadata
    metadata JSONB DEFAULT '{"invitationToken": null, "invitationExpiresAt": null, "identityVerified": false}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(vault_id, guardian_user_id),
    UNIQUE(vault_id, guardian_email),
    UNIQUE(vault_id, shard_index)
);

-- Recovery Requests Table (orchestrates social recovery workflow)
CREATE TABLE IF NOT EXISTS recovery_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    initiator_guardian_id UUID NOT NULL REFERENCES vault_guardians(id) ON DELETE CASCADE,
    
    -- Shamir Secret Sharing configuration
    required_shards INTEGER DEFAULT 3, -- M in M-of-N threshold
    total_shards INTEGER DEFAULT 5, -- N in M-of-N threshold
    shards_collected INTEGER DEFAULT 0,
    
    -- Recovery status
    status TEXT DEFAULT 'initiated', -- 'initiated', 'collecting_shards', 'cure_period', 'challenged', 'approved', 'executed', 'rejected', 'expired'
    
    -- Cure period (time for original owner to challenge)
    cure_period_days INTEGER DEFAULT 7,
    cure_expires_at TIMESTAMP,
    
    -- Challenge mechanism
    challenged_at TIMESTAMP,
    challenged_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    challenge_reason TEXT,
    
    -- Target owner for recovery
    new_owner_email TEXT NOT NULL,
    new_owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Secret reconstruction
    reconstructed_secret_hash TEXT, -- SHA-256 for verification
    
    -- Lifecycle timestamps
    initiated_at TIMESTAMP DEFAULT NOW(),
    executed_at TIMESTAMP,
    expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days', -- Absolute expiration
    completed_at TIMESTAMP,
    
    -- Audit trail
    audit_log JSONB DEFAULT '[]', -- [{timestamp, action, actor, details}]
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Guardian Votes Table (records shard submissions and approvals)
CREATE TABLE IF NOT EXISTS guardian_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recovery_request_id UUID REFERENCES recovery_requests(id) ON DELETE CASCADE,
    guardian_id UUID NOT NULL REFERENCES vault_guardians(id) ON DELETE CASCADE,
    
    -- Vote type
    vote_type TEXT NOT NULL, -- 'shard_submission', 'approval', 'rejection', 'challenge'
    
    -- Shard submission (for recovery)
    submitted_shard TEXT, -- Decrypted shard data in hex (cleared after reconstruction)
    shard_verified BOOLEAN DEFAULT false,
    
    -- Multi-sig approval (for transactions)
    transaction_id UUID, -- References transaction requiring approval
    approval_decision TEXT, -- 'approve', 'reject', 'abstain'
    
    -- Non-repudiation
    signature_proof TEXT, -- Digital signature
    ip_address TEXT,
    user_agent TEXT,
    
    -- Time constraints
    submitted_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- Time-locked signature validity
    
    comments TEXT,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(recovery_request_id, guardian_id, vote_type)
);

-- Recursive Multi-Sig Rules Table (complex approval logic)
CREATE TABLE IF NOT EXISTS recursive_multi_sig_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Rule identity
    rule_name TEXT NOT NULL,
    rule_description TEXT,
    priority INTEGER DEFAULT 0, -- Higher priority evaluated first
    
    -- Trigger conditions
    trigger_type TEXT NOT NULL, -- 'transaction_amount', 'vault_withdrawal', 'ownership_transfer', 'guardian_change'
    min_amount NUMERIC(15, 2),
    max_amount NUMERIC(15, 2),
    
    -- Recursive approval logic (nested AND/OR/ALL/ANY)
    approval_logic JSONB NOT NULL, -- {"operator": "AND", "conditions": [...]} or {"rules": [{"role": "admin", "count": 1}]}
    
    -- Approval constraints
    approval_timeout_hours INTEGER DEFAULT 72,
    requires_unanimous BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vault_guardians_vault_id ON vault_guardians(vault_id);
CREATE INDEX IF NOT EXISTS idx_vault_guardians_guardian_user_id ON vault_guardians(guardian_user_id);
CREATE INDEX IF NOT EXISTS idx_vault_guardians_guardian_email ON vault_guardians(guardian_email);
CREATE INDEX IF NOT EXISTS idx_vault_guardians_is_active ON vault_guardians(is_active);
CREATE INDEX IF NOT EXISTS idx_vault_guardians_can_initiate_recovery ON vault_guardians(can_initiate_recovery);
CREATE INDEX IF NOT EXISTS idx_vault_guardians_can_approve_transactions ON vault_guardians(can_approve_transactions);

CREATE INDEX IF NOT EXISTS idx_recovery_requests_vault_id ON recovery_requests(vault_id);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_status ON recovery_requests(status);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_new_owner_email ON recovery_requests(new_owner_email);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_cure_expires_at ON recovery_requests(cure_expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_expires_at ON recovery_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_initiated_at ON recovery_requests(initiated_at);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_completed_at ON recovery_requests(completed_at);
CREATE INDEX IF NOT EXISTS idx_recovery_requests_new_owner_user_id ON recovery_requests(new_owner_user_id);

CREATE INDEX IF NOT EXISTS idx_guardian_votes_recovery_request_id ON guardian_votes(recovery_request_id);
CREATE INDEX IF NOT EXISTS idx_guardian_votes_guardian_id ON guardian_votes(guardian_id);
CREATE INDEX IF NOT EXISTS idx_guardian_votes_transaction_id ON guardian_votes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_guardian_votes_vote_type ON guardian_votes(vote_type);
CREATE INDEX IF NOT EXISTS idx_guardian_votes_approval_decision ON guardian_votes(approval_decision);
CREATE INDEX IF NOT EXISTS idx_guardian_votes_expires_at ON guardian_votes(expires_at);

CREATE INDEX IF NOT EXISTS idx_multi_sig_rules_vault_id ON recursive_multi_sig_rules(vault_id);
CREATE INDEX IF NOT EXISTS idx_multi_sig_rules_trigger_type ON recursive_multi_sig_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_multi_sig_rules_priority ON recursive_multi_sig_rules(priority DESC);
CREATE INDEX IF NOT EXISTS idx_multi_sig_rules_is_active ON recursive_multi_sig_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_multi_sig_rules_min_max_amount ON recursive_multi_sig_rules(min_amount, max_amount);

-- Comments for documentation
COMMENT ON TABLE vault_guardians IS 'Stores guardian relationships and encrypted Shamir Secret Sharing shards for vault recovery';
COMMENT ON TABLE recovery_requests IS 'Orchestrates social recovery workflow with multi-day cure period and challenge mechanism';
COMMENT ON TABLE guardian_votes IS 'Records guardian shard submissions, multi-sig approvals, and challenges';
COMMENT ON TABLE recursive_multi_sig_rules IS 'Defines complex approval logic with nested AND/OR/ALL/ANY operators for institutional treasuries';

COMMENT ON COLUMN vault_guardians.shard_index IS 'Unique shard number (1-N) for Shamir Secret Sharing scheme';
COMMENT ON COLUMN vault_guardians.encrypted_shard IS 'AES-256-GCM encrypted shard with IV and auth tag';
COMMENT ON COLUMN vault_guardians.shard_checksum IS 'SHA-256 hash for shard integrity verification';
COMMENT ON COLUMN vault_guardians.approval_weight IS 'Integer weight for weighted voting (default 1)';

COMMENT ON COLUMN recovery_requests.required_shards IS 'M in M-of-N threshold (minimum shards to reconstruct secret)';
COMMENT ON COLUMN recovery_requests.total_shards IS 'N in M-of-N threshold (total shards distributed)';
COMMENT ON COLUMN recovery_requests.cure_period_days IS 'Days original owner has to challenge recovery (default 7)';
COMMENT ON COLUMN recovery_requests.reconstructed_secret_hash IS 'SHA-256 hash of reconstructed master secret for verification';
COMMENT ON COLUMN recovery_requests.audit_log IS 'Immutable state transition log with timestamps, actions, actors';

COMMENT ON COLUMN guardian_votes.vote_type IS 'shard_submission: Recovery shard | approval/rejection: Multi-sig vote | challenge: Recovery challenge';
COMMENT ON COLUMN guardian_votes.signature_proof IS 'Digital signature for non-repudiation and audit compliance';
COMMENT ON COLUMN guardian_votes.expires_at IS 'Time-locked vote validity for enhanced security';

COMMENT ON COLUMN recursive_multi_sig_rules.approval_logic IS 'Nested JSON structure with AND/OR/ALL/ANY operators and role-based rules';
COMMENT ON COLUMN recursive_multi_sig_rules.priority IS 'Higher priority rules evaluated first (descending order)';
COMMENT ON COLUMN recursive_multi_sig_rules.trigger_type IS 'transaction_amount: Dollar threshold | vault_withdrawal: Any withdrawal | ownership_transfer: Ownership change | guardian_change: Guardian modifications';
