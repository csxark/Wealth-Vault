# Tamper-Proof Audit Trail Implementation (#627)

This document describes the implementation of a tamper-proof audit trail with cryptographic hash chaining and periodic Merkle root anchoring for the Wealth-Vault application.

## Overview

The tamper-proof audit trail ensures that audit logs cannot be modified or deleted without detection, providing compliance-grade immutability guarantees. The system implements:

- **Cryptographic Hash Chaining**: Each audit log entry references the previous entry's hash
- **Periodic Merkle Root Anchoring**: Regular aggregation of logs into Merkle trees with immutable anchors
- **External Immutable Storage**: Optional anchoring to external services (blockchain, WORM storage)
- **Append-Only Enforcement**: Database-level constraints preventing modifications

## Architecture

### Core Components

1. **Audit Log Service** (`auditLogService.js`)
   - Creates audit logs with cryptographic hash chaining
   - Validates hash chain integrity
   - Provides search and export functionality

2. **Tamper-Proof Audit Service** (`tamperProofAuditService.js`)
   - Handles external anchoring to immutable storage
   - Generates comprehensive integrity reports
   - Manages anchoring schedules

3. **Audit Trail Sealer Job** (`auditTrailSealer.js`)
   - Periodically seals audit logs into Merkle trees
   - Performs automatic external anchoring
   - Runs integrity checks

4. **Database Schema & Constraints**
   - Append-only triggers on audit tables
   - Hash chain validation functions
   - Performance indexes

## Hash Chain Implementation

### Audit Log Structure

Each audit log entry contains:
```javascript
{
  id: "uuid",
  tenantId: "uuid", // Optional for multi-tenant
  actorUserId: "uuid",
  action: "string",
  category: "string",
  // ... other fields
  previousHash: "string", // Hash of previous entry or "ROOT"
  entryHash: "string"    // Hash of current entry
}
```

### Hash Calculation

```javascript
const computeEntryHash = ({ previousHash, payload }) => {
  const hash = crypto.createHash('sha256');
  hash.update(previousHash || 'ROOT');
  hash.update(stableStringify(payload)); // Deterministic JSON serialization
  return hash.digest('hex');
};
```

### Chain Validation

The system validates:
1. **Chain Continuity**: Each entry's `previousHash` matches the prior entry's `entryHash`
2. **Entry Integrity**: Each entry's `entryHash` matches the computed hash of its payload

## Merkle Root Anchoring

### Periodic Sealing Process

1. Collect unsealed audit logs within a time period
2. Build a Merkle tree from the log entries
3. Store the Merkle root in an immutable anchor
4. Mark logs as sealed
5. Optionally anchor externally

### Anchor Structure

```javascript
{
  id: "uuid",
  merkleRoot: "string",        // Root hash of Merkle tree
  previousAnchorId: "uuid",    // Links to previous anchor
  eventCount: number,          // Number of events in this period
  periodStart: "timestamp",
  periodEnd: "timestamp",
  sealMetadata: object,        // Additional sealing info
  externalProof: object        // External anchoring proof (optional)
}
```

## External Anchoring

The system supports anchoring Merkle roots to external immutable storage:

### Supported Services

- **Blockchain**: Ethereum, Bitcoin, or custom chains
- **WORM Storage**: AWS S3 Object Lock, Azure Immutable Storage
- **Timestamp Services**: RFC 3161 compliant timestamping

### Configuration

```bash
# Environment variables
AUDIT_EXTERNAL_ANCHORING_ENABLED=true
AUDIT_EXTERNAL_SERVICE=blockchain  # or 'worm' or 'timestamp'
AUDIT_ANCHORING_INTERVAL_HOURS=1   # How often to anchor
```

## API Endpoints

### Integrity Verification

```http
GET /api/audit/tenants/{tenantId}/integrity
```
Returns hash chain integrity status for a tenant.

```http
GET /api/audit/tenants/{tenantId}/integrity-report
```
Returns comprehensive integrity report including external anchoring status.

### External Anchoring

```http
POST /api/audit/tenants/{tenantId}/anchor-external
Content-Type: application/json

{
  "anchorId": "uuid",
  "externalService": "blockchain"
}
```

```http
GET /api/audit/tenants/{tenantId}/anchors/{anchorId}/verify-external
```
Verifies external anchoring for a specific anchor.

### Scheduling

```http
POST /api/audit/tenants/{tenantId}/schedule-anchoring
Content-Type: application/json

{
  "intervalHours": 24
}
```

## Database Constraints

### Append-Only Triggers

PostgreSQL triggers prevent updates and deletes on audit tables:

```sql
CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_updates();
```

### Validation Functions

```sql
-- Validate hash chain for a tenant
SELECT * FROM validate_audit_hash_chain('tenant-uuid');

-- Get latest Merkle root
SELECT * FROM get_latest_merkle_root('tenant-uuid');
```

## Testing

Run the tamper-proof audit tests:

```bash
npm test -- tamperProofAudit.test.js
```

Tests cover:
- Hash chain creation and validation
- External anchoring simulation
- Integrity report generation
- Database constraint enforcement
- Tampering detection

## Security Considerations

### Threat Model

The system protects against:
- **Log Tampering**: Cryptographic hashes detect modifications
- **Log Deletion**: Database triggers prevent removal
- **Log Insertion**: Hash chain validation detects insertions
- **Replay Attacks**: Timestamps and sequence validation
- **Storage Compromise**: External anchoring provides additional guarantees

### Compliance

This implementation supports:
- **SOX**: Financial audit trail requirements
- **GDPR**: Data integrity and audit logging
- **PCI DSS**: Security event logging
- **ISO 27001**: Information security management

## Performance

### Indexing Strategy

```sql
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_audit_logs_entry_hash ON audit_logs(entry_hash);
CREATE INDEX idx_audit_logs_previous_hash ON audit_logs(previous_hash);
```

### Scaling Considerations

- Hash computation is performed asynchronously
- Merkle tree building is batched by time periods
- External anchoring can be rate-limited
- Integrity checks can be run on subsets of data

## Monitoring & Alerting

The system includes:
- **Integrity Check Jobs**: Run every 6 hours
- **Alerting**: Logs critical integrity violations
- **Metrics**: Chain validation statistics
- **Reporting**: Comprehensive integrity reports

## Future Enhancements

- **Zero-Knowledge Proofs**: Prove integrity without revealing data
- **Distributed Anchoring**: Multiple external services
- **Quantum Resistance**: Upgrade to quantum-safe hashing
- **Real-time Anchoring**: Immediate external anchoring for critical events

## Migration

To enable tamper-proof auditing:

1. Run the database migration:
   ```bash
   psql -d wealth_vault -f backend/db/migrations/tamper-proof-audit-trail.sql
   ```

2. Update environment variables for external anchoring

3. Restart the audit trail sealer job

4. Existing audit logs will be sealed in the next anchoring cycle

## Troubleshooting

### Common Issues

1. **Hash Chain Breaks**: Check for database corruption or unauthorized access
2. **External Anchoring Failures**: Verify network connectivity and API keys
3. **Performance Issues**: Review indexing and consider archiving old logs

### Recovery

1. **Integrity Violations**: Generate detailed reports and investigate
2. **Anchor Loss**: Rebuild from last known good state
3. **External Service Issues**: Fallback to local-only anchoring