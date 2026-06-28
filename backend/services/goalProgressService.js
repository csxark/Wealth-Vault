import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { goalContributionLineItems, goals } from '../db/schema.js';

const MONEY_INPUT_REGEX = /^-?\d+(\.\d{1,2})?$/;

class GoalProgressService {
    parseAmountToCents(value) {
        const normalized = String(value ?? '').trim();

        if (!MONEY_INPUT_REGEX.test(normalized)) {
            throw new Error('Invalid money value: use up to 2 decimal places');
        }

        const negative = normalized.startsWith('-');
        const unsigned = negative ? normalized.slice(1) : normalized;
        const [dollarsPart, centsPart = ''] = unsigned.split('.');

        const dollars = BigInt(dollarsPart || '0');
        const cents = BigInt((centsPart + '00').slice(0, 2));
        const result = (dollars * 100n) + cents;

        return negative ? -result : result;
    }

    centsToAmountString(centsInput) {
        const cents = typeof centsInput === 'bigint' ? centsInput : BigInt(centsInput ?? 0);
        const negative = cents < 0n;
        const absolute = negative ? -cents : cents;

        const dollars = absolute / 100n;
        const centsRemainder = absolute % 100n;

        return `${negative ? '-' : ''}${dollars.toString()}.${centsRemainder.toString().padStart(2, '0')}`;
    }

    centsToProgressPercent(centsCurrent, centsTarget) {
        if (centsTarget <= 0n) {
            return 0;
        }

        const basisPoints = (centsCurrent * 10000n) / centsTarget;
        return Number(basisPoints) / 100;
    }

    async getContributionTotalsByGoalIds(goalIds) {
        if (!goalIds?.length) {
            return new Map();
        }

        const rows = await db
            .select({
                goalId: goalContributionLineItems.goalId,
                totalCents: sql`COALESCE(SUM(${goalContributionLineItems.amountCents}), 0)`,
                totalContributions: sql`count(*)`
            })
            .from(goalContributionLineItems)
            .where(inArray(goalContributionLineItems.goalId, goalIds))
            .groupBy(goalContributionLineItems.goalId);

        const totalsMap = new Map();

        for (const row of rows) {
            totalsMap.set(row.goalId, {
                totalCents: BigInt(row.totalCents ?? 0),
                totalContributions: Number(row.totalContributions ?? 0)
            });
        }

        return totalsMap;
    }

    buildGoalSnapshot(goal, totals = { totalCents: 0n, totalContributions: 0 }) {
        const targetCents = this.parseAmountToCents(goal.targetAmount ?? '0');
        const currentCents = totals.totalCents ?? 0n;

        return {
            currentAmount: this.centsToAmountString(currentCents),
            progressPercentage: this.centsToProgressPercent(currentCents, targetCents),
            totalContributions: totals.totalContributions ?? 0,
            isCompletedByAmount: targetCents > 0n && currentCents >= targetCents
        };
    }

    async reconcileGoal(goalRecord, tx = db) {
        const [row] = await tx
            .select({
                totalCents: sql`COALESCE(SUM(${goalContributionLineItems.amountCents}), 0)`,
                totalContributions: sql`count(*)`
            })
            .from(goalContributionLineItems)
            .where(eq(goalContributionLineItems.goalId, goalRecord.id));

        const totals = {
            totalCents: BigInt(row?.totalCents ?? 0),
            totalContributions: Number(row?.totalContributions ?? 0)
        };

        const snapshot = this.buildGoalSnapshot(goalRecord, totals);
        const storedAmount = this.parseAmountToCents(goalRecord.currentAmount ?? '0');
        const driftCents = totals.totalCents - storedAmount;

        if (driftCents !== 0n) {
            const nextMetadata = {
                ...(goalRecord.metadata || {}),
                totalContributions: totals.totalContributions,
                averageContribution: totals.totalContributions > 0
                    ? this.centsToAmountString(totals.totalCents / BigInt(totals.totalContributions))
                    : '0.00',
                lastReconciledAt: new Date().toISOString(),
                driftDetectedCents: driftCents.toString()
            };

            await tx
                .update(goals)
                .set({
                    currentAmount: snapshot.currentAmount,
                    metadata: nextMetadata,
                    updatedAt: new Date()
                })
                .where(eq(goals.id, goalRecord.id));
        }

        return {
            goalId: goalRecord.id,
            driftCents: driftCents.toString(),
            reconciled: driftCents !== 0n,
            ...snapshot
        };
    }
}

export default new GoalProgressService();
