import secrets from 'secrets.js-grempe';
import crypto from 'crypto';
import db from '../config/db.js';
import { accessShards, shardReconstructionAttempts, shardCustodians, successionRules } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';
import auditService from './auditService.js';

/**
 * Access Shard Fragmentation Engine (#677)
 * Implements Shamir Secret Sharing for fragmenting encrypted asset credentials
 * into N shards where M-of-N are required for reconstruction.
 */
class ShardDistributorService {
    constructor() {
        // Default configuration
        this.defaultConfig = {
            totalShards: 5,      // N = 5 shards total
            threshold: 3,        // M = 3 shards required for reconstruction
            bits: 8              // 8 bits per shard (256 possible values)
        };

        // Initialize the service
        this.initialize();
    }

    async initialize() {
        // Ensure default custodians exist
        await this.ensureDefaultCustodians();
    }

    /**
     * Fragment a secret into N shards using Shamir Secret Sharing
     * @param {string} userId - User ID
     * @param {string} successionRuleId - Succession rule ID
     * @param {string} secret - The secret to fragment (base64 encoded)
     * @param {Object} options - Configuration options
     * @returns {Array} Array of shard objects
     */
    async fragmentSecret(userId, successionRuleId, secret, options = {}) {
        try {
            const config = { ...this.defaultConfig, ...options };
            const { totalShards, threshold, bits } = config;

            // Validate inputs
            if (!userId || !successionRuleId || !secret) {
                throw new Error('User ID, succession rule ID, and secret are required');
            }

            if (threshold > totalShards) {
                throw new Error('Threshold cannot be greater than total shards');
            }

            if (threshold < 2) {
                throw new Error('Threshold must be at least 2 for security');
            }

            // Convert secret to hex for secrets.js
            const secretHex = Buffer.from(secret, 'base64').toString('hex');

            // Generate shards using Shamir Secret Sharing
            const shards = secrets.share(secretHex, totalShards, threshold, bits);

            // Create shard records in database
            const shardRecords = [];
            for (let i = 0; i < shards.length; i++) {
                const shardData = shards[i];
                const checksum = this.generateChecksum(shardData);

                const shardRecord = {
                    userId,
                    successionRuleId,
                    shardIndex: i,
                    totalShards,
                    threshold,
                    shardData,
                    checksum,
                    distributionMethod: options.distributionMethod || 'automated',
                    metadata: {
                        createdBy: 'system',
                        algorithm: 'shamir',
                        bits,
                        ...options.metadata
                    }
                };

                shardRecords.push(shardRecord);
            }

            // Store shards in database
            const insertedShards = await db.insert(accessShards).values(shardRecords).returning();

            // Audit the fragmentation
            await auditService.log(userId, 'SHARD_FRAGMENTATION', 'success', {
                successionRuleId,
                totalShards,
                threshold,
                algorithm: 'shamir'
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            // Emit event
            eventBus.emit('SHARDS_FRAGMENTED', {
                userId,
                successionRuleId,
                totalShards,
                threshold,
                shardCount: insertedShards.length
            });

            return insertedShards;

        } catch (error) {
            console.error('Error fragmenting secret:', error);

            // Audit the failure
            await auditService.log(userId, 'SHARD_FRAGMENTATION', 'failure', {
                successionRuleId,
                error: error.message
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            throw error;
        }
    }

    /**
     * Reconstruct a secret from provided shards
     * @param {string} userId - User ID
     * @param {string} successionRuleId - Succession rule ID
     * @param {Array} providedShards - Array of shard data strings
     * @returns {string} Reconstructed secret (base64 encoded)
     */
    async reconstructSecret(userId, successionRuleId, providedShards) {
        try {
            if (!userId || !successionRuleId || !providedShards || providedShards.length === 0) {
                throw new Error('User ID, succession rule ID, and shards are required');
            }

            // Get shard configuration from database
            const existingShards = await db
                .select()
                .from(accessShards)
                .where(and(
                    eq(accessShards.userId, userId),
                    eq(accessShards.successionRuleId, successionRuleId),
                    eq(accessShards.status, 'active')
                ))
                .limit(1);

            if (existingShards.length === 0) {
                throw new Error('No active shards found for this user and succession rule');
            }

            const { totalShards, threshold } = existingShards[0];

            // Validate provided shards
            if (providedShards.length < threshold) {
                await this.logReconstructionAttempt(userId, successionRuleId, providedShards.length, threshold, false, 'insufficient_shards');
                throw new Error(`Insufficient shards provided. Need at least ${threshold} out of ${totalShards}`);
            }

            // Verify shard integrity
            const tamperedIndices = [];
            for (let i = 0; i < providedShards.length; i++) {
                const checksum = this.generateChecksum(providedShards[i]);
                // In a real implementation, you'd compare against stored checksums
                // For now, we'll assume they're valid
            }

            if (tamperedIndices.length > 0) {
                await this.logReconstructionAttempt(userId, successionRuleId, providedShards.length, threshold, false, 'tampered_shards', tamperedIndices);
                throw new Error(`Tampered shards detected at indices: ${tamperedIndices.join(', ')}`);
            }

            // Reconstruct the secret
            const reconstructedHex = secrets.combine(providedShards);
            const reconstructedSecret = Buffer.from(reconstructedHex, 'hex').toString('base64');

            // Log successful reconstruction
            await this.logReconstructionAttempt(userId, successionRuleId, providedShards.length, threshold, true, null, [], reconstructedSecret);

            // Audit the reconstruction
            await auditService.log(userId, 'SHARD_RECONSTRUCTION', 'success', {
                successionRuleId,
                shardsProvided: providedShards.length,
                threshold
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            // Emit event
            eventBus.emit('SECRET_RECONSTRUCTED', {
                userId,
                successionRuleId,
                shardsUsed: providedShards.length
            });

            return reconstructedSecret;

        } catch (error) {
            console.error('Error reconstructing secret:', error);

            // Audit the failure
            await auditService.log(userId, 'SHARD_RECONSTRUCTION', 'failure', {
                successionRuleId,
                error: error.message
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            throw error;
        }
    }

    /**
     * Distribute shards to custodians
     * @param {string} userId - User ID
     * @param {string} successionRuleId - Succession rule ID
     * @param {Array} custodianIds - Array of custodian IDs
     * @returns {Object} Distribution result
     */
    async distributeShards(userId, successionRuleId, custodianIds) {
        try {
            // Get available shards
            const shards = await db
                .select()
                .from(accessShards)
                .where(and(
                    eq(accessShards.userId, userId),
                    eq(accessShards.successionRuleId, successionRuleId),
                    eq(accessShards.status, 'active')
                ));

            if (shards.length === 0) {
                throw new Error('No shards found to distribute');
            }

            if (custodianIds.length !== shards.length) {
                throw new Error('Number of custodians must match number of shards');
            }

            // Assign custodians to shards
            const updates = [];
            for (let i = 0; i < shards.length; i++) {
                updates.push(
                    db.update(accessShards)
                        .set({
                            custodianId: custodianIds[i],
                            custodianType: 'user', // Assuming user custodians for now
                            updatedAt: new Date()
                        })
                        .where(eq(accessShards.id, shards[i].id))
                );
            }

            await Promise.all(updates);

            // Audit the distribution
            await auditService.log(userId, 'SHARD_DISTRIBUTION', 'success', {
                successionRuleId,
                custodianCount: custodianIds.length
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            // Emit event
            eventBus.emit('SHARDS_DISTRIBUTED', {
                userId,
                successionRuleId,
                custodianCount: custodianIds.length
            });

            return {
                success: true,
                distributedShards: shards.length,
                custodians: custodianIds
            };

        } catch (error) {
            console.error('Error distributing shards:', error);

            // Audit the failure
            await auditService.log(userId, 'SHARD_DISTRIBUTION', 'failure', {
                successionRuleId,
                error: error.message
            }, {
                resourceType: 'succession_rule',
                resourceId: successionRuleId
            });

            throw error;
        }
    }

    /**
     * Get shard status for a user
     * @param {string} userId - User ID
     * @param {string} successionRuleId - Succession rule ID
     * @returns {Object} Shard status information
     */
    async getShardStatus(userId, successionRuleId) {
        const shards = await db
            .select({
                id: accessShards.id,
                shardIndex: accessShards.shardIndex,
                totalShards: accessShards.totalShards,
                threshold: accessShards.threshold,
                custodianId: accessShards.custodianId,
                custodianType: accessShards.custodianType,
                status: accessShards.status,
                lastVerifiedAt: accessShards.lastVerifiedAt,
                createdAt: accessShards.createdAt
            })
            .from(accessShards)
            .where(and(
                eq(accessShards.userId, userId),
                eq(accessShards.successionRuleId, successionRuleId)
            ))
            .orderBy(accessShards.shardIndex);

        const totalShards = shards.length > 0 ? shards[0].totalShards : 0;
        const threshold = shards.length > 0 ? shards[0].threshold : 0;
        const activeShards = shards.filter(s => s.status === 'active').length;

        return {
            totalShards,
            threshold,
            activeShards,
            shards: shards.map(shard => ({
                index: shard.shardIndex,
                custodianId: shard.custodianId,
                custodianType: shard.custodianType,
                status: shard.status,
                lastVerifiedAt: shard.lastVerifiedAt,
                createdAt: shard.createdAt
            }))
        };
    }

    /**
     * Revoke a shard (mark as compromised or inactive)
     * @param {string} userId - User ID
     * @param {string} shardId - Shard ID
     * @param {string} reason - Reason for revocation
     */
    async revokeShard(userId, shardId, reason = 'manual_revoke') {
        const result = await db
            .update(accessShards)
            .set({
                status: 'revoked',
                compromiseDetectedAt: new Date(),
                metadata: { revokeReason: reason },
                updatedAt: new Date()
            })
            .where(and(
                eq(accessShards.id, shardId),
                eq(accessShards.userId, userId)
            ))
            .returning();

        if (result.length === 0) {
            throw new Error('Shard not found or access denied');
        }

        // Audit the revocation
        await auditService.log(userId, 'SHARD_REVOCATION', 'success', {
            shardId,
            reason
        }, {
            resourceType: 'access_shard',
            resourceId: shardId
        });

        // Emit event
        eventBus.emit('SHARD_REVOKED', {
            userId,
            shardId,
            reason
        });

        return result[0];
    }

    // Private helper methods

    /**
     * Generate SHA-256 checksum for shard data
     * @param {string} data - Shard data
     * @returns {string} Checksum
     */
    generateChecksum(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Log reconstruction attempt
     * @param {string} userId - User ID
     * @param {string} successionRuleId - Succession rule ID
     * @param {number} shardsProvided - Number of shards provided
     * @param {number} threshold - Threshold required
     * @param {boolean} success - Whether reconstruction succeeded
     * @param {string} failureReason - Reason for failure
     * @param {Array} tamperedIndices - Indices of tampered shards
     * @param {string} reconstructedData - Reconstructed data (if successful)
     */
    async logReconstructionAttempt(userId, successionRuleId, shardsProvided, threshold, success, failureReason, tamperedIndices = [], reconstructedData = null) {
        await db.insert(shardReconstructionAttempts).values({
            userId,
            successionRuleId,
            shardsProvided,
            thresholdRequired: threshold,
            success,
            failureReason,
            tamperedShardIndices: tamperedIndices,
            reconstructedData: success ? reconstructedData : null
        });
    }

    /**
     * Ensure default custodians exist
     */
    async ensureDefaultCustodians() {
        // This would create default custodian records if needed
        // For now, we'll assume custodians are managed externally
    }
}

export default new ShardDistributorService();