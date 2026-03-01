import db from '../config/db.js';
import { escrowAuditLogs } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

/**
 * EscrowAuditLog Utility (#481)
 * Formalized logging and retrieval of high-stake escrow actions.
 */
class EscrowAuditLogUtility {
    /**
     * Standardized action log entry
     */
    static async log(contractId, action, actor, details = {}) {
        await db.insert(escrowAuditLogs).values({
            contractId,
            action,
            actor,
            details,
            timestamp: new Date()
        });
    }

    /**
     * Retrieves full history of an escrow contract for compliance auditing.
     */
    static async getHistory(contractId) {
        return await db.select()
            .from(escrowAuditLogs)
            .where(eq(escrowAuditLogs.contractId, contractId))
            .orderBy(desc(escrowAuditLogs.timestamp));
    }

    /**
     * Formats history for PDF/Report output
     */
    static formatForReport(logs) {
        return logs.map(l => {
            return `[${l.timestamp.toISOString()}] ${l.action} by ${l.actor}: ${JSON.stringify(l.details)}`;
        }).join('\n');
    }
}

export default EscrowAuditLogUtility;
