import { eq, and, gte, lte, sql } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, budgetAlerts, users } from "../db/schema.js";
import notificationService from "./notificationService.js";

class BudgetEngine {
    /**
     * Monitor budget for a specific category and user
     * @param {string} userId - ID of the user
     * @param {string} categoryId - ID of the category
     */
    async monitorBudget(userId, categoryId) {
        try {
            // 1. Get Category Budget
            const [category] = await db
                .select()
                .from(categories)
                .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));

            if (!category || !category.budget || !category.budget.monthly || category.budget.monthly <= 0) {
                return;
            }

            const monthlyLimit = parseFloat(category.budget.monthly);

            // 2. Get Total Spending for current month
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            const [spendingResult] = await db
                .select({
                    total: sql`sum(${expenses.amount})`,
                })
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        eq(expenses.categoryId, categoryId),
                        eq(expenses.status, "completed"),
                        gte(expenses.date, startOfMonth),
                        lte(expenses.date, endOfMonth)
                    )
                );

            const currentSpending = parseFloat(spendingResult?.total || 0);
            const usagePercentage = (currentSpending / monthlyLimit) * 100;

            // 3. Define Thresholds to check
            const thresholds = [100, 80, 50]; // Check from highest to avoid multiple alerts if one transaction jumps multiple

            for (const threshold of thresholds) {
                if (usagePercentage >= threshold) {
                    // Check if alert already sent for this threshold and period
                    const [existingAlert] = await db
                        .select()
                        .from(budgetAlerts)
                        .where(
                            and(
                                eq(budgetAlerts.userId, userId),
                                eq(budgetAlerts.categoryId, categoryId),
                                eq(budgetAlerts.period, period),
                                eq(budgetAlerts.threshold, threshold)
                            )
                        );

                    if (!existingAlert) {
                        // Trigger Alert
                        await this.triggerAlert(userId, category, threshold, currentSpending, monthlyLimit, period);
                        break; // Only trigger the highest threshold crossed
                    }
                }
            }
        } catch (error) {
            console.error("Budget monitoring error:", error);
        }
    }

    async triggerAlert(userId, category, threshold, currentSpending, limit, period) {
        // Record alert to prevent spamming
        await db.insert(budgetAlerts).values({
            userId,
            categoryId: category.id,
            threshold,
            period,
            metadata: {
                currentSpending,
                limit,
                percentage: (currentSpending / limit) * 100,
            }
        });

        // Send Notification
        const message = threshold >= 100
            ? `🚨 Budget Alert: You have exceeded your ${category.name} budget!`
            : `⚠️ Budget Warning: You have reached ${threshold}% of your ${category.name} budget.`;

        await notificationService.sendNotification(userId, {
            title: "Budget Alert",
            message,
            type: threshold >= 100 ? "error" : "warning",
            data: { categoryId: category.id, threshold, period }
        });
    }
}

export default new BudgetEngine();
