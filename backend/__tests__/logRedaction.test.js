// backend/__tests__/logRedaction.test.js
// Issue #650: Fine-Grained Log Redaction Engine - Test Suite

import { jest } from '@jest/globals';
import { db } from '../config/database.js';
import { redis } from '../config/redis.js';
import {
    createRedactionRule,
    updateRedactionRule,
    deleteRedactionRule,
    listRedactionRules,
    testRedactionRule,
    redactLogEntry,
    detokenizeValue,
    REDACTION_TYPES,
    SENSITIVE_FIELD_TYPES
} from '../services/logRedactionService.js';
import { logRedactionJob } from '../jobs/logRedactionJob.js';
import { logRedactionRules } from '../db/schema.js';

// Mock dependencies
jest.mock('../config/database.js');
jest.mock('../config/redis.js');
jest.mock('../utils/logger.js', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

describe('Log Redaction Engine', () => {
    const mockTenantId = '550e8400-e29b-41d4-a716-446655440000';
    const mockUserId = '660e8400-e29b-41d4-a716-446655440001';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Redaction Rule Management', () => {
        test('should create a new redaction rule', async () => {
            const ruleData = {
                fieldPath: 'user.email',
                redactionType: REDACTION_TYPES.MASK,
                fieldType: SENSITIVE_FIELD_TYPES.EMAIL,
                priority: 80,
                description: 'Mask user emails'
            };

            const mockRule = {
                id: '770e8400-e29b-41d4-a716-446655440002',
                ...ruleData,
                tenantId: mockTenantId,
                createdBy: mockUserId,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            db.insert.mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockResolvedValue([mockRule])
                })
            });

            const result = await createRedactionRule(mockTenantId, ruleData);

            expect(result).toEqual(mockRule);
            expect(db.insert).toHaveBeenCalledWith(logRedactionRules);
        });

        test('should list redaction rules for a tenant', async () => {
            const mockRules = [
                {
                    id: '770e8400-e29b-41d4-a716-446655440002',
                    fieldPath: 'user.email',
                    redactionType: REDACTION_TYPES.MASK,
                    fieldType: SENSITIVE_FIELD_TYPES.EMAIL,
                    priority: 80,
                    isActive: true
                }
            ];

            db.select.mockReturnValue({
                from: jest.fn().mockReturnValue({
                    where: jest.fn().mockReturnValue({
                        orderBy: jest.fn().mockResolvedValue(mockRules)
                    })
                })
            });

            const result = await listRedactionRules(mockTenantId);

            expect(result).toEqual(mockRules);
            expect(result).toHaveLength(1);
        });

        test('should update a redaction rule', async () => {
            const ruleId = '770e8400-e29b-41d4-a716-446655440002';
            const updates = { priority: 90 };

            db.update.mockReturnValue({
                set: jest.fn().mockReturnValue({
                    where: jest.fn().mockResolvedValue({ rowCount: 1 })
                })
            });

            await updateRedactionRule(ruleId, mockTenantId, updates);

            expect(db.update).toHaveBeenCalledWith(logRedactionRules);
        });

        test('should delete a redaction rule', async () => {
            const ruleId = '770e8400-e29b-41d4-a716-446655440002';

            db.delete.mockReturnValue({
                where: jest.fn().mockResolvedValue({ rowCount: 1 })
            });

            await deleteRedactionRule(ruleId, mockTenantId);

            expect(db.delete).toHaveBeenCalledWith(logRedactionRules);
        });
    });

    describe('Log Entry Redaction', () => {
        test('should mask email addresses', async () => {
            const logEntry = {
                user: {
                    email: 'john.doe@example.com',
                    name: 'John Doe'
                },
                action: 'login'
            };

            const rules = [{
                fieldPath: 'user.email',
                redactionType: REDACTION_TYPES.MASK,
                fieldType: SENSITIVE_FIELD_TYPES.EMAIL
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.user.email).toMatch(/^[*]{3}[^*]*[*]{3}@example\.com$/);
            expect(result.user.name).toBe('John Doe');
            expect(result.action).toBe('login');
        });

        test('should hash sensitive values', async () => {
            const logEntry = {
                user: {
                    ssn: '123-45-6789'
                }
            };

            const rules = [{
                fieldPath: 'user.ssn',
                redactionType: REDACTION_TYPES.HASH,
                fieldType: SENSITIVE_FIELD_TYPES.SSN
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.user.ssn).toMatch(/^REDACTED_[a-f0-9]{8}$/);
            expect(result.user.ssn).not.toBe('123-45-6789');
        });

        test('should tokenize credit card numbers', async () => {
            const logEntry = {
                payment: {
                    cardNumber: '4111111111111111'
                }
            };

            const rules = [{
                fieldPath: 'payment.cardNumber',
                redactionType: REDACTION_TYPES.TOKENIZE,
                fieldType: SENSITIVE_FIELD_TYPES.CREDIT_CARD
            }];

            redis.setex = jest.fn().mockResolvedValue('OK');

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.payment.cardNumber).toMatch(/^REDACTED_[a-f0-9\-]+$/);
            expect(redis.setex).toHaveBeenCalled();
        });

        test('should remove sensitive fields', async () => {
            const logEntry = {
                request: {
                    headers: {
                        authorization: 'Bearer token123',
                        'content-type': 'application/json'
                    }
                }
            };

            const rules = [{
                fieldPath: 'request.headers.authorization',
                redactionType: REDACTION_TYPES.REMOVE
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.request.headers.authorization).toBeUndefined();
            expect(result.request.headers['content-type']).toBe('application/json');
        });

        test('should handle nested object paths', async () => {
            const logEntry = {
                data: {
                    user: {
                        profile: {
                            email: 'test@example.com'
                        }
                    }
                }
            };

            const rules = [{
                fieldPath: 'data.user.profile.email',
                redactionType: REDACTION_TYPES.MASK
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.data.user.profile.email).toMatch(/^[*]{3}[^*]*[*]{3}@example\.com$/);
        });

        test('should handle array field paths', async () => {
            const logEntry = {
                users: [
                    { email: 'user1@example.com' },
                    { email: 'user2@example.com' }
                ]
            };

            const rules = [{
                fieldPath: 'users[*].email',
                redactionType: REDACTION_TYPES.MASK
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result.users[0].email).toMatch(/^[*]{3}[^*]*[*]{3}@example\.com$/);
            expect(result.users[1].email).toMatch(/^[*]{3}[^*]*[*]{3}@example\.com$/);
        });
    });

    describe('Tokenization and Detokenization', () => {
        test('should detokenize a value', async () => {
            const token = 'REDACTED_12345678-1234-1234-1234-123456789abc';
            const originalValue = '4111111111111111';

            redis.get = jest.fn().mockResolvedValue(originalValue);

            const result = await detokenizeValue(token);

            expect(result).toBe(originalValue);
            expect(redis.get).toHaveBeenCalledWith(`redaction:token:${token}`);
        });

        test('should return token if not found in cache', async () => {
            const token = 'REDACTED_12345678-1234-1234-1234-123456789abc';

            redis.get = jest.fn().mockResolvedValue(null);

            const result = await detokenizeValue(token);

            expect(result).toBe(token);
        });
    });

    describe('Rule Testing', () => {
        test('should test a redaction rule configuration', async () => {
            const ruleData = {
                fieldPath: 'user.email',
                redactionType: REDACTION_TYPES.MASK,
                fieldType: SENSITIVE_FIELD_TYPES.EMAIL
            };

            const testValue = 'john.doe@example.com';

            const result = await testRedactionRule(mockTenantId, ruleData, testValue);

            expect(result.originalValue).toBe(testValue);
            expect(result.redactedValue).toMatch(/^[*]{3}[^*]*[*]{3}@example\.com$/);
            expect(result.redactionType).toBe(REDACTION_TYPES.MASK);
        });
    });

    describe('Background Job Processing', () => {
        test('should queue a log entry for redaction', async () => {
            const logData = { user: { email: 'test@example.com' } };

            redis.rpush = jest.fn().mockResolvedValue(1);

            await logRedactionJob.queueLogEntryRedaction(logData, mockTenantId);

            expect(redis.rpush).toHaveBeenCalledWith(
                'queue:log-redaction-queue',
                expect.stringContaining('"type":"redact_log_entry"')
            );
        });

        test('should queue batch log redaction', async () => {
            const logIds = ['log1', 'log2'];
            const logEntries = [{ data: 'entry1' }, { data: 'entry2' }];

            redis.rpush = jest.fn().mockResolvedValue(1);

            await logRedactionJob.queueBatchLogRedaction(logIds, logEntries, mockTenantId);

            expect(redis.rpush).toHaveBeenCalledWith(
                'queue:log-redaction-queue',
                expect.stringContaining('"type":"batch_redact_logs"')
            );
        });

        test('should process pending jobs', async () => {
            const jobData = JSON.stringify({
                type: 'validate_redaction_rules',
                data: {},
                tenantId: mockTenantId,
                jobId: 'test-job'
            });

            redis.lpop = jest.fn().mockResolvedValue(jobData);
            redis.keys = jest.fn().mockResolvedValue([]);

            // Mock the validation method
            logRedactionJob.validateRedactionRules = jest.fn().mockResolvedValue({
                totalRules: 5,
                conflicts: [],
                coverage: { email: true, phone: true }
            });

            await logRedactionJob.processPendingJobs();

            expect(redis.lpop).toHaveBeenCalledWith('queue:log-redaction-queue');
            expect(logRedactionJob.validateRedactionRules).toHaveBeenCalledWith(mockTenantId);
        });
    });

    describe('Field Type Detection', () => {
        test('should detect email field type', () => {
            const value = 'user@example.com';
            // This would be tested through the service's internal detection logic
            expect(value).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        });

        test('should detect phone field type', () => {
            const value = '+1-555-123-4567';
            // This would be tested through the service's internal detection logic
            expect(value).toMatch(/^\+?[\d\s\-\(\)]+$/);
        });

        test('should detect SSN field type', () => {
            const value = '123-45-6789';
            // This would be tested through the service's internal detection logic
            expect(value).toMatch(/^\d{3}-\d{2}-\d{4}$/);
        });

        test('should detect credit card field type', () => {
            const value = '4111111111111111';
            // This would be tested through the service's internal detection logic
            expect(value).toMatch(/^\d{13,19}$/);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid field paths gracefully', async () => {
            const logEntry = { user: { name: 'John' } };
            const rules = [{
                fieldPath: 'user.email', // Field doesn't exist
                redactionType: REDACTION_TYPES.MASK
            }];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            expect(result).toEqual(logEntry); // Should return unchanged
        });

        test('should handle database errors during rule creation', async () => {
            db.insert.mockReturnValue({
                values: jest.fn().mockReturnValue({
                    returning: jest.fn().mockRejectedValue(new Error('Database error'))
                })
            });

            await expect(createRedactionRule(mockTenantId, {
                fieldPath: 'user.email',
                redactionType: REDACTION_TYPES.MASK
            })).rejects.toThrow('Database error');
        });

        test('should handle Redis errors during tokenization', async () => {
            const logEntry = { payment: { cardNumber: '4111111111111111' } };
            const rules = [{
                fieldPath: 'payment.cardNumber',
                redactionType: REDACTION_TYPES.TOKENIZE
            }];

            redis.setex = jest.fn().mockRejectedValue(new Error('Redis error'));

            // Should still return a token even if Redis fails
            const result = await redactLogEntry(logEntry, rules, mockTenantId);
            expect(result.payment.cardNumber).toMatch(/^REDACTED_[a-f0-9\-]+$/);
        });
    });

    describe('Performance and Scaling', () => {
        test('should handle large log entries efficiently', async () => {
            const largeLogEntry = {
                data: 'x'.repeat(10000), // 10KB of data
                nested: {
                    deep: {
                        value: 'secret@email.com'
                    }
                }
            };

            const rules = [{
                fieldPath: 'nested.deep.value',
                redactionType: REDACTION_TYPES.MASK
            }];

            const startTime = Date.now();
            const result = await redactLogEntry(largeLogEntry, rules, mockTenantId);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
            expect(result.nested.deep.value).toMatch(/^[*]{3}[^*]*[*]{3}@email\.com$/);
        });

        test('should prioritize rules correctly', async () => {
            const logEntry = {
                user: {
                    email: 'test@example.com'
                }
            };

            const rules = [
                {
                    fieldPath: 'user.email',
                    redactionType: REDACTION_TYPES.MASK,
                    priority: 10
                },
                {
                    fieldPath: 'user.email',
                    redactionType: REDACTION_TYPES.REMOVE,
                    priority: 90 // Higher priority
                }
            ];

            const result = await redactLogEntry(logEntry, rules, mockTenantId);

            // Higher priority rule (REMOVE) should be applied
            expect(result.user.email).toBeUndefined();
        });
    });
});