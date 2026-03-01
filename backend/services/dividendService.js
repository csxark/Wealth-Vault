import db from '../config/db.js';
import { dividendSchedules, investments, vaults } from '../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Dividend Service (L3)
 * Tracks corporate action dates and incoming yield streams from external accounts
 */
class DividendService {
    /**
     * Schedule upcoming dividend payment
     */
    async scheduleDividend(userId, data) {
        const { investmentId, vaultId, symbol, exDividendDate, paymentDate, dividendPerShare, expectedAmount } = data;

        const [schedule] = await db.insert(dividendSchedules).values({
            userId,
            investmentId,
            vaultId,
            symbol,
            exDividendDate: new Date(exDividendDate),
            paymentDate: new Date(paymentDate),
            dividendPerShare: dividendPerShare.toString(),
            expectedAmount: expectedAmount.toString(),
            status: 'scheduled'
        }).returning();

        logInfo(`[Dividend Service] Scheduled dividend for ${symbol}: $${expectedAmount} on ${paymentDate}`);
        return schedule;
    }

    /**
     * Record actual dividend receipt
     */
    async recordDividendReceipt(scheduleId, actualAmount) {
        const [updated] = await db.update(dividendSchedules)
            .set({
                actualAmount: actualAmount.toString(),
                status: 'received'
            })
            .where(eq(dividendSchedules.id, scheduleId))
            .returning();

        logInfo(`[Dividend Service] Recorded dividend receipt: $${actualAmount}`);
        return updated;
    }

    /**
     * Get upcoming dividends for a user
     */
    async getUpcomingDividends(userId, daysAhead = 30) {
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + daysAhead);

        return await db.query.dividendSchedules.findMany({
            where: and(
                eq(dividendSchedules.userId, userId),
                gte(dividendSchedules.paymentDate, today),
                lte(dividendSchedules.paymentDate, futureDate),
                eq(dividendSchedules.status, 'scheduled')
            ),
            orderBy: (dividendSchedules, { asc }) => [asc(dividendSchedules.paymentDate)]
        });
    }

    /**
     * Get total expected dividend income for a period
     */
    async getExpectedDividendIncome(userId, startDate, endDate) {
        const schedules = await db.query.dividendSchedules.findMany({
            where: and(
                eq(dividendSchedules.userId, userId),
                gte(dividendSchedules.paymentDate, startDate),
                lte(dividendSchedules.paymentDate, endDate)
            )
        });

        const totalExpected = schedules.reduce((sum, s) => sum + parseFloat(s.expectedAmount || '0'), 0);
        const totalReceived = schedules.reduce((sum, s) => sum + parseFloat(s.actualAmount || '0'), 0);

        return {
            totalExpected: parseFloat(totalExpected.toFixed(2)),
            totalReceived: parseFloat(totalReceived.toFixed(2)),
            count: schedules.length,
            schedules
        };
    }

    /**
     * Mark dividend as reinvested
     */
    async markAsReinvested(scheduleId) {
        const [updated] = await db.update(dividendSchedules)
            .set({
                status: 'reinvested',
                reinvestedAt: new Date()
            })
            .where(eq(dividendSchedules.id, scheduleId))
            .returning();

        return updated;
    }

    /**
     * Sync dividend schedules from external market data
     * This would integrate with real APIs in production
     */
    async syncDividendSchedules(userId) {
        try {
            // Get all user investments with dividend-paying stocks
            const userInvestments = await db.query.investments.findMany({
                where: eq(investments.userId, userId)
            });

            let synced = 0;

            for (const investment of userInvestments) {
                // Mock dividend data - in production, fetch from external API
                const mockDividendData = this.getMockDividendData(investment.symbol);

                if (mockDividendData) {
                    await this.scheduleDividend(userId, {
                        investmentId: investment.id,
                        vaultId: investment.vaultId,
                        symbol: investment.symbol,
                        exDividendDate: mockDividendData.exDividendDate,
                        paymentDate: mockDividendData.paymentDate,
                        dividendPerShare: mockDividendData.dividendPerShare,
                        expectedAmount: parseFloat(investment.quantity) * mockDividendData.dividendPerShare
                    });
                    synced++;
                }
            }

            logInfo(`[Dividend Service] Synced ${synced} dividend schedules for user ${userId}`);
            return synced;
        } catch (error) {
            logError('[Dividend Service] Sync failed:', error);
            throw error;
        }
    }

    /**
     * Mock dividend data generator
     * Replace with real API integration in production
     */
    getMockDividendData(symbol) {
        const dividendStocks = {
            'AAPL': { dividendPerShare: 0.24, quarterlySchedule: true },
            'MSFT': { dividendPerShare: 0.68, quarterlySchedule: true },
            'JNJ': { dividendPerShare: 1.13, quarterlySchedule: true },
            'KO': { dividendPerShare: 0.44, quarterlySchedule: true },
            'PG': { dividendPerShare: 0.91, quarterlySchedule: true }
        };

        if (!dividendStocks[symbol]) return null;

        const today = new Date();
        const exDividendDate = new Date(today);
        exDividendDate.setDate(today.getDate() + 15); // 15 days from now

        const paymentDate = new Date(exDividendDate);
        paymentDate.setDate(exDividendDate.getDate() + 30); // 30 days after ex-dividend

        return {
            exDividendDate,
            paymentDate,
            dividendPerShare: dividendStocks[symbol].dividendPerShare
        };
    }
}

export default new DividendService();
