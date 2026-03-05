-- Migration 0017: Bulk Expense Import & Auto-Reconciliation
-- Issue #636: Import CSV/Excel, auto-match transactions, duplicate detection

-- Enums for import processing
CREATE TYPE import_status AS ENUM (
    'pending',
    'parsing',
    'matching',
    'reviewing',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE import_source AS ENUM (
    'csv',
    'excel',
    'bank_api',
    'manual',
    'plaid',
    'finicity'
);

CREATE TYPE match_status AS ENUM (
    'pending',
    'auto_matched',
    'manual_matched',
    'rejected',
    'duplicate',
    'new'
);

CREATE TYPE reconciliation_action AS ENUM (
    'approve',
    'reject',
    'edit',
    'merge',
    'skip'
);

CREATE TYPE bank_connection_status AS ENUM (
    'connected',
    'disconnected',
    'error',
    'pending',
    'expired'
);

-- Table: import_sessions
CREATE TABLE import_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Session metadata
    session_name VARCHAR(255),
    import_source import_source NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    file_path TEXT,
    
    -- Format detection
    detected_format VARCHAR(100),
    column_mappings JSONB,
    date_format VARCHAR(50),
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Processing state
    status import_status NOT NULL DEFAULT 'pending',
    total_rows INTEGER DEFAULT 0,
    rows_processed INTEGER DEFAULT 0,
    rows_imported INTEGER DEFAULT 0,
    rows_skipped INTEGER DEFAULT 0,
    rows_failed INTEGER DEFAULT 0,
    
    -- Match statistics
    auto_matched INTEGER DEFAULT 0,
    manual_review_needed INTEGER DEFAULT 0,
    duplicates_found INTEGER DEFAULT 0,
    new_transactions INTEGER DEFAULT 0,
    
    -- Processing details
    processing_started_at TIMESTAMP,
    processing_completed_at TIMESTAMP,
    processing_duration_ms INTEGER,
    
    -- Error handling
    error_message TEXT,
    error_details JSONB,
    
    -- Configuration
    auto_categorize BOOLEAN DEFAULT true,
    auto_match BOOLEAN DEFAULT true,
    skip_duplicates BOOLEAN DEFAULT true,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_sessions_tenant_status ON import_sessions(tenant_id, status);
CREATE INDEX idx_import_sessions_user ON import_sessions(user_id);
CREATE INDEX idx_import_sessions_created ON import_sessions(created_at DESC);
CREATE INDEX idx_import_sessions_active ON import_sessions(status) WHERE status IN ('pending', 'parsing', 'matching');

-- Table: import_records
CREATE TABLE import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
    
    -- Record position
    row_number INTEGER NOT NULL,
    
    -- Parsed data
    transaction_date TIMESTAMP NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    description TEXT,
    merchant_name VARCHAR(255),
    category VARCHAR(100),
    account_name VARCHAR(255),
    reference_number VARCHAR(100),
    
    -- Matching results
    match_status match_status NOT NULL DEFAULT 'pending',
    matched_expense_id UUID,
    match_confidence NUMERIC(5, 2),
    match_reason TEXT,
    
    -- Categorization
    suggested_category VARCHAR(100),
    categorization_confidence NUMERIC(5, 2),
    
    -- Duplicate detection
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of_expense_id UUID,
    duplicate_score NUMERIC(5, 2),
    
    -- Processing
    is_imported BOOLEAN DEFAULT false,
    imported_expense_id UUID,
    import_error TEXT,
    
    -- Raw data
    raw_data JSONB,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_records_session ON import_records(session_id);
CREATE INDEX idx_import_records_match_status ON import_records(match_status);
CREATE INDEX idx_import_records_duplicate ON import_records(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX idx_import_records_imported ON import_records(is_imported);
CREATE INDEX idx_import_records_date_amount ON import_records(transaction_date, amount);

-- Table: reconciliation_matches
CREATE TABLE reconciliation_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
    import_record_id UUID NOT NULL REFERENCES import_records(id) ON DELETE CASCADE,
    
    -- Match details
    existing_expense_id UUID NOT NULL,
    match_confidence NUMERIC(5, 2) NOT NULL,
    
    -- Matching criteria
    match_factors JSONB,
    match_algorithm VARCHAR(50),
    
    -- Match scores
    amount_similarity NUMERIC(5, 2),
    date_similarity NUMERIC(5, 2),
    merchant_similarity NUMERIC(5, 2),
    description_similarity NUMERIC(5, 2),
    
    -- Review state
    review_status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID,
    reviewed_at TIMESTAMP,
    
    -- User action
    action_taken reconciliation_action,
    action_notes TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reconciliation_session ON reconciliation_matches(session_id);
CREATE INDEX idx_reconciliation_record ON reconciliation_matches(import_record_id);
CREATE INDEX idx_reconciliation_expense ON reconciliation_matches(existing_expense_id);
CREATE INDEX idx_reconciliation_review ON reconciliation_matches(review_status);
CREATE INDEX idx_reconciliation_confidence ON reconciliation_matches(match_confidence DESC);

-- Table: import_mappings
CREATE TABLE import_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Template details
    template_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Source identification
    import_source import_source NOT NULL,
    bank_name VARCHAR(255),
    account_type VARCHAR(50),
    
    -- Mapping configuration
    column_mappings JSONB NOT NULL,
    header_row INTEGER DEFAULT 1,
    data_start_row INTEGER DEFAULT 2,
    
    -- Format settings
    date_format VARCHAR(50),
    decimal_separator VARCHAR(1) DEFAULT '.',
    thousands_separator VARCHAR(1) DEFAULT ',',
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Processing rules
    skip_negative_amounts BOOLEAN DEFAULT false,
    invert_amounts BOOLEAN DEFAULT false,
    auto_categorize BOOLEAN DEFAULT true,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    
    -- State
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(tenant_id, template_name)
);

CREATE INDEX idx_import_mappings_tenant_user ON import_mappings(tenant_id, user_id);
CREATE INDEX idx_import_mappings_active ON import_mappings(is_active) WHERE is_active = true;
CREATE INDEX idx_import_mappings_default ON import_mappings(tenant_id) WHERE is_default = true;
CREATE INDEX idx_import_mappings_bank ON import_mappings(bank_name);

-- Table: bank_connections
CREATE TABLE bank_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    
    -- Bank details
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50),
    account_number_last4 VARCHAR(4),
    
    -- Connection details
    connection_provider VARCHAR(50),
    provider_account_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    
    -- Connection state
    status bank_connection_status NOT NULL DEFAULT 'pending',
    connection_error TEXT,
    
    -- Sync configuration
    auto_sync_enabled BOOLEAN DEFAULT true,
    sync_frequency VARCHAR(20) DEFAULT 'daily',
    last_sync_at TIMESTAMP,
    next_sync_at TIMESTAMP,
    sync_lookback_days INTEGER DEFAULT 30,
    
    -- Sync statistics
    total_syncs INTEGER DEFAULT 0,
    successful_syncs INTEGER DEFAULT 0,
    failed_syncs INTEGER DEFAULT 0,
    total_transactions_imported INTEGER DEFAULT 0,
    
    -- Processing rules
    import_mapping_id UUID REFERENCES import_mappings(id),
    auto_categorize BOOLEAN DEFAULT true,
    skip_duplicates BOOLEAN DEFAULT true,
    
    -- Security
    consent_expires_at TIMESTAMP,
    requires_reauth BOOLEAN DEFAULT false,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bank_connections_user ON bank_connections(user_id);
CREATE INDEX idx_bank_connections_status ON bank_connections(status);
CREATE INDEX idx_bank_connections_next_sync ON bank_connections(next_sync_at) WHERE auto_sync_enabled = true;
CREATE INDEX idx_bank_connections_provider ON bank_connections(connection_provider);

-- Table: import_history
CREATE TABLE import_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES import_sessions(id) ON DELETE CASCADE,
    
    -- Summary
    import_source import_source NOT NULL,
    total_rows INTEGER NOT NULL,
    rows_imported INTEGER NOT NULL,
    rows_skipped INTEGER NOT NULL,
    
    -- Duration
    processing_duration_ms INTEGER,
    
    -- Results
    new_expenses_created INTEGER DEFAULT 0,
    existing_expenses_matched INTEGER DEFAULT 0,
    duplicates_skipped INTEGER DEFAULT 0,
    
    -- Financial impact
    total_amount_imported NUMERIC(15, 2),
    
    -- Metadata
    performed_by UUID NOT NULL,
    summary TEXT,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_history_tenant ON import_history(tenant_id);
CREATE INDEX idx_import_history_session ON import_history(session_id);
CREATE INDEX idx_import_history_created ON import_history(created_at DESC);
CREATE INDEX idx_import_history_performed_by ON import_history(performed_by);

-- PL/pgSQL Functions for Import & Reconciliation

-- Function: Calculate duplicate score between two transactions
CREATE OR REPLACE FUNCTION calculate_duplicate_score(
    p_date1 TIMESTAMP,
    p_amount1 NUMERIC,
    p_merchant1 VARCHAR,
    p_date2 TIMESTAMP,
    p_amount2 NUMERIC,
    p_merchant2 VARCHAR
)
RETURNS NUMERIC AS $$
DECLARE
    v_date_diff INTEGER;
    v_amount_diff NUMERIC;
    v_merchant_similarity NUMERIC;
    v_score NUMERIC := 0;
BEGIN
    -- Date similarity (within 3 days = high score)
    v_date_diff := ABS(EXTRACT(day FROM p_date1 - p_date2));
    IF v_date_diff = 0 THEN
        v_score := v_score + 40;
    ELSIF v_date_diff <= 1 THEN
        v_score := v_score + 30;
    ELSIF v_date_diff <= 3 THEN
        v_score := v_score + 20;
    END IF;
    
    -- Amount similarity (exact match = high score)
    v_amount_diff := ABS(p_amount1 - p_amount2);
    IF v_amount_diff = 0 THEN
        v_score := v_score + 50;
    ELSIF v_amount_diff < 0.01 THEN
        v_score := v_score + 40;
    ELSIF v_amount_diff < 1.00 THEN
        v_score := v_score + 20;
    END IF;
    
    -- Merchant similarity (Levenshtein distance if available, else exact match)
    IF p_merchant1 IS NOT NULL AND p_merchant2 IS NOT NULL THEN
        IF LOWER(p_merchant1) = LOWER(p_merchant2) THEN
            v_score := v_score + 10;
        ELSIF LOWER(p_merchant1) LIKE '%' || LOWER(p_merchant2) || '%' 
           OR LOWER(p_merchant2) LIKE '%' || LOWER(p_merchant1) || '%' THEN
            v_score := v_score + 5;
        END IF;
    END IF;
    
    RETURN v_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Detect duplicates for import session
CREATE OR REPLACE FUNCTION detect_duplicates_for_session(
    p_session_id UUID
)
RETURNS TABLE (
    import_record_id UUID,
    duplicate_expense_id UUID,
    duplicate_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ir.id,
        e.id,
        calculate_duplicate_score(
            ir.transaction_date,
            ir.amount,
            ir.merchant_name,
            e.date,
            e.amount,
            e.merchant
        ) as score
    FROM import_records ir
    CROSS JOIN expenses e
    WHERE ir.session_id = p_session_id
      AND ir.tenant_id = e.tenant_id
      AND calculate_duplicate_score(
            ir.transaction_date,
            ir.amount,
            ir.merchant_name,
            e.date,
            e.amount,
            e.merchant
          ) >= 80  -- High confidence duplicates only
    ORDER BY score DESC;
END;
$$ LANGUAGE plpgsql;

-- Function: Find match candidates for import record
CREATE OR REPLACE FUNCTION find_match_candidates(
    p_import_record_id UUID,
    p_tenant_id UUID,
    p_date_tolerance_days INTEGER DEFAULT 3,
    p_amount_tolerance NUMERIC DEFAULT 1.00
)
RETURNS TABLE (
    expense_id UUID,
    match_confidence NUMERIC,
    amount_similarity NUMERIC,
    date_similarity NUMERIC,
    merchant_similarity NUMERIC
) AS $$
DECLARE
    v_transaction_date TIMESTAMP;
    v_amount NUMERIC;
    v_merchant VARCHAR;
BEGIN
    -- Get import record details
    SELECT transaction_date, amount, merchant_name
    INTO v_transaction_date, v_amount, v_merchant
    FROM import_records
    WHERE id = p_import_record_id;
    
    RETURN QUERY
    SELECT 
        e.id,
        calculate_duplicate_score(
            v_transaction_date, v_amount, v_merchant,
            e.date, e.amount, e.merchant
        ) as confidence,
        CASE 
            WHEN ABS(e.amount - v_amount) = 0 THEN 100
            WHEN ABS(e.amount - v_amount) < 0.01 THEN 95
            WHEN ABS(e.amount - v_amount) < 1.00 THEN 70
            ELSE 0
        END::NUMERIC as amt_sim,
        CASE 
            WHEN ABS(EXTRACT(day FROM e.date - v_transaction_date)) = 0 THEN 100
            WHEN ABS(EXTRACT(day FROM e.date - v_transaction_date)) <= 1 THEN 80
            WHEN ABS(EXTRACT(day FROM e.date - v_transaction_date)) <= 3 THEN 50
            ELSE 0
        END::NUMERIC as date_sim,
        CASE 
            WHEN v_merchant IS NULL OR e.merchant IS NULL THEN 0
            WHEN LOWER(v_merchant) = LOWER(e.merchant) THEN 100
            WHEN LOWER(v_merchant) LIKE '%' || LOWER(e.merchant) || '%' THEN 70
            ELSE 0
        END::NUMERIC as merch_sim
    FROM expenses e
    WHERE e.tenant_id = p_tenant_id
      AND e.date BETWEEN v_transaction_date - (p_date_tolerance_days || ' days')::INTERVAL
                     AND v_transaction_date + (p_date_tolerance_days || ' days')::INTERVAL
      AND ABS(e.amount - v_amount) <= p_amount_tolerance
    ORDER BY confidence DESC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-match import records with existing expenses
CREATE OR REPLACE FUNCTION auto_match_import_session(
    p_session_id UUID,
    p_confidence_threshold NUMERIC DEFAULT 85.0
)
RETURNS INTEGER AS $$
DECLARE
    v_tenant_id UUID;
    v_matched_count INTEGER := 0;
    v_record RECORD;
    v_match RECORD;
BEGIN
    -- Get tenant_id from session
    SELECT tenant_id INTO v_tenant_id
    FROM import_sessions
    WHERE id = p_session_id;
    
    -- Process each pending import record
    FOR v_record IN 
        SELECT id FROM import_records
        WHERE session_id = p_session_id
          AND match_status = 'pending'
    LOOP
        -- Find best match
        SELECT * INTO v_match
        FROM find_match_candidates(v_record.id, v_tenant_id, 3, 1.00)
        ORDER BY match_confidence DESC
        LIMIT 1;
        
        -- If match confidence exceeds threshold, mark as auto-matched
        IF v_match.match_confidence >= p_confidence_threshold THEN
            UPDATE import_records
            SET match_status = 'auto_matched',
                matched_expense_id = v_match.expense_id,
                match_confidence = v_match.match_confidence,
                match_reason = 'Auto-matched with ' || v_match.match_confidence || '% confidence',
                updated_at = NOW()
            WHERE id = v_record.id;
            
            -- Create reconciliation match record
            INSERT INTO reconciliation_matches 
            (tenant_id, session_id, import_record_id, existing_expense_id, match_confidence,
             amount_similarity, date_similarity, merchant_similarity, match_algorithm)
            VALUES 
            (v_tenant_id, p_session_id, v_record.id, v_match.expense_id, v_match.match_confidence,
             v_match.amount_similarity, v_match.date_similarity, v_match.merchant_similarity, 'auto');
            
            v_matched_count := v_matched_count + 1;
        END IF;
    END LOOP;
    
    -- Update session statistics
    UPDATE import_sessions
    SET auto_matched = v_matched_count,
        updated_at = NOW()
    WHERE id = p_session_id;
    
    RETURN v_matched_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Update import session statistics
CREATE OR REPLACE FUNCTION update_import_session_stats(
    p_session_id UUID
)
RETURNS void AS $$
DECLARE
    v_stats RECORD;
BEGIN
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_imported = true) as imported,
        COUNT(*) FILTER (WHERE match_status = 'duplicate') as duplicates,
        COUNT(*) FILTER (WHERE match_status = 'auto_matched') as auto_matched,
        COUNT(*) FILTER (WHERE match_status = 'pending') as pending
    INTO v_stats
    FROM import_records
    WHERE session_id = p_session_id;
    
    UPDATE import_sessions
    SET total_rows = v_stats.total,
        rows_imported = v_stats.imported,
        rows_skipped = v_stats.duplicates,
        auto_matched = v_stats.auto_matched,
        manual_review_needed = v_stats.pending,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Triggers

-- Trigger: Update import session stats when import record changes
CREATE OR REPLACE FUNCTION trigger_update_import_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_import_session_stats(NEW.session_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_record_stats_trigger
    AFTER INSERT OR UPDATE ON import_records
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_import_stats();

-- Trigger: Increment mapping usage count
CREATE OR REPLACE FUNCTION trigger_increment_mapping_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.detected_format IS NOT NULL THEN
        UPDATE import_mappings
        SET usage_count = usage_count + 1,
            last_used_at = NOW()
        WHERE template_name = NEW.detected_format
          AND tenant_id = NEW.tenant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_session_mapping_usage_trigger
    AFTER UPDATE ON import_sessions
    FOR EACH ROW
    WHEN (OLD.detected_format IS NULL AND NEW.detected_format IS NOT NULL)
    EXECUTE FUNCTION trigger_increment_mapping_usage();

-- Views for Import Monitoring

-- View: Import session summary
CREATE OR REPLACE VIEW v_import_session_summary AS
SELECT 
    iss.id,
    iss.tenant_id,
    iss.user_id,
    iss.session_name,
    iss.import_source,
    iss.status,
    iss.total_rows,
    iss.rows_imported,
    iss.rows_skipped,
    iss.auto_matched,
    iss.manual_review_needed,
    iss.duplicates_found,
    iss.processing_duration_ms,
    CASE 
        WHEN iss.total_rows > 0 THEN 
            ROUND((iss.rows_imported::NUMERIC / iss.total_rows) * 100, 2)
        ELSE 0
    END as success_rate_percent,
    iss.created_at,
    iss.processing_completed_at
FROM import_sessions iss;

-- View: Pending reconciliation tasks
CREATE OR REPLACE VIEW v_pending_reconciliation AS
SELECT 
    ir.id as record_id,
    ir.session_id,
    ir.tenant_id,
    ir.transaction_date,
    ir.amount,
    ir.merchant_name,
    ir.description,
    ir.match_status,
    rm.id as match_id,
    rm.existing_expense_id,
    rm.match_confidence,
    rm.review_status
FROM import_records ir
LEFT JOIN reconciliation_matches rm ON ir.id = rm.import_record_id
WHERE ir.match_status IN ('pending', 'auto_matched')
  AND (rm.review_status IS NULL OR rm.review_status = 'pending')
ORDER BY ir.transaction_date DESC;

-- View: Bank connection health
CREATE OR REPLACE VIEW v_bank_connection_health AS
SELECT 
    bc.id,
    bc.tenant_id,
    bc.user_id,
    bc.bank_name,
    bc.account_name,
    bc.status,
    bc.auto_sync_enabled,
    bc.last_sync_at,
    bc.next_sync_at,
    bc.total_syncs,
    bc.successful_syncs,
    bc.failed_syncs,
    CASE 
        WHEN bc.total_syncs > 0 THEN
            ROUND((bc.successful_syncs::NUMERIC / bc.total_syncs) * 100, 2)
        ELSE 0
    END as success_rate_percent,
    bc.total_transactions_imported,
    bc.requires_reauth,
    bc.consent_expires_at,
    CASE 
        WHEN bc.consent_expires_at < NOW() THEN true
        ELSE false
    END as is_expired
FROM bank_connections bc;

-- View: Import statistics by source
CREATE OR REPLACE VIEW v_import_stats_by_source AS
SELECT 
    tenant_id,
    import_source,
    COUNT(*) as total_imports,
    SUM(rows_imported) as total_rows_imported,
    AVG(processing_duration_ms) as avg_processing_time_ms,
    SUM(new_expenses_created) as total_new_expenses,
    SUM(existing_expenses_matched) as total_matched_expenses,
    SUM(duplicates_skipped) as total_duplicates_skipped
FROM import_history
GROUP BY tenant_id, import_source;
