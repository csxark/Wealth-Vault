import fs from 'fs';
import path from 'path';
import db from '../config/db.js';
import { taxDeductionLedger } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Tax Filing Service (L3)
 * Service to generate structured files for jurisdictional tax reporting (1099, W-2 equivalents).
 */
class TaxFilingService {
    /**
     * Generate Tax Filing File (XML/CSV/JSON)
     */
    async generateFiling(userId, entityId, ledgerIds, format = 'json') {
        try {
            const entries = await db.query.taxDeductionLedger.findMany({
                where: and(
                    eq(taxDeductionLedger.entityId, entityId),
                    inArray(taxDeductionLedger.id, ledgerIds)
                )
            });

            if (entries.length === 0) throw new Error('No entries found for filing');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `tax_filing_${entityId}_${timestamp}.${format}`;
            const filePath = path.join(process.cwd(), 'logs', 'filings', fileName);

            if (!fs.existsSync(path.dirname(filePath))) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
            }

            let content;
            if (format === 'json') {
                content = JSON.stringify({
                    metadata: {
                        userId,
                        entityId,
                        totalAmount: entries.reduce((sum, e) => sum + parseFloat(e.amount), 0),
                        jurisdictions: [...new Set(entries.map(e => e.jurisdiction))]
                    },
                    data: entries
                }, null, 2);
            } else if (format === 'csv') {
                const header = 'id,tax_type,amount,jurisdiction,status,created_at\n';
                const rows = entries.map(e => `${e.id},${e.taxType},${e.amount},${e.jurisdiction},${e.status},${e.createdAt}`).join('\n');
                content = header + rows;
            } else if (format === 'pdf') {
                // Mocking a PDF data block (binary-like structure)
                content = `%PDF-1.4\n%WealthVault Tax Record\n1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n... [Simulated PDF Data Block for ${entityId}] ...`;
            } else {
                throw new Error('Unsupported format');
            }

            fs.writeFileSync(filePath, content);

            // Mark entries as filed
            await db.update(taxDeductionLedger)
                .set({ status: 'filed' })
                .where(inArray(taxDeductionLedger.id, ledgerIds));

            logInfo(`[Tax Filing] Generated ${format.toUpperCase()} tax filing: ${fileName}`);
            return { fileName, filePath, format };
        } catch (error) {
            logError('[Tax Filing] Filing generation failed:', error);
            throw error;
        }
    }

    /**
     * Get Upcoming Deadlines
     */
    async getUpcomingDeadlines(userId) {
        return await db.query.taxDeductionLedger.findMany({
            where: and(
                eq(taxDeductionLedger.userId, userId),
                eq(taxDeductionLedger.status, 'pending_filing')
            ),
            orderBy: (t, { asc }) => [asc(t.filingDeadline)]
        });
    }
}

export default new TaxFilingService();
