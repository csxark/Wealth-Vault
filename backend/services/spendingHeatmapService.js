import db from '../config/db.js';
import { spendingHeatmaps, expenses, categories } from '../db/schema.js';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Spending Heatmap Service
 * Issue #667
 * 
 * Analyzes spending patterns and creates visual heatmaps showing:
 * - Category spending over time
 * - Time-of-day patterns
 * - Day-of-week trends
 * - Merchant frequency
 */
class SpendingHeatmapService {
    /**
     * Generate spending heatmap for a period
     */
    async generateHeatmap(userId, tenantId, period = 'monthly', startDate = null, endDate = null) {
        try {
            // Calculate date range
            const { start, end } = this.getDateRange(period, startDate, endDate);

            // Get all expenses in the period
            const expenseData = await db.select({
                id: expenses.id,
                amount: expenses.amount,
                category: expenses.category,
                merchant: expenses.merchant,
                date: expenses.date,
                createdAt: expenses.createdAt
            }).from(expenses)
            .where(and(
                eq(expenses.userId, userId),
                eq(expenses.type, 'expense'),
                gte(expenses.date, start),
                lte(expenses.date, end)
            ));

            if (expenseData.length === 0) {
                return null; // No data for this period
            }

            // Generate heatmap data structures
            const categoryHeatmap = this.generateCategoryHeatmap(expenseData, start, end);
            const timeOfDayHeatmap = this.generateTimeOfDayHeatmap(expenseData);
            const dayOfWeekHeatmap = this.generateDayOfWeekHeatmap(expenseData);
            const merchantHeatmap = this.generateMerchantHeatmap(expenseData);

            // Derive insights
            const peakSpendingTimes = this.identifyPeakSpendingTimes(timeOfDayHeatmap, dayOfWeekHeatmap);
            const topCategories = this.identifyTopCategories(categoryHeatmap, expenseData);
            const spendingPatterns = this.identifySpendingPatterns(expenseData, timeOfDayHeatmap, dayOfWeekHeatmap);

            // Create or update heatmap
            const heatmapData = {
                tenantId,
                userId,
                period,
                startDate: start,
                endDate: end,
                categoryHeatmap,
                timeOfDayHeatmap,
                dayOfWeekHeatmap,
                merchantHeatmap,
                peakSpendingTimes,
                topCategories,
                spendingPatterns,
                updatedAt: new Date()
            };

            // Delete existing heatmap for this period
            await db.delete(spendingHeatmaps)
                .where(and(
                    eq(spendingHeatmaps.userId, userId),
                    eq(spendingHeatmaps.tenantId, tenantId),
                    eq(spendingHeatmaps.period, period),
                    eq(spendingHeatmaps.startDate, start)
                ));

            // Insert new heatmap
            const [result] = await db.insert(spendingHeatmaps)
                .values(heatmapData)
                .returning();

            return result;
        } catch (error) {
            console.error('Error generating spending heatmap:', error);
            throw error;
        }
    }

    /**
     * Get date range for period
     */
    getDateRange(period, startDate, endDate) {
        const now = new Date();
        let start, end;

        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else {
            switch (period) {
                case 'daily':
                    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
                    break;
                case 'weekly':
                    const dayOfWeek = now.getDay();
                    start = new Date(now);
                    start.setDate(now.getDate() - dayOfWeek); // Start of week (Sunday)
                    start.setHours(0, 0, 0, 0);
                    end = new Date(start);
                    end.setDate(start.getDate() + 6); // End of week (Saturday)
                    end.setHours(23, 59, 59);
                    break;
                case 'monthly':
                default:
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    break;
            }
        }

        return { start, end };
    }

    /**
     * Generate category heatmap showing spending by category over days
     */
    generateCategoryHeatmap(expenses, startDate, endDate) {
        const heatmap = {};

        expenses.forEach(expense => {
            const category = expense.category || 'Uncategorized';
            const date = new Date(expense.date);
            const dayKey = date.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!heatmap[category]) {
                heatmap[category] = {};
            }

            if (!heatmap[category][dayKey]) {
                heatmap[category][dayKey] = 0;
            }

            heatmap[category][dayKey] += Number(expense.amount);
        });

        // Round all values
        Object.keys(heatmap).forEach(category => {
            Object.keys(heatmap[category]).forEach(day => {
                heatmap[category][day] = Math.round(heatmap[category][day]);
            });
        });

        return heatmap;
    }

    /**
     * Generate time-of-day heatmap (24 hours)
     */
    generateTimeOfDayHeatmap(expenses) {
        const heatmap = {};

        // Initialize all hours
        for (let hour = 0; hour < 24; hour++) {
            heatmap[hour] = { amount: 0, count: 0 };
        }

        expenses.forEach(expense => {
            const date = new Date(expense.createdAt || expense.date);
            const hour = date.getHours();

            heatmap[hour].amount += Number(expense.amount);
            heatmap[hour].count += 1;
        });

        // Round amounts
        Object.keys(heatmap).forEach(hour => {
            heatmap[hour].amount = Math.round(heatmap[hour].amount);
        });

        return heatmap;
    }

    /**
     * Generate day-of-week heatmap
     */
    generateDayOfWeekHeatmap(expenses) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const heatmap = {};

        // Initialize all days
        dayNames.forEach(day => {
            heatmap[day] = { amount: 0, count: 0 };
        });

        expenses.forEach(expense => {
            const date = new Date(expense.date);
            const dayName = dayNames[date.getDay()];

            heatmap[dayName].amount += Number(expense.amount);
            heatmap[dayName].count += 1;
        });

        // Round amounts
        Object.keys(heatmap).forEach(day => {
            heatmap[day].amount = Math.round(heatmap[day].amount);
        });

        return heatmap;
    }

    /**
     * Generate merchant heatmap showing top merchants
     */
    generateMerchantHeatmap(expenses) {
        const heatmap = {};

        expenses.forEach(expense => {
            const merchant = expense.merchant || 'Unknown';

            if (!heatmap[merchant]) {
                heatmap[merchant] = { amount: 0, count: 0 };
            }

            heatmap[merchant].amount += Number(expense.amount);
            heatmap[merchant].count += 1;
        });

        // Round amounts and sort by amount
        const sorted = Object.entries(heatmap)
            .map(([merchant, data]) => ({
                merchant,
                amount: Math.round(data.amount),
                count: data.count
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 20); // Top 20 merchants

        // Convert back to object
        const result = {};
        sorted.forEach(item => {
            result[item.merchant] = {
                amount: item.amount,
                count: item.count
            };
        });

        return result;
    }

    /**
     * Identify peak spending times from heatmaps
     */
    identifyPeakSpendingTimes(timeOfDayHeatmap, dayOfWeekHeatmap) {
        const patterns = [];

        // Find peak hours
        const hourAmounts = Object.entries(timeOfDayHeatmap)
            .map(([hour, data]) => ({ hour: parseInt(hour), amount: data.amount }))
            .sort((a, b) => b.amount - a.amount);

        if (hourAmounts[0] && hourAmounts[0].amount > 0) {
            const peakHour = hourAmounts[0].hour;
            let timeLabel;
            
            if (peakHour >= 6 && peakHour < 12) timeLabel = 'Morning';
            else if (peakHour >= 12 && peakHour < 17) timeLabel = 'Afternoon';
            else if (peakHour >= 17 && peakHour < 21) timeLabel = 'Evening';
            else timeLabel = 'Night';

            patterns.push(`${timeLabel} spender (peak: ${peakHour}:00)`);
        }

        // Find peak days
        const dayAmounts = Object.entries(dayOfWeekHeatmap)
            .map(([day, data]) => ({ day, amount: data.amount }))
            .sort((a, b) => b.amount - a.amount);

        if (dayAmounts[0] && dayAmounts[0].amount > 0) {
            patterns.push(`${dayAmounts[0].day} is your highest spending day`);
        }

        // Weekend vs weekday pattern
        const weekendSpending = (dayOfWeekHeatmap['Saturday']?.amount || 0) + 
                               (dayOfWeekHeatmap['Sunday']?.amount || 0);
        const weekdaySpending = Object.entries(dayOfWeekHeatmap)
            .filter(([day]) => day !== 'Saturday' && day !== 'Sunday')
            .reduce((sum, [, data]) => sum + data.amount, 0);

        if (weekendSpending > weekdaySpending * 0.4) { // Weekend = 2/7 days, so threshold is ~28%
            patterns.push('Weekend spender - higher activity on weekends');
        }

        return patterns;
    }

    /**
     * Identify top spending categories
     */
    identifyTopCategories(categoryHeatmap, expenses) {
        const categoryTotals = {};

        expenses.forEach(expense => {
            const category = expense.category || 'Uncategorized';
            if (!categoryTotals[category]) {
                categoryTotals[category] = 0;
            }
            categoryTotals[category] += Number(expense.amount);
        });

        const totalSpending = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

        const topCategories = Object.entries(categoryTotals)
            .map(([category, amount]) => ({
                category,
                amount: Math.round(amount),
                percentage: totalSpending > 0 ? Number(((amount / totalSpending) * 100).toFixed(1)) : 0
            }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5); // Top 5 categories

        return topCategories;
    }

    /**
     * Identify spending patterns and behaviors
     */
    identifySpendingPatterns(expenses, timeOfDayHeatmap, dayOfWeekHeatmap) {
        const patterns = [];

        // Calculate average transaction amount
        const totalAmount = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
        const avgTransaction = totalAmount / expenses.length;

        // Large transaction pattern
        const largeTransactions = expenses.filter(e => Number(e.amount) > avgTransaction * 2);
        if (largeTransactions.length > expenses.length * 0.2) {
            patterns.push('Tendency for larger purchases');
        }

        // Small frequent transactions
        const smallTransactions = expenses.filter(e => Number(e.amount) < avgTransaction * 0.5);
        if (smallTransactions.length > expenses.length * 0.4) {
            patterns.push('Frequent small purchases');
        }

        // Online vs physical (based on merchant patterns)
        const onlineKeywords = ['amazon', 'ebay', 'online', 'digital', 'subscription', 'netflix', 'spotify'];
        const onlineTransactions = expenses.filter(e => {
            const merchant = (e.merchant || '').toLowerCase();
            return onlineKeywords.some(keyword => merchant.includes(keyword));
        });

        if (onlineTransactions.length > expenses.length * 0.3) {
            patterns.push('Heavy online/digital spending');
        }

        // Consistency pattern
        const daysWithSpending = new Set(expenses.map(e => new Date(e.date).toISOString().split('T')[0])).size;
        const dateRange = (new Date(expenses[expenses.length - 1].date) - new Date(expenses[0].date)) / (1000 * 60 * 60 * 24);
        
        if (daysWithSpending / dateRange > 0.7) {
            patterns.push('Daily spender - consistent activity');
        } else if (daysWithSpending / dateRange < 0.3) {
            patterns.push('Batch spender - concentrated purchases');
        }

        return patterns;
    }

    /**
     * Get heatmap for user
     */
    async getHeatmap(userId, tenantId, period = 'monthly') {
        const [heatmap] = await db.select()
            .from(spendingHeatmaps)
            .where(and(
                eq(spendingHeatmaps.userId, userId),
                eq(spendingHeatmaps.tenantId, tenantId),
                eq(spendingHeatmaps.period, period)
            ))
            .orderBy(desc(spendingHeatmaps.startDate))
            .limit(1);

        return heatmap;
    }

    /**
     * Get historical heatmaps
     */
    async getHeatmapHistory(userId, tenantId, period = 'monthly', limit = 6) {
        const heatmaps = await db.select()
            .from(spendingHeatmaps)
            .where(and(
                eq(spendingHeatmaps.userId, userId),
                eq(spendingHeatmaps.tenantId, tenantId),
                eq(spendingHeatmaps.period, period)
            ))
            .orderBy(desc(spendingHeatmaps.startDate))
            .limit(limit);

        return heatmaps;
    }
}

export default new SpendingHeatmapService();
