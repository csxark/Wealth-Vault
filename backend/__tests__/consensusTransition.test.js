import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import consensusTransition from '../services/consensusTransition.js';

// Mock dependencies
jest.mock('../config/db.js');
jest.mock('../events/eventBus.js');
jest.mock('../services/auditService.js');
jest.mock('../services/notificationService.js');

describe('ConsensusTransitionService', () => {
    let service;

    beforeEach(() => {
        // Reset service instance
        service = new (consensusTransition.constructor)();
    });

    describe('validateSignature', () => {
        it('should validate signature for existing guardian', async () => {
            // Mock database response
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue([{
                    id: 'guardian-1',
                    preferences: { publicKey: 'mock-public-key' }
                }])
            };

            // Mock crypto verification
            const mockVerifier = {
                update: jest.fn().mockReturnThis(),
                verify: jest.fn().mockReturnValue(true)
            };

            require('crypto').createVerify = jest.fn().mockReturnValue(mockVerifier);

            const result = await service.validateSignature('guardian-1', 'shard-1', 'signature', 'message');

            expect(result).toBe(true);
        });

        it('should handle missing public key with mock validation', async () => {
            // Mock database response without public key
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue([{
                    id: 'guardian-1',
                    preferences: {}
                }])
            };

            const result = await service.validateSignature('guardian-1', 'shard-1', 'valid-signature', 'message');

            expect(result).toBe(true); // Mock validation accepts valid signatures
        });
    });

    describe('submitApproval', () => {
        it('should reject duplicate approvals beyond limit', async () => {
            // Mock existing approvals
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue([
                    { id: 'vote-1' },
                    { id: 'vote-2' },
                    { id: 'vote-3' } // At limit
                ]),
                insert: jest.fn().mockReturnThis(),
                values: jest.fn().mockReturnThis(),
                returning: jest.fn().mockResolvedValue([])
            };

            const result = await service.submitApproval('guardian-1', 'shard-1', 'signature', 'request-1');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Maximum duplicate approval attempts exceeded');
        });

        it('should accept valid approval', async () => {
            // Mock no existing approvals
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn()
                    .mockResolvedValueOnce([]) // No existing approvals
                    .mockResolvedValueOnce([{ threshold: 3 }]), // Shard info
                insert: jest.fn().mockReturnThis(),
                values: jest.fn().mockReturnThis(),
                returning: jest.fn().mockResolvedValue([{ id: 'vote-1' }])
            };

            // Mock signature validation
            service.validateSignature = jest.fn().mockResolvedValue(true);
            service.checkQuorum = jest.fn().mockResolvedValue(false);

            const result = await service.submitApproval('guardian-1', 'shard-1', 'signature', 'request-1');

            expect(result.success).toBe(true);
            expect(result.voteId).toBe('vote-1');
            expect(result.quorumReached).toBe(false);
        });
    });

    describe('checkQuorum', () => {
        it('should return true when threshold is met', async () => {
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue([
                    { guardian_votes: { approvalDecision: 'approve' } },
                    { guardian_votes: { approvalDecision: 'approve' } },
                    { guardian_votes: { approvalDecision: 'approve' } }
                ])
            };

            const result = await service.checkQuorum('request-1');

            expect(result).toBe(true);
        });

        it('should return false when threshold is not met', async () => {
            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue([
                    { guardian_votes: { approvalDecision: 'approve' } },
                    { guardian_votes: { approvalDecision: 'reject' } }
                ])
            };

            const result = await service.checkQuorum('request-1');

            expect(result).toBe(false);
        });
    });

    describe('getConsensusStatus', () => {
        it('should return consensus status with approvals', async () => {
            const mockApprovals = [
                {
                    guardian_votes: {
                        guardianId: 'guardian-1',
                        approvalDecision: 'approve',
                        submittedAt: new Date()
                    },
                    users: { name: 'Guardian One' }
                }
            ];

            const mockDb = {
                select: jest.fn().mockReturnThis(),
                from: jest.fn().mockReturnThis(),
                leftJoin: jest.fn().mockReturnThis(),
                where: jest.fn().mockResolvedValue(mockApprovals)
            };

            service.checkQuorum = jest.fn().mockResolvedValue(true);

            const result = await service.getConsensusStatus('request-1');

            expect(result.totalApprovals).toBe(1);
            expect(result.totalRejections).toBe(0);
            expect(result.quorumReached).toBe(true);
            expect(result.approvals).toHaveLength(1);
        });
    });
});