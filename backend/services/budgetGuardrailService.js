/**
 * Multi-Goal Budget Guardrail Optimizer Service - Issue #714
 * 
 * Enforces minimum essential expense coverage before goal allocations
 * to prevent over-allocation to goals and starvation of essential spending.
 * 
 * @module services/budgetGuardrailService
 */

import { and, eq, gte, lte, desc, sql, inArray, or } from 'drizzle-orm';
import db from '../config/db.js';
import {
    budgetGuardrailPolicies,
    safeAllocationCalculations,
    guardrailAllocations,
    guardrailViolations,
    guardrailComplianceSnapshots,
    expenses,
    goals,
    budgetAlerts,
    categories,
    users,
} from '../db/schema.js';

class BudgetGuardrailService {
    /**
     * Create or get default guardrail policy for a user
     */
    async getOrCreatePolicy(userId, vaultId = null, minimumLivingCost = 2000) {
        // Try to find existing policy
        let [policy] = await db
            .select()
            .from(budgetGuardrailPolicies)
            .where(
                and(
                    eq(budgetGuardrailPolicies.userId, userId),
                    vaultId
                        ? eq(budgetGuardrailPolicies.vaultId, vaultId)
                        : sql`${budgetGuardrailPolicies.vaultId} IS NULL`,
                    eq(budgetGuardrailPolicies.isActive, true)
                )
            )
            .limit(1);

        if (!policy) {
            // Create default policy
            [policy] = await db
                .insert(budgetGuardrailPolicies)
                .values({
                    userId,
                    vaultId,
                    policyName: vaultId ? 'Vault Default Policy' : 'User Default Policy',
                    minimumMonthlyLivingCost: minimumLivingCost.toFixed(2),
                    safetyBufferPercentage: 15.00,
                    maxGoalAllocationPercentage: 50.00,
                    livingCostCalculationMethod: 'manual',
                    historicalLookbackMonths: 6,
                    percentileThreshold: 0.75,
                    includeEmergencyFundContribution: true,
                    emergencyFundTargetMonths: 3,
                    isActive: true,
                    enforceStrictly: true,
                })
                .returning();
        }

        return policy;
    }

    /**
     * Update guardrail policy
     */
    async updatePolicy(policyId, updates) {
        const [updated] = await db
            .update(budgetGuardrailPolicies)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(eq(budgetGuardrailPolicies.id, policyId))
            .returning();

        return updated;
    }

    /**
     * Get all active policies for user
     */
    async getUserPolicies(userId, includeInactive = false) {
        const policies = await db
            .select()
            .from(budgetGuardrailPolicies)
            .where(
                and(
                    eq(budgetGuardrailPolicies.userId, userId),
                    includeInactive ? sql`1=1` : eq(budgetGuardrailPolicies.isActive, true)
                )
            )
            .orderBy(desc(budgetGuardrailPolicies.createdAt));

        return policies;
    }

    /**
     * Calculate safe-to-allocate amount for next period
     */
    async calculateSafeAllocation(userId, policyId, vaultId = null, projectedIncome = null) {
        // Get policy
        const [policy] = await db
            .select()
            .from(budgetGuardrailPolicies)
            .where(eq(budgetGuardrailPolicies.id, policyId))
            .limit(1);

        if (!policy) {
            throw new Error('Policy not found');
        }

        // Calculate projected income from historical data or use provided
        let income;
        if (!projectedIncome) {
            income = await this.calculateProjectedIncome(userId, vaultId, policy.historicalLookbackMonths);
        } else {
            income = parseFloat(projectedIncome);
        }

        // Get essential expenses
        const essentialExpenses = await this.calculateEssentialExpenses(
            userId,
            policy.minimumMonthlyLivingCost,
            policy.livingCostCalculationMethod,
            policy.protectedCategoryIds,
            policy.historicalLookbackMonths,
            policy.percentileThreshold
        );

        // Calculate safety buffer
        const safetyBufferAmount = income * (parseFloat(policy.safetyBufferPercentage) / 100);

        // Calculate emergency fund contribution
        let emergencyFundContribution = 0;
        if (policy.includeEmergencyFundContribution) {
            emergencyFundContribution = (essentialExpenses * policy.emergencyFundTargetMonths) / 12;
        }

        // Calculate discretionary minimum (non-goal spending)
        const discretionarySpend = Math.max(
            (income * 0.1),
            essentialExpenses * 0.05
        );

        // Safe to allocate = Income - (essentials + buffer + emergency + discretionary)
        const protected = essentialExpenses + safetyBufferAmount + emergencyFundContribution + discretionarySpend;
        const safeToAllocateAmount = Math.max(0, income - protected);

        // Calculate coverage status
        const coveragePercentage = (essentialExpenses / income) * 100;
        let coverageStatus = 'protected';
        if (coveragePercentage > 80) {
            coverageStatus = 'marginal';
        } else if (coveragePercentage > 90) {
            coverageStatus = 'risky';
        } else if (income < essentialExpenses + safetyBufferAmount) {
            coverageStatus = 'insufficient';
        }

        // Get active goals and calculate per-goal limits
        const userGoals = await db
            .select()
            .from(goals)
            .where(
                and(
                    eq(goals.userId, userId),
                    inArray(goals.status, ['active', 'planning', 'on_track', 'off_track']),
                    vaultId ? eq(goals.vaultId, vaultId) : sql`1=1`
                )
            );

        const maxGoalAllocationPercentage = parseFloat(policy.maxGoalAllocationPercentage);
        const goalAllocationLimits = {};

        for (const goal of userGoals) {
            const targetAmount = parseFloat(goal.targetAmount);
            const monthsRemaining = this.calculateMonthsRemaining(goal.targetDate);
            const requiredMonthly = targetAmount / Math.max(1, monthsRemaining);

            // Cap at max allocation and safe amount
            let maxLimit = Math.min(
                safeToAllocateAmount * (maxGoalAllocationPercentage / 100),
                safeToAllocateAmount
            );

            // Reduce if priority goals exist and this isn't one
            if (policy.priorityGoalIds && policy.priorityGoalIds.length > 0) {
                const isPriorityGoal = policy.priorityGoalIds.includes(goal.id);
                if (!isPriorityGoal) {
                    maxLimit *= 0.5; // Non-priority goals get 50% reduction
                }
            }

            goalAllocationLimits[goal.id] = Math.min(maxLimit, requiredMonthly);
        }

        // Calculate confidence score
        const confidenceScore = this.calculateConfidenceScore(income, essentialExpenses, userGoals.length);
        const confidenceLevel = this.getConfidenceLevel(confidenceScore);

        // Period dates
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Create recommendations based on coverage status
        const recommendations = this.generateRecommendations(
            coverageStatus,
            essentialExpenses,
            income,
            safeToAllocateAmount,
            policy
        );

        // Store calculation
        const [calculation] = await db
            .insert(safeAllocationCalculations)
            .values({
                userId,
                vaultId,
                policyId,
                calculationDate: new Date(),
                periodStart,
                periodEnd,
                periodType: 'monthly',
                projectedIncome: income.toFixed(2),
                projectedEssentialExpenses: essentialExpenses.toFixed(2),
                essentialExpenseBreakdown: {},
                safetyBufferAmount: safetyBufferAmount.toFixed(2),
                emergencyFundContribution: emergencyFundContribution.toFixed(2),
                discretionaryMinimum: discretionarySpend.toFixed(2),
                safeToAllocateAmount: safeToAllocateAmount.toFixed(2),
                safeToAllocatePercentage: ((safeToAllocateAmount / income) * 100).toFixed(2),
                goalAllocationLimits,
                confidenceLevel,
                confidenceScore: confidenceScore.toFixed(2),
                coverageStatus,
                recommendations,
                dataQuality: {
                    hasHistoricalData: true,
                    source: projectedIncome ? 'manual' : 'calculated',
                },
            })
            .returning();

        return calculation;
    }

    /**
     * Calculate projected income for user
     */
    async calculateProjectedIncome(userId, vaultId = null, lookbackMonths = 6) {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookbackMonths);

        const expenses = await db
            .select({
                amount: expenses.amount,
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, startDate),
                    vaultId ? eq(expenses.vaultId, vaultId) : sql`1=1`,
                    // Income is typically negative amounts in the system
                    sql`${expenses.amount} < 0`
                )
            );

        if (expenses.length === 0) {
            return 3000; // Default estimate
        }

        const totalIncome = expenses.reduce((sum, e) => sum + Math.abs(parseFloat(e.amount)), 0);
        const monthlyAverage = totalIncome / lookbackMonths;

        return monthlyAverage;
    }

    /**
     * Calculate essential expenses for the user
     */
    async calculateEssentialExpenses(
        userId,
        minimumLiving,
        method = 'manual',
        protectedCategories = [],
        lookbackMonths = 6,
        percentile = 0.75
    ) {
        if (method === 'manual') {
            return parseFloat(minimumLiving);
        }

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - lookbackMonths);

        let query = db
            .select({
                amount: expenses.amount,
                categoryId: expenses.categoryId,
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, startDate),
                    sql`${expenses.amount} > 0` // Actual expenses
                )
            );

        if (protectedCategories.length > 0) {
            query = query.where(inArray(expenses.categoryId, protectedCategories));
        }

        const expenseData = await query;

        if (expenseData.length === 0) {
            return parseFloat(minimumLiving);
        }

        const amounts = expenseData
            .map(e => parseFloat(e.amount))
            .sort((a, b) => a - b);

        // Calculate percentile (e.g., 75th percentile for conservative estimate)
        const index = Math.ceil(amounts.length * percentile) - 1;
        const percentileAmount = amounts[Math.max(0, index)];

        return Math.max(parseFloat(minimumLiving), percentileAmount);
    }

    /**
     * Calculate months remaining until goal target date
     */
    calculateMonthsRemaining(targetDate) {
        const now = new Date();
        const target = new Date(targetDate);
        const diffTime = target.getTime() - now.getTime();
        const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44);
        return Math.max(0.5, diffMonths);
    }

    /**
     * Calculate confidence score
     */
    calculateConfidenceScore(income, essentialExpenses, goalCount) {
        let score = 50;

        // Income adequacy (max +30)
        const adequacyRatio = income / essentialExpenses;
        if (adequacyRatio >= 3) {
            score += 30;
        } else if (adequacyRatio >= 2) {
            score += 20;
        } else if (adequacyRatio >= 1.5) {
            score += 10;
        }

        // Goal count (max +20)
        if (goalCount <= 3) {
            score += 20;
        } else if (goalCount <= 5) {
            score += 10;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * Get confidence level from score
     */
    getConfidenceLevel(score) {
        if (score >= 80) return 'very_high';
        if (score >= 65) return 'high';
        if (score >= 45) return 'moderate';
        if (score >= 25) return 'low';
        return 'very_low';
    }

    /**
     * Generate recommendations based on coverage status
     */
    generateRecommendations(coverageStatus, essentials, income, safeAlloc, policy) {
        const recommendations = [];

        if (coverageStatus === 'insufficient') {
            recommendations.push({
                level: 'critical',
                message: 'Income is insufficient to cover essential living expenses. Consider reducing goal allocations or increasing income.',
                action: 'reduce_goal_allocations',
            });
        } else if (coverageStatus === 'risky') {
            recommendations.push({
                level: 'warning',
                message: 'Limited safe allocation space. Essential expenses consume >90% of income.',
                action: 'increase_income_or_reduce_expenses',
            });
        } else if (coverageStatus === 'marginal') {
            recommendations.push({
                level: 'info',
                message: 'Moderate allocation capacity. Monitor expense growth closely.',
                action: 'monitor_expenses',
            });
        }

        if (safeAlloc > 0 && safeAlloc < income * 0.1) {
            recommendations.push({
                level: 'info',
                message: 'Safe allocation is below 10% of income. Consider building emergency fund first.',
                action: 'build_emergency_fund',
            });
        }

        return recommendations;
    }

    /**
     * Allocate amounts to goals with guardrail enforcement
     */
    async allocateGoalWithGuardrail(userId, goalId, requestedAmount, calculationId, policyId, vaultId = null) {
        // Get calculation
        const [calculation] = await db
            .select()
            .from(safeAllocationCalculations)
            .where(eq(safeAllocationCalculations.id, calculationId))
            .limit(1);

        if (!calculation) {
            throw new Error('Calculation not found');
        }

        const goalAllocationLimits = calculation.goalAllocationLimits;
        const maxLimit = goalAllocationLimits[goalId] || 0;
        const requested = parseFloat(requestedAmount);

        // Determine approved amount and any reduction
        let approvedAmount = Math.min(requested, maxLimit);
        let guardrailReduced = null;
        let reductionReason = null;

        if (approvedAmount < requested) {
            guardrailReduced = requested - approvedAmount;
            reductionReason = `Guardrail limit: ${maxLimit.toFixed(2)}`;
        }

        // Create allocation record
        const now = new Date();
        const periodStart = new Date(calculation.periodStart);
        const periodEnd = new Date(calculation.periodEnd);

        const [allocation] = await db
            .insert(guardrailAllocations)
            .values({
                userId,
                vaultId,
                policyId,
                calculationId,
                goalId,
                requestedAmount: requested.toFixed(2),
                approvedAmount: approvedAmount.toFixed(2),
                guardrailReducedAmount: guardrailReduced ? guardrailReduced.toFixed(2) : null,
                reductionReason,
                allocationDate: now,
                periodStart,
                periodEnd,
                status: approvedAmount > 0 ? 'pending' : 'rejected',
                approvalStatus: 'automatic',
            })
            .returning();

        // Check for violations
        if (approvedAmount < requested) {
            await this.recordViolation(
                userId,
                vaultId,
                policyId,
                allocation.id,
                'max_goal_allocation_exceeded',
                maxLimit,
                requested,
                'warning'
            );
        }

        return allocation;
    }

    /**
     * Record a guardrail violation
     */
    async recordViolation(userId, vaultId, policyId, allocationId, violationType, threshold, actualValue, severity) {
        const shortfall = Math.max(0, actualValue - threshold);

        const [violation] = await db
            .insert(guardrailViolations)
            .values({
                userId,
                vaultId,
                policyId,
                allocationId,
                violationType,
                severity,
                thresholdValue: threshold.toFixed(2),
                actualValue: actualValue.toFixed(2),
                shortfallAmount: shortfall.toFixed(2),
                shortfallPercentage: threshold > 0 ? ((shortfall / threshold) * 100).toFixed(2) : null,
                detectedAt: new Date(),
                violationDate: new Date(),
                recommendedAction: `Reduce allocation or adjust guardrail policy`,
            })
            .returning();

        return violation;
    }

    /**
     * Approve allocation
     */
    async approveAllocation(allocationId, userId) {
        const [updated] = await db
            .update(guardrailAllocations)
            .set({
                status: 'approved',
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(guardrailAllocations.id, allocationId),
                    eq(guardrailAllocations.userId, userId)
                )
            )
            .returning();

        return updated;
    }

    /**
     * Override allocation (requires approval if configured)
     */
    async overrideAllocation(allocationId, userId, overriddenAmount, reason, approverUserId = null) {
        const [updated] = await db
            .update(guardrailAllocations)
            .set({
                status: 'overridden',
                approvalStatus: approverUserId ? 'manual_approved' : 'automatic',
                overridden: true,
                overrideApprovedBy: approverUserId,
                overrideApprovedAt: approverUserId ? new Date() : null,
                overrideReason: reason,
                approvedAmount: overriddenAmount.toFixed(2),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(guardrailAllocations.id, allocationId),
                    eq(guardrailAllocations.userId, userId)
                )
            )
            .returning();

        return updated;
    }

    /**
     * Get latest safe allocation for user
     */
    async getLatestSafeAllocation(userId, vaultId = null) {
        const [allocation] = await db
            .select()
            .from(safeAllocationCalculations)
            .where(
                and(
                    eq(safeAllocationCalculations.userId, userId),
                    vaultId ? eq(safeAllocationCalculations.vaultId, vaultId) : sql`1=1`
                )
            )
            .orderBy(desc(safeAllocationCalculations.calculationDate))
            .limit(1);

        return allocation;
    }

    /**
     * Get pending allocations for approval
     */
    async getPendingAllocations(userId) {
        const pending = await db
            .select()
            .from(guardrailAllocations)
            .where(
                and(
                    eq(guardrailAllocations.userId, userId),
                    inArray(guardrailAllocations.status, ['pending', 'partially_approved'])
                )
            )
            .orderBy(desc(guardrailAllocations.allocationDate));

        return pending;
    }

    /**
     * Get unresolved violations
     */
    async getUnresolvedViolations(userId) {
        const violations = await db
            .select()
            .from(guardrailViolations)
            .where(
                and(
                    eq(guardrailViolations.userId, userId),
                    eq(guardrailViolations.resolved, false)
                )
            )
            .orderBy(desc(guardrailViolations.detectedAt));

        return violations;
    }

    /**
     * Calculate compliance snapshot for a period
     */
    async calculateComplianceSnapshot(userId, vaultId, policyId, periodStart, periodEnd) {
        // Get allocations for period
        const allocations = await db
            .select()
            .from(guardrailAllocations)
            .where(
                and(
                    eq(guardrailAllocations.userId, userId),
                    gte(guardrailAllocations.allocationDate, periodStart),
                    lte(guardrailAllocations.allocationDate, periodEnd),
                    vaultId ? eq(guardrailAllocations.vaultId, vaultId) : sql`1=1`
                )
            );

        // Get violations for period
        const violations = await db
            .select()
            .from(guardrailViolations)
            .where(
                and(
                    eq(guardrailViolations.userId, userId),
                    gte(guardrailViolations.detectedAt, periodStart),
                    lte(guardrailViolations.detectedAt, periodEnd),
                    vaultId ? eq(guardrailViolations.vaultId, vaultId) : sql`1=1`
                )
            );

        const criticalCount = violations.filter(v => v.severity === 'critical').length;
        const isCompliant = violations.length === 0;

        // Calculate actual spending
        const expenseData = await db
            .select({
                amount: expenses.amount,
            })
            .from(expenses)
            .where(
                and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, periodStart),
                    lte(expenses.date, periodEnd),
                    vaultId ? eq(expenses.vaultId, vaultId) : sql`1=1`,
                    sql`${expenses.amount} > 0`
                )
            );

        const actualExpenses = expenseData.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const actualGoalAllocations = allocations.reduce((sum, a) => sum + parseFloat(a.approvedAmount), 0);

        // Health score
        const healthScore = Math.max(
            0,
            100 - (criticalCount * 20) - (violations.length * 5)
        );

        // Create snapshot
        const [snapshot] = await db
            .insert(guardrailComplianceSnapshots)
            .values({
                userId,
                vaultId,
                policyId,
                periodStart,
                periodEnd,
                periodType: 'monthly',
                wasCompliant: isCompliant,
                compliancePercentage: isCompliant ? 100 : Math.max(0, 100 - violations.length * 10),
                violationsCount: violations.length,
                criticalViolationsCount: criticalCount,
                actualEssentialExpenses: actualExpenses.toFixed(2),
                actualGoalAllocations: actualGoalAllocations.toFixed(2),
                guardrailHealthScore: healthScore.toFixed(2),
                trend: 'stable',
            })
            .returning();

        return snapshot;
    }

    /**
     * Get compliance history for user
     */
    async getComplianceHistory(userId, vaultId = null, limit = 12) {
        const snapshots = await db
            .select()
            .from(guardrailComplianceSnapshots)
            .where(
                and(
                    eq(guardrailComplianceSnapshots.userId, userId),
                    vaultId ? eq(guardrailComplianceSnapshots.vaultId, vaultId) : sql`1=1`
                )
            )
            .orderBy(desc(guardrailComplianceSnapshots.periodStart))
            .limit(limit);

        return snapshots;
    }
}

export default new BudgetGuardrailService();
