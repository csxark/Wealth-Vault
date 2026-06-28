-- Issue #572: Soft-Delete Financial Data Leakage Prevention
-- Standardizes soft-delete filtering and prevents hidden records from affecting totals

-- 1. Add soft-delete metadata to transactions
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'transactions' AND column_name = 'deleted_at') THEN
        ALTER TABLE transactions
        ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN deleted_by UUID,
        ADD COLUMN deletion_reason VARCHAR(500);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at 
  ON transactions(deleted_at DESC) 
  WHERE deleted_at IS NULL; -- Cover queries filtering out soft-deleted

-- 2. Reversal transactions table for recording reversals instead of mutations
CREATE TABLE IF NOT EXISTS reversal_transactions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  original_transaction_id BIGINT NOT NULL,
  reversal_type VARCHAR(50) NOT NULL, -- 'full_reversal', 'partial_reversal', 'correction'
  reversal_amount DECIMAL(19, 4) NOT NULL,
  reversal_description VARCHAR(500),
  reversal_initiated_by UUID,
  reversal_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ledger_recorded BOOLEAN DEFAULT FALSE,
  ledger_recorded_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT fk_reversal_original FOREIGN KEY (original_transaction_id) 
    REFERENCES transactions(id) ON DELETE RESTRICT,
  CONSTRAINT valid_reversal_amount CHECK (reversal_amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_reversal_original 
  ON reversal_transactions(original_transaction_id);
CREATE INDEX IF NOT EXISTS idx_reversal_tenant 
  ON reversal_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reversal_recorded 
  ON reversal_transactions(ledger_recorded, reversal_at DESC);

-- 3. Integrity audit table for tracking report vs ledger discrepancies
CREATE TABLE IF NOT EXISTS integrity_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  audit_type VARCHAR(100) NOT NULL, -- 'soft_delete_leak', 'reversal_not_recorded', 'amount_mismatch'
  entity_type VARCHAR(100), -- 'transaction', 'category', 'goal'
  entity_id BIGINT,
  category_id UUID,
  report_total DECIMAL(19, 4),
  ledger_total DECIMAL(19, 4),
  discrepancy_amount DECIMAL(19, 4),
  discrepancy_percent DECIMAL(5, 2),
  affected_records INT,
  severity VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  root_cause TEXT,
  status VARCHAR(50) DEFAULT 'detected', -- 'detected', 'investigating', 'resolved'
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT valid_discrepancy CHECK (discrepancy_amount IS NULL OR discrepancy_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_integrity_audit_tenant 
  ON integrity_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_integrity_audit_type 
  ON integrity_audit(audit_type, status);
CREATE INDEX IF NOT EXISTS idx_integrity_audit_severity 
  ON integrity_audit(severity DESC, detected_at DESC);

-- 4. Soft-delete performance optimization: Partial index for queries
CREATE INDEX IF NOT EXISTS idx_transactions_active 
  ON transactions(tenant_id, category_id, created_at DESC) 
  WHERE deleted_at IS NULL;

-- 5. View for effective transactions (excluding soft-deleted)
CREATE OR REPLACE VIEW v_transactions_effective AS
SELECT 
  t.id,
  t.tenant_id,
  t.user_id,
  t.category_id,
  t.amount,
  t.currency,
  t.description,
  t.transaction_date,
  t.created_at,
  t.updated_at,
  COALESCE(r.reversal_amount, 0) AS reversals,
  (t.amount - COALESCE(r.reversal_amount, 0)) AS effective_amount,
  t.receipt_url,
  t.tags
FROM transactions t
LEFT JOIN (
  SELECT 
    original_transaction_id,
    SUM(reversal_amount) AS reversal_amount
  FROM reversal_transactions
  WHERE ledger_recorded = TRUE
  GROUP BY original_transaction_id
) r ON t.id = r.original_transaction_id
WHERE t.deleted_at IS NULL;

-- 6. View for category totals excluding soft-deleted and reversed
CREATE OR REPLACE VIEW v_category_effective_totals AS
SELECT 
  tenant_id,
  category_id,
  COUNT(*) AS transaction_count,
  COUNT(CASE WHEN effective_amount > 0 THEN 1 END) AS positive_count,
  COUNT(CASE WHEN effective_amount < 0 THEN 1 END) AS negative_count,
  SUM(effective_amount) AS total_amount,
  AVG(CAST(effective_amount AS FLOAT)) AS average_amount,
  MIN(effective_amount) AS min_amount,
  MAX(effective_amount) AS max_amount,
  SUM(COALESCE(reversals, 0)) AS total_reversals,
  MAX(created_at) AS last_transaction
FROM v_transactions_effective
GROUP BY tenant_id, category_id;

-- 7. View for deleted/reversed items audit trail
CREATE OR REPLACE VIEW v_deleted_items_audit AS
SELECT 
  t.id,
  t.tenant_id,
  'soft_delete' AS change_type,
  t.deleted_at AS change_time,
  t.deleted_by,
  t.deletion_reason,
  t.amount,
  t.category_id,
  NULL::BIGINT AS reversal_id,
  t.description
FROM transactions t
WHERE t.deleted_at IS NOT NULL
UNION ALL
SELECT 
  rt.original_transaction_id,
  rt.tenant_id,
  'reversal' AS change_type,
  rt.reversal_at AS change_time,
  rt.reversal_initiated_by,
  rt.reversal_description,
  rt.reversal_amount,
  t.category_id,
  rt.id AS reversal_id,
  rt.reversal_description
FROM reversal_transactions rt
JOIN transactions t ON rt.original_transaction_id = t.id
WHERE rt.ledger_recorded = TRUE;

-- 8. Helper function: Soft-delete a transaction
CREATE OR REPLACE FUNCTION soft_delete_transaction(
  p_transaction_id BIGINT,
  p_deleted_by UUID,
  p_reason VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_already_deleted BOOLEAN;
BEGIN
  SELECT (deleted_at IS NOT NULL) INTO v_already_deleted
  FROM transactions
  WHERE id = p_transaction_id;

  IF v_already_deleted THEN
    RETURN FALSE; -- Already deleted
  END IF;

  UPDATE transactions
  SET 
    deleted_at = NOW(),
    deleted_by = p_deleted_by,
    deletion_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 9. Helper function: Record a reversal
CREATE OR REPLACE FUNCTION record_reversal(
  p_original_transaction_id BIGINT,
  p_tenant_id UUID,
  p_reversal_amount DECIMAL,
  p_reversal_type VARCHAR,
  p_description VARCHAR,
  p_initiated_by UUID
) RETURNS BIGINT AS $$
DECLARE
  v_reversal_id BIGINT;
BEGIN
  INSERT INTO reversal_transactions (
    tenant_id,
    original_transaction_id,
    reversal_type,
    reversal_amount,
    reversal_description,
    reversal_initiated_by,
    reversal_at
  ) VALUES (
    p_tenant_id,
    p_original_transaction_id,
    p_reversal_type,
    p_reversal_amount,
    p_description,
    p_initiated_by,
    NOW()
  )
  RETURNING id INTO v_reversal_id;

  RETURN v_reversal_id;
END;
$$ LANGUAGE plpgsql;

-- 10. Helper function: Get effective amount for transaction
CREATE OR REPLACE FUNCTION get_effective_amount(
  p_transaction_id BIGINT
) RETURNS DECIMAL AS $$
DECLARE
  v_original_amount DECIMAL;
  v_total_reversals DECIMAL := 0;
BEGIN
  SELECT amount INTO v_original_amount
  FROM transactions
  WHERE id = p_transaction_id;

  SELECT COALESCE(SUM(reversal_amount), 0) INTO v_total_reversals
  FROM reversal_transactions
  WHERE original_transaction_id = p_transaction_id
    AND ledger_recorded = TRUE;

  RETURN COALESCE(v_original_amount, 0) - v_total_reversals;
END;
$$ LANGUAGE plpgsql;

-- 11. Helper function: Check integrity for category
CREATE OR REPLACE FUNCTION check_category_integrity(
  p_tenant_id UUID,
  p_category_id UUID
) RETURNS TABLE (
  discrepancies_found BOOLEAN,
  soft_delete_leak_amount DECIMAL,
  reversal_not_recorded_count INT,
  total_affected_records INT
) AS $$
DECLARE
  v_soft_delete_leak DECIMAL := 0;
  v_reversal_not_recorded INT := 0;
  v_affected INT := 0;
BEGIN
  -- Calculate amount still in totals despite soft-delete
  SELECT COALESCE(SUM(amount), 0) INTO v_soft_delete_leak
  FROM transactions
  WHERE tenant_id = p_tenant_id
    AND category_id = p_category_id
    AND deleted_at IS NOT NULL;

  -- Count reversals not yet recorded in ledger
  SELECT COUNT(*) INTO v_reversal_not_recorded
  FROM reversal_transactions
  WHERE tenant_id = p_tenant_id
    AND ledger_recorded = FALSE;

  -- Total affected records
  v_affected := COALESCE(v_soft_delete_leak::INT, 0) + v_reversal_not_recorded;

  RETURN QUERY SELECT 
    (v_soft_delete_leak > 0 OR v_reversal_not_recorded > 0),
    v_soft_delete_leak,
    v_reversal_not_recorded,
    v_affected;
END;
$$ LANGUAGE plpgsql;

-- 12. Helper function: Mark reversals as ledger recorded
CREATE OR REPLACE FUNCTION mark_reversals_recorded(
  p_reversal_ids BIGINT[]
) RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE reversal_transactions
  SET 
    ledger_recorded = TRUE,
    ledger_recorded_at = NOW()
  WHERE id = ANY(p_reversal_ids)
    AND ledger_recorded = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 13. Trigger: Log integrity issues when soft-delete happens
CREATE OR REPLACE FUNCTION log_soft_delete_integrity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO integrity_audit (
      tenant_id,
      audit_type,
      entity_type,
      entity_id,
      category_id,
      discrepancy_amount,
      root_cause,
      severity
    ) VALUES (
      NEW.tenant_id,
      'soft_delete_leak',
      'transaction',
      NEW.id,
      NEW.category_id,
      NEW.amount,
      'Transaction soft-deleted: ' || COALESCE(NEW.deletion_reason, 'no reason provided'),
      CASE 
        WHEN ABS(NEW.amount) > 1000 THEN 'high'
        WHEN ABS(NEW.amount) > 100 THEN 'medium'
        ELSE 'low'
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_soft_delete_integrity ON transactions;
CREATE TRIGGER trg_log_soft_delete_integrity
AFTER UPDATE ON transactions
FOR EACH ROW
WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
EXECUTE FUNCTION log_soft_delete_integrity();

-- 14. Grant permissions (multi-tenant)
ALTER TABLE reversal_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrity_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY reversal_tenant_isolation ON reversal_transactions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY integrity_audit_tenant_isolation ON integrity_audit
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
