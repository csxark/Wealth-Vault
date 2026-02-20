import { eq, and, lte, isNotNull, gte, desc, asc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories, vaultMembers } from '../db/schema.js';

class ExpenseRepository {
    async findById(id) {
        const [expense] = await db
            .select()
            .from(expenses)
            .where(eq(expenses.id, id));
        return expense;
    }

    async findByIdWithCategory(id) {
        return await db.query.expenses.findFirst({
            where: eq(expenses.id, id),
            with: {
                category: {
                    columns: { name: true, color: true, icon: true },
                },
            },
        });
    }

    async findAll(conditions, pagination = { limit: 20, offset: 0 }, sorting = { field: 'date', order: 'desc' }) {
        const sortFn = sorting.order === 'desc' ? desc : asc;
        let orderByColumn = expenses.date;
        if (sorting.field === 'amount') orderByColumn = expenses.amount;
        if (sorting.field === 'createdAt') orderByColumn = expenses.createdAt;

        return await db.query.expenses.findMany({
            where: and(...conditions),
            orderBy: [sortFn(orderByColumn)],
            limit: pagination.limit,
            offset: pagination.offset,
            with: {
                category: {
                    columns: { name: true, color: true, icon: true },
                },
            },
        });
    }

    async count(conditions) {
        const [result] = await db
            .select({ count: sql`count(*)` })
            .from(expenses)
            .where(and(...conditions));
        return Number(result?.count || 0);
    }

    async create(data) {
        const [newExpense] = await db
            .insert(expenses)
            .values(data)
            .returning();
        return newExpense;
    }

    async update(id, data) {
        const [updatedExpense] = await db
            .update(expenses)
            .set(data)
            .where(eq(expenses.id, id))
            .returning();
        return updatedExpense;
    }

    async delete(id) {
        const [deletedExpense] = await db
            .delete(expenses)
            .where(eq(expenses.id, id))
            .returning();
        return deletedExpense;
    }

    async bulkCreate(data) {
        return await db
            .insert(expenses)
            .values(data)
            .returning();
    }

    async getDueRecurringTransactions(now = new Date()) {
        return await db
            .select()
            .from(expenses)
            .where(
                and(
                    eq(expenses.isRecurring, true),
                    isNotNull(expenses.nextExecutionDate),
                    lte(expenses.nextExecutionDate, now)
                )
            );
    }

    async getSummaryStats(userId, startDate, endDate) {
        const conditions = [
            eq(expenses.userId, userId),
            eq(expenses.status, 'completed'),
            gte(expenses.date, startDate),
            lte(expenses.date, endDate),
        ];

        const totalPromise = db
            .select({
                total: sql`sum(${expenses.amount})`,
                count: sql`count(*)`,
            })
            .from(expenses)
            .where(and(...conditions));

        const byCategoryPromise = db
            .select({
                categoryId: expenses.categoryId,
                categoryName: categories.name,
                categoryColor: categories.color,
                total: sql`sum(${expenses.amount})`,
                count: sql`count(*)`,
            })
            .from(expenses)
            .leftJoin(categories, eq(expenses.categoryId, categories.id))
            .where(and(...conditions))
            .groupBy(expenses.categoryId, categories.name, categories.color)
            .orderBy(desc(sql`sum(${expenses.amount})`));

        const [totalResult, byCategory] = await Promise.all([totalPromise, byCategoryPromise]);

        return {
            total: Number(totalResult[0]?.total || 0),
            count: Number(totalResult[0]?.count || 0),
            byCategory: byCategory.map(item => ({
                categoryName: item.categoryName,
                categoryColor: item.categoryColor,
                total: Number(item.total),
                count: Number(item.count),
            })),
        };
    }

    async getCategoryUsageStats(categoryId) {
        const [result] = await db
            .select({
                count: sql`count(*)`,
                total: sql`sum(${expenses.amount})`,
            })
            .from(expenses)
            .where(eq(expenses.categoryId, categoryId));

        return {
            count: Number(result.count),
            total: Number(result.total) || 0
        };
    }
}

export default new ExpenseRepository();
