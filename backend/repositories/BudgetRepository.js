import { eq, and, gte, lte, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { categories, budgetAlerts, expenses, familySettings, vaultMembers } from '../db/schema.js';

class BudgetRepository {
    async findCategoryWithBudget(categoryId, userId) {
        const [category] = await db.query.categories.findMany({
            where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
            columns: { id: true, name: true, budget: true, spendingLimit: true, color: true, icon: true }
        });
        return category;
    }

    async findCategoriesWithBudgets(userId, categoryId = null) {
        let conditions = [eq(categories.userId, userId), eq(categories.isActive, true)];
        if (categoryId) {
            conditions.push(eq(categories.id, categoryId));
        }

        return await db.query.categories.findMany({
            where: and(...conditions),
            columns: { id: true, name: true, budget: true, spendingLimit: true, color: true, icon: true }
        });
    }

    async findAlert(userId, categoryId, type, period) {
        return await db.query.budgetAlerts.findFirst({
            where: and(
                eq(budgetAlerts.userId, userId),
                eq(budgetAlerts.categoryId, categoryId),
                eq(budgetAlerts.alertType, type),
                sql`DATE(${budgetAlerts.createdAt}) = CURRENT_DATE`,
                sql`${budgetAlerts.metadata}::jsonb ->> 'period' = ${period}`
            )
        });
    }

    async createAlert(data) {
        const [alert] = await db
            .insert(budgetAlerts)
            .values({
                ...data,
                createdAt: new Date(),
            })
            .returning();
        return alert;
    }

    async getCategorySpending(userId, categoryId, startDate, endDate) {
        const [result] = await db
            .select({ total: sql`sum(${expenses.amount})` })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    eq(expenses.categoryId, categoryId),
                    eq(expenses.status, 'completed'),
                    gte(expenses.date, startDate),
                    lte(expenses.date, endDate)
                )
            );
        return Number(result?.total || 0);
    }

    async updateCategoryMetadata(categoryId, metadata) {
        return await db
            .update(categories)
            .set({
                metadata,
                updatedAt: new Date()
            })
            .where(eq(categories.id, categoryId));
    }

    async findCategoryById(categoryId, userId) {
        const [category] = await db
            .select()
            .from(categories)
            .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)));
        return category;
    }

    async findVaultSettings(vaultId) {
        const [settings] = await db
            .select()
            .from(familySettings)
            .where(eq(familySettings.vaultId, vaultId));
        return settings;
    }

    async getVaultSpendingByCategory(vaultId, startDate, endDate) {
        return await db
            .select({
                categoryId: expenses.categoryId,
                categoryName: categories.name,
                categoryColor: categories.color,
                amount: sql`sum(${expenses.amount})`,
                count: sql`count(*)`,
            })
            .from(expenses)
            .leftJoin(categories, eq(expenses.categoryId, categories.id))
            .where(
                and(
                    eq(expenses.vaultId, vaultId),
                    eq(expenses.status, 'completed'),
                    gte(expenses.date, startDate),
                    lte(expenses.date, endDate)
                )
            )
            .groupBy(expenses.categoryId, categories.name, categories.color);
    }

    async getVaultMemberCount(vaultId) {
        const [result] = await db
            .select({ count: sql`count(*)` })
            .from(vaultMembers)
            .where(eq(vaultMembers.vaultId, vaultId));
        return Number(result?.count || 1);
    }

    async updateVaultSettings(vaultId, data) {
        const [updated] = await db
            .update(familySettings)
            .set({
                ...data,
                updatedAt: new Date()
            })
            .where(eq(familySettings.vaultId, vaultId))
            .returning();
        return updated;
    }

    async getVaultTotalSpending(vaultId, startDate, endDate) {
        const [result] = await db
            .select({ total: sql`sum(${expenses.amount})` })
            .from(expenses)
            .where(
                and(
                    eq(expenses.vaultId, vaultId),
                    eq(expenses.status, 'completed'),
                    gte(expenses.date, startDate),
                    lte(expenses.date, endDate)
                )
            );
        return Number(result?.total || 0);
    }
}

export default new BudgetRepository();
