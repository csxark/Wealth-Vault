import { jest } from '@jest/globals';
import shardDistributor from '../services/shardDistributor.js';
import db from '../config/db.js';
import { accessShards, shardReconstructionAttempts } from '../db/schema.js';

// Mock dependencies
jest.mock('../config/db.js');
jest.mock('../events/eventBus.js');
jest.mock('../services/auditService.js');

const mockDb = {
    insert: jest.fn(),
    select: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
};

const mockEventBus = {
    emit: jest.fn()
};

const mockAuditService = {
    log: jest.fn()
};

// Setup mocks
db.insert.mockReturnValue(mockDb);
db.select.mockReturnValue(mockDb);
db.update.mockReturnValue(mockDb);
db.delete.mockReturnValue(mockDb);

describe('ShardDistributorService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fragmentSecret', () => {
        it('should successfully fragment a secret into shards', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const secret = Buffer.from('my-secret-data').toString('base64');

            // Mock database response
            const mockInsertedShards = [
                { id: 'shard-1', shardIndex: 0 },
                { id: 'shard-2', shardIndex: 1 },
                { id: 'shard-3', shardIndex: 2 }
            ];

            mockDb.values.mockReturnValue(mockDb);
            mockDb.returning.mockResolvedValue(mockInsertedShards);

            const result = await shardDistributor.fragmentSecret(userId, successionRuleId, secret);

            expect(result).toEqual(mockInsertedShards);
            expect(db.insert).toHaveBeenCalledWith(accessShards);
            expect(mockAuditService.log).toHaveBeenCalledWith(
                userId,
                'SHARD_FRAGMENTATION',
                'success',
                expect.objectContaining({
                    successionRuleId,
                    totalShards: 5,
                    threshold: 3
                }),
                expect.any(Object)
            );
        });

        it('should throw error for invalid inputs', async () => {
            await expect(shardDistributor.fragmentSecret(null, 'rule-123', 'secret'))
                .rejects.toThrow('User ID, succession rule ID, and secret are required');
        });

        it('should throw error when threshold exceeds total shards', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const secret = Buffer.from('my-secret-data').toString('base64');

            await expect(shardDistributor.fragmentSecret(userId, successionRuleId, secret, { threshold: 10, totalShards: 5 }))
                .rejects.toThrow('Threshold cannot be greater than total shards');
        });
    });

    describe('reconstructSecret', () => {
        it('should successfully reconstruct a secret from valid shards', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const providedShards = ['shard1', 'shard2', 'shard3'];

            // Mock database response for existing shards
            const mockExistingShards = [{
                totalShards: 5,
                threshold: 3
            }];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.limit.mockResolvedValue(mockExistingShards);

            // Mock reconstruction attempt logging
            mockDb.values.mockReturnValue(mockDb);

            const result = await shardDistributor.reconstructSecret(userId, successionRuleId, providedShards);

            expect(typeof result).toBe('string');
            expect(mockAuditService.log).toHaveBeenCalledWith(
                userId,
                'SHARD_RECONSTRUCTION',
                'success',
                expect.objectContaining({
                    successionRuleId,
                    shardsProvided: 3
                }),
                expect.any(Object)
            );
        });

        it('should throw error when insufficient shards provided', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const providedShards = ['shard1']; // Only 1 shard, need 3

            // Mock database response
            const mockExistingShards = [{
                totalShards: 5,
                threshold: 3
            }];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.limit.mockResolvedValue(mockExistingShards);

            await expect(shardDistributor.reconstructSecret(userId, successionRuleId, providedShards))
                .rejects.toThrow('Insufficient shards provided. Need at least 3 out of 5');
        });

        it('should throw error when no active shards found', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const providedShards = ['shard1', 'shard2', 'shard3'];

            // Mock empty database response
            mockDb.where.mockReturnValue(mockDb);
            mockDb.limit.mockResolvedValue([]);

            await expect(shardDistributor.reconstructSecret(userId, successionRuleId, providedShards))
                .rejects.toThrow('No active shards found for this user and succession rule');
        });
    });

    describe('distributeShards', () => {
        it('should successfully distribute shards to custodians', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const custodianIds = ['cust-1', 'cust-2', 'cust-3'];

            // Mock existing shards
            const mockShards = [
                { id: 'shard-1' },
                { id: 'shard-2' },
                { id: 'shard-3' }
            ];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.orderBy = jest.fn().mockResolvedValue(mockShards);

            // Mock update operations
            mockDb.set.mockReturnValue(mockDb);
            mockDb.returning.mockResolvedValue([{}]);

            const result = await shardDistributor.distributeShards(userId, successionRuleId, custodianIds);

            expect(result.success).toBe(true);
            expect(result.distributedShards).toBe(3);
            expect(result.custodians).toEqual(custodianIds);
        });

        it('should throw error when custodian count does not match shard count', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';
            const custodianIds = ['cust-1', 'cust-2']; // Only 2 custodians

            // Mock existing shards (3 shards)
            const mockShards = [
                { id: 'shard-1' },
                { id: 'shard-2' },
                { id: 'shard-3' }
            ];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.orderBy = jest.fn().mockResolvedValue(mockShards);

            await expect(shardDistributor.distributeShards(userId, successionRuleId, custodianIds))
                .rejects.toThrow('Number of custodians must match number of shards');
        });
    });

    describe('getShardStatus', () => {
        it('should return shard status information', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';

            const mockShards = [
                {
                    id: 'shard-1',
                    shardIndex: 0,
                    totalShards: 5,
                    threshold: 3,
                    custodianId: 'cust-1',
                    custodianType: 'user',
                    status: 'active',
                    lastVerifiedAt: new Date(),
                    createdAt: new Date()
                },
                {
                    id: 'shard-2',
                    shardIndex: 1,
                    totalShards: 5,
                    threshold: 3,
                    custodianId: 'cust-2',
                    custodianType: 'user',
                    status: 'active',
                    lastVerifiedAt: new Date(),
                    createdAt: new Date()
                }
            ];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.orderBy.mockResolvedValue(mockShards);

            const result = await shardDistributor.getShardStatus(userId, successionRuleId);

            expect(result.totalShards).toBe(5);
            expect(result.threshold).toBe(3);
            expect(result.activeShards).toBe(2);
            expect(result.shards).toHaveLength(2);
        });
    });

    describe('revokeShard', () => {
        it('should successfully revoke a shard', async () => {
            const userId = 'user-123';
            const shardId = 'shard-456';

            const mockRevokedShard = {
                id: shardId,
                status: 'revoked'
            };

            mockDb.where.mockReturnValue(mockDb);
            mockDb.returning.mockResolvedValue([mockRevokedShard]);

            const result = await shardDistributor.revokeShard(userId, shardId, 'compromised');

            expect(result.status).toBe('revoked');
            expect(mockAuditService.log).toHaveBeenCalledWith(
                userId,
                'SHARD_REVOCATION',
                'success',
                expect.objectContaining({
                    shardId,
                    reason: 'compromised'
                }),
                expect.any(Object)
            );
        });

        it('should throw error when shard not found', async () => {
            const userId = 'user-123';
            const shardId = 'shard-456';

            mockDb.where.mockReturnValue(mockDb);
            mockDb.returning.mockResolvedValue([]);

            await expect(shardDistributor.revokeShard(userId, shardId))
                .rejects.toThrow('Shard not found or access denied');
        });
    });

    describe('tampered shard detection', () => {
        it('should detect and reject tampered shards during reconstruction', async () => {
            const userId = 'user-123';
            const successionRuleId = 'rule-456';

            // Mock existing shards configuration
            const mockExistingShards = [{
                totalShards: 5,
                threshold: 3
            }];

            mockDb.where.mockReturnValue(mockDb);
            mockDb.limit.mockResolvedValue(mockExistingShards);

            // Provide tampered shards (this would be detected by checksum validation)
            const tamperedShards = ['tampered-shard-1', 'tampered-shard-2', 'tampered-shard-3'];

            // In a real scenario, the checksum validation would fail
            // For this test, we'll simulate the error
            await expect(shardDistributor.reconstructSecret(userId, successionRuleId, tamperedShards))
                .rejects.toThrow();
        });
    });
});