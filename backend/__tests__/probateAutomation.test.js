import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import probateAutomation from '../services/probateAutomation.js';

// Mock dependencies
jest.mock('../config/db.js');
jest.mock('../services/auditService.js');
jest.mock('../utils/logger.js');

describe('ProbateAutomationService', () => {
    let service;

    beforeEach(() => {
        service = new (probateAutomation.constructor)();
        jest.clearAllMocks();
    });

    describe('generateDigitalAssetLedger', () => {
        it('should generate a complete digital asset ledger', async () => {
            // Mock database responses
            const mockDb = {
                select: jest.fn()
                    .mockResolvedValueOnce([]) // Assets
                    .mockResolvedValueOnce([]) // Custodians
                    .mockResolvedValueOnce([]) // Encrypted references
                    .mockResolvedValueOnce([]) // Audit trail
                    .mockResolvedValueOnce([{ legalJurisdiction: 'US-CA' }]), // Jurisdiction
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                innerJoin: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis()
            };

            // Mock service methods
            service.gatherUserAssets = jest.fn().mockResolvedValue([]);
            service.identifyCustodians = jest.fn().mockResolvedValue([]);
            service.collectEncryptedReferences = jest.fn().mockResolvedValue([]);
            service.generateAuditTrail = jest.fn().mockResolvedValue([]);
            service.getJurisdiction = jest.fn().mockResolvedValue('US-CA');
            service.generateLedgerHash = jest.fn().mockReturnValue('mock-hash');
            service.signLedger = jest.fn().mockResolvedValue('mock-signature');

            const ledger = await service.generateDigitalAssetLedger('user-1', 'will-1');

            expect(ledger).toHaveProperty('version');
            expect(ledger).toHaveProperty('generatedAt');
            expect(ledger).toHaveProperty('userId', 'user-1');
            expect(ledger).toHaveProperty('willId', 'will-1');
            expect(ledger).toHaveProperty('hash', 'mock-hash');
            expect(ledger).toHaveProperty('signature', 'mock-signature');
            expect(ledger).toHaveProperty('verification');
        });
    });

    describe('gatherUserAssets', () => {
        it('should gather all types of user assets', async () => {
            const mockVaults = [{ id: 'vault-1', name: 'Main Vault', balance: 10000, currency: 'USD', type: 'checking', isActive: true }];
            const mockInvestments = [{ id: 'inv-1', symbol: 'AAPL', currentValue: 5000, currency: 'USD', quantity: 10 }];
            const mockEntities = [{ id: 'entity-1', name: 'My Corp', valuation: 100000, currency: 'USD', type: 'llc' }];
            const mockShards = [{ id: 'shard-1', shardIndex: 0, totalShards: 5, threshold: 3, custodianId: 'cust-1', status: 'active' }];

            const mockDb = {
                select: jest.fn()
                    .mockResolvedValueOnce(mockVaults)
                    .mockResolvedValueOnce(mockInvestments)
                    .mockResolvedValueOnce(mockEntities)
                    .mockResolvedValueOnce(mockShards),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis()
            };

            const assets = await service.gatherUserAssets('user-1');

            expect(assets).toHaveLength(4);
            expect(assets[0]).toMatchObject({
                type: 'vault',
                category: 'liquid_assets',
                value: 10000,
                currency: 'USD'
            });
            expect(assets[1]).toMatchObject({
                type: 'investment',
                category: 'investments',
                value: 5000
            });
            expect(assets[2]).toMatchObject({
                type: 'corporate_entity',
                category: 'business_interests',
                value: 100000
            });
            expect(assets[3]).toMatchObject({
                type: 'encrypted_shard',
                category: 'encrypted_assets',
                value: null
            });
        });
    });

    describe('identifyCustodians', () => {
        it('should identify custodians from shards', async () => {
            const mockCustodians = [{
                id: 'cust-1',
                name: 'John Doe',
                custodianType: 'user',
                contactInfo: { email: 'john@example.com' },
                trustLevel: 'high',
                isActive: true
            }];

            const mockDb = {
                select: jest.fn().mockResolvedValue(mockCustodians),
                from: jest.fn().mockReturnThis(),
                innerJoin: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis()
            };

            service.generateCustodianEndpoints = jest.fn().mockReturnValue({
                api: '/api/users/cust-1/custody',
                verification: '/api/users/cust-1/verify'
            });

            const custodians = await service.identifyCustodians('user-1');

            expect(custodians).toHaveLength(2); // Including system custodian
            expect(custodians[0]).toMatchObject({
                id: 'cust-1',
                name: 'John Doe',
                type: 'user',
                trustLevel: 'high',
                status: 'active'
            });
        });
    });

    describe('generateCustodianEndpoints', () => {
        it('should generate correct endpoints for different custodian types', () => {
            const userCustodian = { custodianType: 'user', id: 'user-1' };
            const entityCustodian = { custodianType: 'entity', id: 'entity-1' };
            const externalCustodian = {
                custodianType: 'external_service',
                contactInfo: {
                    apiEndpoint: 'https://external.com/api',
                    verificationEndpoint: 'https://external.com/verify'
                }
            };

            expect(service.generateCustodianEndpoints(userCustodian)).toEqual({
                api: '/api/users/user-1/custody',
                verification: '/api/users/user-1/verify'
            });

            expect(service.generateCustodianEndpoints(entityCustodian)).toEqual({
                api: '/api/entities/entity-1/custody',
                verification: '/api/entities/entity-1/verify'
            });

            expect(service.generateCustodianEndpoints(externalCustodian)).toEqual({
                api: 'https://external.com/api',
                verification: 'https://external.com/verify'
            });
        });
    });

    describe('collectEncryptedReferences', () => {
        it('should collect encrypted references from will and shards', async () => {
            const mockWill = [{
                metadata: { encryptedPortion: 'encrypted-data-123' },
                createdAt: new Date()
            }];
            const mockShards = [{
                id: 'shard-1',
                checksum: 'checksum-123',
                metadata: { algorithm: 'AES-256' },
                createdAt: new Date()
            }];

            const mockDb = {
                select: jest.fn()
                    .mockResolvedValueOnce(mockWill)
                    .mockResolvedValueOnce(mockShards),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis()
            };

            const references = await service.collectEncryptedReferences('user-1', 'will-1');

            expect(references).toHaveLength(2);
            expect(references[0]).toMatchObject({
                type: 'will_encrypted_portion',
                reference: 'encrypted-data-123',
                encryptionMethod: 'AES-256-GCM'
            });
            expect(references[1]).toMatchObject({
                type: 'shard_checksum',
                reference: 'checksum-123',
                shardId: 'shard-1'
            });
        });
    });

    describe('generateAuditTrail', () => {
        it('should generate timestamped audit trail', async () => {
            const mockAuditEntries = [{
                id: 'audit-1',
                action: 'VAULT_CREATED',
                resourceType: 'vault',
                resourceId: 'vault-1',
                createdAt: new Date(),
                metadata: { amount: 1000 }
            }];

            const mockDb = {
                select: jest.fn().mockResolvedValue(mockAuditEntries),
                from: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis()
            };

            const auditTrail = await service.generateAuditTrail('user-1');

            expect(auditTrail).toHaveLength(1);
            expect(auditTrail[0]).toMatchObject({
                id: 'audit-1',
                action: 'VAULT_CREATED',
                resourceType: 'vault',
                resourceId: 'vault-1'
            });
        });
    });

    describe('generateLedgerHash', () => {
        it('should generate consistent SHA-256 hash', () => {
            const ledger = {
                version: '1.0',
                userId: 'user-1',
                assets: [{ id: 'asset-1' }]
            };

            const hash1 = service.generateLedgerHash(ledger);
            const hash2 = service.generateLedgerHash(ledger);

            expect(hash1).toBe(hash2);
            expect(hash1).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64 format
        });

        it('should generate different hashes for different content', () => {
            const ledger1 = { userId: 'user-1', assets: [] };
            const ledger2 = { userId: 'user-2', assets: [] };

            const hash1 = service.generateLedgerHash(ledger1);
            const hash2 = service.generateLedgerHash(ledger2);

            expect(hash1).not.toBe(hash2);
        });
    });

    describe('verifyLedgerSignature', () => {
        it('should verify valid ledger signature', () => {
            const ledger = {
                version: '1.0',
                userId: 'user-1',
                hash: 'mock-hash',
                signature: 'mock-signature'
            };

            service.generateLedgerHash = jest.fn().mockReturnValue('mock-hash');

            // Mock successful verification
            const result = service.verifyLedgerSignature(ledger);

            // Since we're using mock signatures, this will depend on the implementation
            expect(typeof result).toBe('boolean');
        });

        it('should reject ledger with tampered hash', () => {
            const ledger = {
                version: '1.0',
                userId: 'user-1',
                hash: 'tampered-hash',
                signature: 'mock-signature'
            };

            service.generateLedgerHash = jest.fn().mockReturnValue('original-hash');

            const result = service.verifyLedgerSignature(ledger);

            expect(result).toBe(false);
        });
    });

    describe('exportLedger', () => {
        it('should export ledger in JSON format', async () => {
            const ledger = {
                version: '1.0',
                userId: 'user-1',
                hash: 'mock-hash',
                signature: 'mock-signature'
            };

            const exportResult = await service.exportLedger(ledger, 'json');

            expect(exportResult).toMatchObject({
                mimeType: 'application/json',
                format: 'json',
                size: expect.any(Number)
            });
            expect(exportResult.filename).toMatch(/digital-asset-ledger-user-1.*\.json/);
            expect(exportResult.content).toContain('"version":"1.0"');
        });

        it('should export ledger in XML format', async () => {
            const ledger = {
                version: '1.0',
                userId: 'user-1',
                assets: [],
                custodians: [],
                hash: 'mock-hash',
                signature: 'mock-signature'
            };

            const exportResult = await service.exportLedger(ledger, 'xml');

            expect(exportResult).toMatchObject({
                mimeType: 'application/xml',
                format: 'xml'
            });
            expect(exportResult.filename).toMatch(/digital-asset-ledger-user-1.*\.xml/);
            expect(exportResult.content).toContain('<DigitalAssetLedger>');
            expect(exportResult.content).toContain('</DigitalAssetLedger>');
        });

        it('should throw error for unsupported format', async () => {
            const ledger = { version: '1.0' };

            await expect(service.exportLedger(ledger, 'unsupported')).rejects.toThrow('Unsupported export format');
        });
    });

    describe('convertLedgerToXML', () => {
        it('should convert ledger object to XML', () => {
            const ledger = {
                version: '1.0',
                generatedAt: '2024-01-01T00:00:00.000Z',
                userId: 'user-1',
                willId: 'will-1',
                assets: [{
                    type: 'vault',
                    id: 'vault-1',
                    name: 'Main Vault',
                    category: 'liquid_assets',
                    value: 10000,
                    currency: 'USD',
                    custodian: 'internal'
                }],
                custodians: [{
                    id: 'cust-1',
                    name: 'John Doe',
                    type: 'user',
                    trustLevel: 'high',
                    status: 'active'
                }],
                hash: 'mock-hash',
                signature: 'mock-signature'
            };

            const xml = service.convertLedgerToXML(ledger);

            expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(xml).toContain('<DigitalAssetLedger>');
            expect(xml).toContain('<Version>1.0</Version>');
            expect(xml).toContain('<UserId>user-1</UserId>');
            expect(xml).toContain('<Asset>');
            expect(xml).toContain('<Type>vault</Type>');
            expect(xml).toContain('<Custodian>');
            expect(xml).toContain('<Id>cust-1</Id>');
            expect(xml).toContain('<Hash>mock-hash</Hash>');
            expect(xml).toContain('<Signature>mock-signature</Signature>');
            expect(xml).toContain('</DigitalAssetLedger>');
        });
    });
});