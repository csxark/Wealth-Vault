// backend/__tests__/bulkImport.test.js
// Issue #636: Bulk Expense Import & Auto-Reconciliation Tests

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import db from '../config/db.js';
import cacheService from '../services/cacheService.js';
import outboxService from '../services/outboxService.js';
import bulkImportService from '../services/bulkImportService.js';

// Mock data
const testTenantId = '11111111-1111-1111-1111-111111111111';
const testUserId = '22222222-2222-2222-2222-222222222222';

const mockCSVContent = `Date,Amount,Description,Merchant,Category
2024-01-15,42.99,Grocery shopping,Whole Foods,Groceries
2024-01-16,125.00,Monthly subscription,Netflix,Entertainment
2024-01-17,18.50,Coffee and snacks,Starbucks,Dining`;

const mockImportSessionData = {
    sessionName: 'Test Import',
    importSource: 'csv',
    fileName: 'test-transactions.csv',
    fileSize: 1024,
    autoCategorize: true,
    autoMatch: true,
    skipDuplicates: true
};

const mockMappingData = {
    templateName: 'Chase Checking',
    description: 'Chase bank checking account format',
    importSource: 'csv',
    bankName: 'Chase',
    columnMappings: {
        '0': 'transaction_date',
        '1': 'amount',
        '2': 'description',
        '3': 'merchant_name',
        '4': 'category'
    },
    dateFormat: 'YYYY-MM-DD',
    currency: 'USD',
    autoCategorize: true
};

describe('Bulk Import Service', () => {
    beforeEach(async () => {
        await cacheService.clear();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await cacheService.clear();
    });

    // Test Session Management

    describe('Import Session Management', () => {
        it('should create an import session', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            expect(session).toBeDefined();
            expect(session.tenant_id).toBe(testTenantId);
            expect(session.user_id).toBe(testUserId);
            expect(session.session_name).toBe(mockImportSessionData.sessionName);
            expect(session.import_source).toBe(mockImportSessionData.importSource);
            expect(session.status).toBe('pending');
            expect(session.auto_categorize).toBe(true);
            expect(session.auto_match).toBe(true);
            expect(session.skip_duplicates).toBe(true);
        });

        it('should get import session details', async () => {
            const created = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            const session = await bulkImportService.getImportSession(
                testTenantId,
                created.id
            );

            expect(session).toBeDefined();
            expect(session.id).toBe(created.id);
            expect(session.statistics).toBeDefined();
            expect(session.statistics.total).toBeDefined();
        });

        it('should return null for non-existent session', async () => {
            const session = await bulkImportService.getImportSession(
                testTenantId,
                'non-existent-id'
            );

            expect(session).toBeNull();
        });

        it('should cache session details', async () => {
            const created = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            // First call
            const session1 = await bulkImportService.getImportSession(
                testTenantId,
                created.id
            );

            // Second call (should be from cache)
            const session2 = await bulkImportService.getImportSession(
                testTenantId,
                created.id
            );

            expect(JSON.stringify(session1)).toEqual(JSON.stringify(session2));
        });
    });

    // Test File Parsing

    describe('File Parsing and Record Creation', () => {
        it('should parse CSV content and create import records', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            const result = await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            expect(result).toBeDefined();
            expect(result.sessionId).toBe(session.id);
             expect(result.recordCount).toBe(3); // 3 data rows
            expect(result.mapping).toBeDefined();
        });

        it('should detect file format automatically', async () => {
            const format = await bulkImportService.detectFormat(mockCSVContent);

            expect(format).toBeDefined();
            expect(format.column_mappings).toBeDefined();
            expect(format.header_row).toBe(1);
            expect(format.data_start_row).toBe(2);
        });

        it('should handle parsing errors gracefully', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            const invalidCSV = 'Invalid,CSV,Content\nNo,Date,Here';

            await expect(async () => {
                await bulkImportService.parseAndCreateRecords(
                    testTenantId,
                    session.id,
                    invalidCSV
                );
            }).rejects.toThrow();
        });

        it('should skip rows with missing required fields', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            const incompleteCSV = `Date,Amount,Description
2024-01-15,42.99,Valid row
2024-01-16,,Missing amount
,,Missing everything`;

            const result = await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                incompleteCSV
            );

            // Only 1 valid row should be imported
            expect(result.recordCount).toBe(1);
        });
    });

    // Test Duplicate Detection

    describe('Duplicate Detection', () => {
        it('should detect duplicate transactions', async () => {
            // Create existing expense
            const existingExpenseId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [existingExpenseId, testTenantId, testUserId, 42.99, new Date('2024-01-15'), 'Whole Foods', 'Groceries']
            );

            // Create import session with matching transaction
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            // Detect duplicates
            const result = await bulkImportService.detectDuplicates(
                testTenantId,
                session.id
            );

            expect(result).toBeDefined();
            expect(result.duplicatesFound).toBeGreaterThan(0);
        });

        it('should calculate duplicate scores correctly', async () => {
            // Test via database function
            const result = await db.execute(
                `SELECT calculate_duplicate_score(
                    '2024-01-15'::TIMESTAMP, 42.99, 'Whole Foods',
                    '2024-01-15'::TIMESTAMP, 42.99, 'Whole Foods'
                )`
            );

            const score = parseFloat(result.rows[0].calculate_duplicate_score);
            expect(score).toBeGreaterThan(80); // High confidence duplicate
        });

        it('should not flag different transactions as duplicates', async () => {
            const result = await db.execute(
                `SELECT calculate_duplicate_score(
                    '2024-01-15'::TIMESTAMP, 42.99, 'Whole Foods',
                    '2024-02-15'::TIMESTAMP, 100.00, 'Target'
                )`
            );

            const score = parseFloat(result.rows[0].calculate_duplicate_score);
            expect(score).toBeLessThan(50); // Low confidence
        });
    });

    // Test Auto-Matching

    describe('Auto-Matching with Existing Expenses', () => {
        it('should auto-match imported records with existing expenses', async () => {
            // Create existing expense
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [crypto.randomUUID(), testTenantId, testUserId, 125.00, new Date('2024-01-16'), 'Netflix', 'Entertainment']
            );

            // Create import session
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            // Auto-match
            const result = await bulkImportService.autoMatchRecords(
                testTenantId,
                session.id,
                85
            );

            expect(result).toBeDefined();
            expect(result.matchedCount).toBeGreaterThan(0);
        });

        it('should respect confidence threshold in auto-matching', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            // High confidence threshold (strict)
            const strictResult = await bulkImportService.autoMatchRecords(
                testTenantId,
                session.id,
                95
            );

            // Low confidence threshold (lenient)
            const lenientResult = await bulkImportService.autoMatchRecords(
                testTenantId,
                session.id,
                70
            );

            expect(lenientResult.matchedCount).toBeGreaterThanOrEqual(strictResult.matchedCount);
        });

        it('should create reconciliation match records', async () => {
            // Create matching expense
            const expenseId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [expenseId, testTenantId, testUserId, 18.50, new Date('2024-01-17'), 'Starbucks', 'Dining']
            );

            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            // Check reconciliation_matches table
            const matchesResult = await db.execute(
                `SELECT * FROM reconciliation_matches WHERE session_id = $1`,
                [session.id]
            );

            expect(matchesResult.rows.length).toBeGreaterThan(0);
        });
    });

    // Test Record Review

    describe('Import Record Review', () => {
        it('should get import records for review', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            const records = await bulkImportService.getImportRecordsForReview(
                testTenantId,
                session.id,
                'pending',
                50,
                0
            );

            expect(Array.isArray(records)).toBe(true);
            expect(records.length).toBeGreaterThan(0);
        });

        it('should filter records by match status', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            const pendingRecords = await bulkImportService.getImportRecordsForReview(
                testTenantId,
                session.id,
                'pending'
            );

            const matchedRecords = await bulkImportService.getImportRecordsForReview(
                testTenantId,
                session.id,
                'auto_matched'
            );

            expect(Array.isArray(pendingRecords)).toBe(true);
            expect(Array.isArray(matchedRecords)).toBe(true);
        });

        it('should support pagination for record review', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            const page1 = await bulkImportService.getImportRecordsForReview(
                testTenantId,
                session.id,
                'pending',
                2,
                0
            );

            const page2 = await bulkImportService.getImportRecordsForReview(
                testTenantId,
                session.id,
                'pending',
                2,
                2
            );

            expect(page1.length).toBeLessThanOrEqual(2);
            expect(page2.length).toBeLessThanOrEqual(2);
        });
    });

    // Test Match Review

    describe('Match Review Workflow', () => {
        it('should approve a match', async () => {
            // Setup: Create expense, import session, and match
            const expenseId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [expenseId, testTenantId, testUserId, 42.99, new Date('2024-01-15'), 'Whole Foods', 'Groceries']
            );

            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            // Get match to review
            const matchesResult = await db.execute(
                `SELECT * FROM reconciliation_matches WHERE session_id = $1 LIMIT 1`,
                [session.id]
            );

            const match = matchesResult.rows[0];

            // Approve the match
            const result = await bulkImportService.reviewMatch(
                testTenantId,
                match.id,
                'approve',
                testUserId,
                'Looks good'
            );

            expect(result).toBeDefined();
            expect(result.review_status).toBe('reviewed');
            expect(result.action_taken).toBe('approve');
        });

        it('should reject a match', async () => {
            // Similar setup as above
            const expenseId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [expenseId, testTenantId, testUserId, 125.00, new Date('2024-01-16'), 'Netflix', 'Entertainment']
            );

            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            const matchesResult = await db.execute(
                `SELECT * FROM reconciliation_matches WHERE session_id = $1 LIMIT 1`,
                [session.id]
            );

            const match = matchesResult.rows[0];

            // Reject the match
            const result = await bulkImportService.reviewMatch(
                testTenantId,
                match.id,
                'reject',
                testUserId,
                'Not a match'
            );

            expect(result.action_taken).toBe('reject');
        });

        it('should update import record status when match is rejected', async () => {
            // Setup and reject match
            const expenseId = crypto.randomUUID();
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [expenseId, testTenantId, testUserId, 18.50, new Date('2024-01-17'), 'Starbucks', 'Dining']
            );

            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            const matchesResult = await db.execute(
                `SELECT * FROM reconciliation_matches WHERE session_id = $1 LIMIT 1`,
                [session.id]
            );

            const match = matchesResult.rows[0];

            await bulkImportService.reviewMatch(
                testTenantId,
                match.id,
                'reject',
                testUserId
            );

            // Check import record status
            const recordResult = await db.execute(
                `SELECT * FROM import_records WHERE id = $1`,
                [match.import_record_id]
            );

            expect(recordResult.rows[0].match_status).toBe('new');
        });
    });

    // Test Import Execution

    describe('Import Execution', () => {
        it('should create new expenses from import records', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            // Mark all as new (no matches)
            await db.execute(
                `UPDATE import_records SET match_status = 'new' WHERE session_id = $1`,
                [session.id]
            );

            // Execute import
            const result = await bulkImportService.executeImport(
                testTenantId,
                session.id,
                testUserId
            );

            expect(result).toBeDefined();
            expect(result.newExpensesCreated).toBe(3); // 3 transactions
            expect(result.totalProcessed).toBe(3);
        });

        it('should handle mixed new and matched records', async () => {
            // Create one matching expense
            await db.execute(
                `INSERT INTO expenses (id, tenant_id, user_id, amount, date, merchant, category)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [crypto.randomUUID(), testTenantId, testUserId, 42.99, new Date('2024-01-15'), 'Whole Foods', 'Groceries']
            );

            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await bulkImportService.autoMatchRecords(testTenantId, session.id);

            // Mark remaining as new
            await db.execute(
                `UPDATE import_records SET match_status = 'new' 
                WHERE session_id = $1 AND match_status = 'pending'`,
                [session.id]
            );

            // Execute import
            const result = await bulkImportService.executeImport(
                testTenantId,
                session.id,
                testUserId
            );

            expect(result.newExpensesCreated).toBeGreaterThan(0);
            expect(result.existingExpensesMatched).toBeGreaterThan(0);
        });

        it('should create import history record', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await db.execute(
                `UPDATE import_records SET match_status = 'new' WHERE session_id = $1`,
                [session.id]
            );

            await bulkImportService.executeImport(testTenantId, session.id, testUserId);

            // Check import_history
            const historyResult = await db.execute(
                `SELECT * FROM import_history WHERE session_id = $1`,
                [session.id]
            );

            expect(historyResult.rows.length).toBe(1);
            expect(historyResult.rows[0].performed_by).toBe(testUserId);
        });

        it('should update session status to completed', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await db.execute(
                `UPDATE import_records SET match_status = 'new' WHERE session_id = $1`,
                [session.id]
            );

            await bulkImportService.executeImport(testTenantId, session.id, testUserId);

            const updatedSession = await bulkImportService.getImportSession(
                testTenantId,
                session.id
            );

            expect(updatedSession.status).toBe('completed');
        });
    });

    // Test Import Mappings

    describe('Import Mapping Templates', () => {
        it('should create an import mapping', async () => {
            const mapping = await bulkImportService.createImportMapping(
                testTenantId,
                testUserId,
                mockMappingData
            );

            expect(mapping).toBeDefined();
            expect(mapping.template_name).toBe(mockMappingData.templateName);
            expect(mapping.bank_name).toBe(mockMappingData.bankName);
            expect(mapping.is_active).toBe(true);
        });

        it('should get all mappings for tenant', async () => {
            await bulkImportService.createImportMapping(
                testTenantId,
                testUserId,
                mockMappingData
            );

            await bulkImportService.createImportMapping(
                testTenantId,
                testUserId,
                { ...mockMappingData, templateName: 'Bank of America Checking' }
            );

            const mappings = await bulkImportService.getImportMappings(testTenantId);

            expect(Array.isArray(mappings)).toBe(true);
            expect(mappings.length).toBeGreaterThanOrEqual(2);
        });

        it('should cache import mappings', async () => {
            await bulkImportService.createImportMapping(
                testTenantId,
                testUserId,
                mockMappingData
            );

            // First call
            const mappings1 = await bulkImportService.getImportMappings(testTenantId);

            // Second call (should be from cache)
            const mappings2 = await bulkImportService.getImportMappings(testTenantId);

            expect(JSON.stringify(mappings1)).toEqual(JSON.stringify(mappings2));
        });
    });

    // Test Import History

    describe('Import History', () => {
        it('should retrieve import history', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            await bulkImportService.parseAndCreateRecords(
                testTenantId,
                session.id,
                mockCSVContent
            );

            await db.execute(
                `UPDATE import_records SET match_status = 'new' WHERE session_id = $1`,
                [session.id]
            );

            await bulkImportService.executeImport(testTenantId, session.id, testUserId);

            const history = await bulkImportService.getImportHistory(testTenantId, 10, 0);

            expect(Array.isArray(history)).toBe(true);
            expect(history.length).toBeGreaterThan(0);
        });

        it('should support pagination in history', async () => {
            const history = await bulkImportService.getImportHistory(testTenantId, 5, 0);

            expect(history.length).toBeLessThanOrEqual(5);
        });
    });

    // Test Multi-Tenant Isolation

    describe('Multi-Tenant Isolation', () => {
        it('should isolate import sessions per tenant', async () => {
            const tenant1Id = '11111111-1111-1111-1111-111111111111';
            const tenant2Id = '22222222-2222-2222-2222-222222222222';

            const session1 = await bulkImportService.createImportSession(
                tenant1Id,
                testUserId,
                mockImportSessionData
            );

            const session2 = await bulkImportService.createImportSession(
                tenant2Id,
                testUserId,
                mockImportSessionData
            );

            // Tenant1 should not see tenant2's session
            const retrieved = await bulkImportService.getImportSession(
                tenant1Id,
                session2.id
            );

            expect(retrieved).toBeNull();
        });

        it('should prevent cross-tenant import execution', async () => {
            const tenant1Id = '11111111-1111-1111-1111-111111111111';
            const tenant2Id = '22222222-2222-2222-2222-222222222222';

            const session = await bulkImportService.createImportSession(
                tenant1Id,
                testUserId,
                mockImportSessionData
            );

            // Try to execute from different tenant
            await expect(async () => {
                await bulkImportService.executeImport(tenant2Id, session.id, testUserId);
            }).rejects.toThrow();
        });
    });

    // Test Error Handling

    describe('Error Handling', () => {
        it('should handle invalid CSV format', async () => {
            const session = await bulkImportService.createImportSession(
                testTenantId,
                testUserId,
                mockImportSessionData
            );

            const invalidCSV = 'This is not a valid CSV';

            await expect(async () => {
                await bulkImportService.parseAndCreateRecords(
                    testTenantId,
                    session.id,
                    invalidCSV
                );
            }).rejects.toThrow();
        });

        it('should handle missing session gracefully', async () => {
            await expect(async () => {
                await bulkImportService.executeImport(
                    testTenantId,
                    'non-existent-session-id',
                    testUserId
                );
            }).rejects.toThrow();
        });
    });
});
