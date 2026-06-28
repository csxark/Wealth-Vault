import { eq, and, desc, asc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { investments, investmentTransactions, portfolios, priceHistory } from '../db/schema.js';

class InvestmentRepository {
    // Investment Operations
    async findById(id, userId) {
        const [investment] = await db
            .select()
            .from(investments)
            .where(and(eq(investments.id, id), eq(investments.userId, userId)));
        return investment;
    }

    async findAll(userId, filters = {}) {
        let query = db
            .select()
            .from(investments)
            .where(eq(investments.userId, userId));

        if (filters.portfolioId) {
            query = query.where(eq(investments.portfolioId, filters.portfolioId));
        }
        if (filters.type) {
            query = query.where(eq(investments.type, filters.type));
        }
        if (filters.isActive !== undefined) {
            query = query.where(eq(investments.isActive, filters.isActive));
        }

        return await query.orderBy(desc(investments.createdAt));
    }

    async create(data) {
        const [investment] = await db
            .insert(investments)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();
        return investment;
    }

    async update(id, userId, data) {
        const [investment] = await db
            .update(investments)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(and(eq(investments.id, id), eq(investments.userId, userId)))
            .returning();
        return investment;
    }

    async delete(id, userId) {
        const result = await db
            .delete(investments)
            .where(and(eq(investments.id, id), eq(investments.userId, userId)));
        return result.rowCount > 0;
    }

    // Transaction Operations
    async createTransaction(data) {
        const [transaction] = await db
            .insert(investmentTransactions)
            .values({
                ...data,
                createdAt: new Date(),
            })
            .returning();
        return transaction;
    }

    async findTransactions(investmentId, userId) {
        return await db
            .select()
            .from(investmentTransactions)
            .where(
                and(
                    eq(investmentTransactions.investmentId, investmentId),
                    eq(investmentTransactions.userId, userId)
                )
            )
            .orderBy(desc(investmentTransactions.date));
    }

    async findTransactionsByInvestmentId(investmentId, userId) {
        return await db
            .select()
            .from(investmentTransactions)
            .where(
                and(
                    eq(investmentTransactions.investmentId, investmentId),
                    eq(investmentTransactions.userId, userId)
                )
            )
            .orderBy(asc(investmentTransactions.date));
    }
}

export default new InvestmentRepository();
