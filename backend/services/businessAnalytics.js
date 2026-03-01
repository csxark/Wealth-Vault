
import db from '../config/db.js';
import { businessLedgers, corporateEntities } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class BusinessAnalytics {
    /**
     * Calculate core financial metrics for an entity
     */
    async calculateEntityHealth(entityId) {
        const ledgerEntries = await db.select().from(businessLedgers).where(eq(businessLedgers.entityId, entityId));

        let revenue = 0;
        let expenses = 0;
        let assets = 0;
        let liabilities = 0;

        ledgerEntries.forEach(entry => {
            const amt = parseFloat(entry.amount);
            switch (entry.type) {
                case 'revenue': revenue += amt; break;
                case 'expense': expenses += amt; break;
                case 'asset': assets += amt; break;
                case 'liability': liabilities += amt; break;
            }
        });

        const netIncome = revenue - expenses;
        const profitMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

        return {
            revenue,
            expenses,
            netIncome,
            profitMargin,
            equity: assets - liabilities + netIncome,
            burnRate: expenses // Simple monthly burn
        };
    }

    /**
     * Get monthly profit/loss trend
     */
    async getPLTrend(entityId, months = 6) {
        const query = sql`
            SELECT 
                DATE_TRUNC('month', transaction_date) as month,
                SUM(CASE WHEN type = 'revenue' THEN amount ELSE 0 END) as revenue,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses
            FROM business_ledgers
            WHERE entity_id = ${entityId}
            AND transaction_date > NOW() - INTERVAL '${sql.raw(months.toString())} months'
            GROUP BY 1
            ORDER BY 1 DESC
        `;

        const result = await db.execute(query);
        return result.rows;
    }

    /**
     * Calculate Dividend capacity (Available Equity for distribution)
     */
    async calculateDividendCapacity(entityId) {
        const health = await this.calculateEntityHealth(entityId);
        // Business rule: Can distribute up to 70% of Retained Earnings (Net Income)
        return Math.max(0, health.netIncome * 0.7);
    }
}

export default new BusinessAnalytics();
