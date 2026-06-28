import cron from 'node-cron';
import db from '../config/db.js';
import { securityEvents, auditLogs, auditAnchors } from '../db/schema.js';
import { eq, and, gt, lt, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import MerkleTree from '../utils/merkleTree.js';
import tamperProofAuditService from '../services/tamperProofAuditService.js';
import crypto from 'crypto';

/**
 * Enhanced AuditTrailSealer (#475 + #627)
 * Periodically aggregates security and audit events into a Merkle Tree with tamper-proof anchoring.
 */
class AuditTrailSealer {
    constructor() {
        this.externalAnchoringEnabled = process.env.AUDIT_EXTERNAL_ANCHORING_ENABLED === 'true';
        this.externalService = process.env.AUDIT_EXTERNAL_SERVICE || 'blockchain';
        this.anchoringIntervalHours = parseInt(process.env.AUDIT_ANCHORING_INTERVAL_HOURS) || 1;
    }

    start() {
        // Run every hour (configurable)
        const cronExpression = `0 */${this.anchoringIntervalHours} * * *`;
        cron.schedule(cronExpression, async () => {
            await this.sealPeriodicAudit();
        });
        logInfo(`AuditTrailSealer scheduled (every ${this.anchoringIntervalHours} hour(s))`);

        // Also run integrity checks every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            await this.performIntegrityChecks();
        });
        logInfo('Audit integrity checks scheduled (every 6 hours)');
    }

    async sealPeriodicAudit() {
        logInfo('🧱 Starting tamper-proof Audit Trail sealing...');

        try {
            const now = new Date();
            const periodStart = new Date(now.getTime() - this.anchoringIntervalHours * 60 * 60 * 1000);

            // 1. Fetch high-stake events
            const [securityData, auditData] = await Promise.all([
                db.select().from(securityEvents)
                    .where(and(
                        gt(securityEvents.createdAt, periodStart),
                        lt(securityEvents.createdAt, now),
                        eq(securityEvents.isSealed, false)
                    )),
                db.select().from(auditLogs)
                    .where(and(
                        gt(auditLogs.createdAt, periodStart),
                        lt(auditLogs.createdAt, now),
                        eq(auditLogs.isSealed, false)
                    ))
            ]);

            // 2. Format into consistent leaves (Object-based)
            const allEvents = [
                ...securityData.map(e => ({
                    id: e.id,
                    type: 'security_event',
                    actorId: e.userId,
                    action: e.eventType,
                    payload: e.details,
                    timestamp: e.createdAt
                })),
                ...auditData.map(e => ({
                    id: e.id,
                    type: 'audit_log',
                    actorId: e.userId,
                    action: e.action,
                    payload: e.delta,
                    timestamp: e.createdAt
                }))
            ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (allEvents.length === 0) {
                logInfo('[AuditTrailSealer] No unsealed events to process in this period.');
                return;
            }

            // 3. Build Merkle Tree
            const tree = new MerkleTree(allEvents);
            const root = tree.getRoot();

            // 4. Chain to previous anchor
            const [lastAnchor] = await db.select()
                .from(auditAnchors)
                .orderBy(desc(auditAnchors.sealedAt))
                .limit(1);

            // 5. Publish Anchor with enhanced metadata
            const [anchor] = await db.insert(auditAnchors).values({
                merkleRoot: root,
                previousAnchorId: lastAnchor?.id || null,
                eventCount: allEvents.length,
                sealedAt: now,
                periodStart,
                periodEnd: now,
                sealMetadata: {
                    securityEventCount: securityData.length,
                    auditLogCount: auditData.length,
                    anchoringIntervalHours: this.anchoringIntervalHours,
                    tamperProofVersion: '627'
                }
            }).returning();

            // 6. Mark events as sealed
            if (securityData.length > 0) {
                await db.update(securityEvents)
                    .set({ isSealed: true, auditAnchorId: anchor.id })
                    .where(and(
                        gt(securityEvents.createdAt, periodStart),
                        lt(securityEvents.createdAt, now),
                        eq(securityEvents.isSealed, false)
                    ));
            }

            if (auditData.length > 0) {
                await db.update(auditLogs)
                    .set({ isSealed: true, auditAnchorId: anchor.id })
                    .where(and(
                        gt(auditLogs.createdAt, periodStart),
                        lt(auditLogs.createdAt, now),
                        eq(auditLogs.isSealed, false)
                    ));
            }

            logInfo(`✅ Audit period sealed. Root: ${root.substring(0, 16)}... | Events: ${allEvents.length}`);

            // 7. External anchoring (if enabled)
            if (this.externalAnchoringEnabled) {
                try {
                    await tamperProofAuditService.anchorExternally(anchor.id, this.externalService);
                    logInfo(`🔗 Externally anchored via ${this.externalService}`);
                } catch (externalError) {
                    logError('External anchoring failed, but local sealing succeeded:', externalError);
                    // Don't fail the entire sealing process if external anchoring fails
                }
            }

        } catch (err) {
            logError('Audit Sealing failed:', err);
        }
    }

    async performIntegrityChecks() {
        logInfo('🔍 Performing audit integrity checks...');

        try {
            // Check global integrity
            const globalReport = await tamperProofAuditService.getIntegrityReport(null, false);

            if (!globalReport.overallIntegrity.overall) {
                logError('🚨 CRITICAL: Global audit integrity compromised!', {
                    hashChainIssues: globalReport.overallIntegrity.issues
                });
            } else {
                logInfo('✅ Global audit integrity verified');
            }

            // Check tenant-specific integrity (sample a few tenants)
            const tenants = await db.execute(`
                SELECT DISTINCT tenant_id
                FROM audit_logs
                WHERE tenant_id IS NOT NULL
                LIMIT 5
            `);

            for (const tenant of tenants.rows) {
                const tenantReport = await tamperProofAuditService.getIntegrityReport(tenant.tenant_id, false);
                if (!tenantReport.overallIntegrity.overall) {
                    logError(`🚨 CRITICAL: Tenant ${tenant.tenant_id} audit integrity compromised!`, {
                        hashChainIssues: tenantReport.overallIntegrity.issues
                    });
                }
            }

        } catch (err) {
            logError('Integrity check failed:', err);
        }
    }
}

export default new AuditTrailSealer();
