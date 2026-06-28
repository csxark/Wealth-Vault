import { db } from '../config/db.js';
import { children, allowances, childSpendingLimits, childTransactions, childTasks, childSavingsGoals } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class FamilyService {
    // Children Management
    async createChild(userId, childData) {
        try {
            const child = await db.insert(children).values({
                userId,
                ...childData,
