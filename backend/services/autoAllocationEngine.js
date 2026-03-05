import db from '../config/db.js';
import { goals, expenses, users } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import goalPrioritizationService from './goalPrioritizationService.js';

/**
 * Auto-Allocation Engine
 * Recommends optimal fund distribution across savings goals
 * Issue #640: Intelligent Savings Goals with Auto-Allocation
 */
class AutoAllocationEngine {
    constructor() {
        this.ALLOCATION_STRATEGIES = {
            BALANCED: 'balanced',
            DEADLINE_FOCUSED: 'deadline_focused',
            PRIORITY_BASED: 'priority_based',
            COMPLETION_FIRST: 'completion_first'
        };

        this.MINIMUM_ALLOCATION = 10; // Minimum $10 per goal
    }

    /**
     * Generate allocation recommendations for the current month
     */
    async generateAllocationRecommendations(userId, availableAmount, strategy = null) {
        try {
            // Get active goals for user
            const userGoals = await db.query.goals.findMany({
                where: and(
                    eq(goals.userId, userId),
                    eq(goals.status, 'active'),
                    eq(goals.autoAllocateEnabled, true)
                )
            });

            if (userGoals.length === 0) {
                return {
                    userId,
                    availableAmount,
                    message: 'No active goals with auto-allocation enabled',
                    allocations: []
                };
            }

            // Calculate priorities for all goals
            const priorities = await goalPrioritizationService.calculateAllGoalPriorities(userId);

            // Determine strategy (use user's preferred or provided)
            const effectiveStrategy = strategy ||
                await this.getUserPreferredStrategy(userId) ||
                this.ALLOCATION_STRATEGIES.BALANCED;

            // Generate allocations based on strategy
            let allocations;
            switch (effectiveStrategy) {
                case this.ALLOCATION_STRATEGIES.DEADLINE_FOCUSED:
                    allocations = this.allocateByDeadline(userGoals, availableAmount, priorities);
                    break;
                case this.ALLOCATION_STRATEGIES.PRIORITY_BASED:
                    allocations = this.allocateByPriority(userGoals, availableAmount, priorities);
                    break;
                case this.ALLOCATION_STRATEGIES.COMPLETION_FIRST:
                    allocations = this.allocateByCompletion(userGoals, availableAmount, priorities);
                    break;
                case this.ALLOCATION_STRATEGIES.BALANCED:
                default:
                    allocations = this.allocateBalanced(userGoals, availableAmount, priorities);
                    break;
            }

            // Store recommendation
            const allocationPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM
            await this.storeAllocationRecommendation(
                userId,
                allocationPeriod,
                availableAmount,
                effectiveStrategy,
                allocations
            );

            return {
                userId,
                period: allocationPeriod,
                availableAmount,
                strategy: effectiveStrategy,
                allocations,
                totalAllocated: allocations.reduce((sum, a) => sum + a.amount, 0),
                goalsCovered: allocations.length,
                summary: this.generateAllocationSummary(allocations, availableAmount)
            };
        } catch (error) {
            console.error('Error generating allocation recommendations:', error);
            throw error;
        }
    }

    /**
     * Balanced allocation strategy - distribute equally with respect to minimums
     */
    allocateBalanced(goals, totalAmount, priorities) {
        const allocations = [];
        let remainingAmount = totalAmount;

        // First, respect minimum contributions
        for (const goal of goals) {
            const minContribution = parseFloat(goal.minimumMonthlyContribution) || this.MINIMUM_ALLOCATION;
            const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
            
            if (neededAmount > 0 && remainingAmount >= minContribution) {
                const allocation = Math.min(minContribution, neededAmount, remainingAmount);
                allocations.push(this.createAllocation(goal, allocation, 'minimum', priorities));
                remainingAmount -= allocation;
            }
        }

        // Then, distribute remaining amount equally
        if (remainingAmount > 0 && allocations.length > 0) {
            const perGoalExtra = remainingAmount / allocations.length;
            
            for (const alloc of allocations) {
                const goal = goals.find(g => g.id === alloc.goalId);
                const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
                const currentTotal = alloc.amount;
                const extraAmount = Math.min(perGoalExtra, neededAmount - currentTotal);
                
                alloc.amount += extraAmount;
                alloc.reasoning += ` + $${extraAmount.toFixed(2)} balanced distribution`;
            }
        }

        return allocations.sort((a, b) => b.amount - a.amount);
    }

    /**
     * Deadline-focused allocation - prioritize goals with nearest deadlines
     */
    allocateByDeadline(goals, totalAmount, priorities) {
        const allocations = [];
        let remainingAmount = totalAmount;

        // Sort goals by deadline (earliest first)
        const sortedGoals = [...goals].sort((a, b) => 
            new Date(a.deadline) - new Date(b.deadline)
        );

        for (const goal of sortedGoals) {
            if (remainingAmount < this.MINIMUM_ALLOCATION) break;

            const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
            if (neededAmount <= 0) continue;

            // Calculate optimal monthly contribution to meet deadline
            const monthsUntilDeadline = this.getMonthsUntilDeadline(goal);
            const optimalMonthly = monthsUntilDeadline > 0 ? neededAmount / monthsUntilDeadline : neededAmount;

            // Allocate optimal amount or remaining, whichever is less
            const allocation = Math.min(optimalMonthly, neededAmount, remainingAmount);
            
            if (allocation >= this.MINIMUM_ALLOCATION) {
                allocations.push(this.createAllocation(goal, allocation, 'deadline_focused', priorities));
                remainingAmount -= allocation;
            }
        }

        return allocations;
    }

    /**
     * Priority-based allocation - allocate proportionally to priority scores
     */
    allocateByPriority(goals, totalAmount, priorities) {
        const allocations = [];
        let remainingAmount = totalAmount;

        // Get priority scores
        const goalPriorities = priorities.priorities;
        const totalPriorityScore = goalPriorities.reduce((sum, p) => sum + p.priorityScore, 0);

        for (const goal of goals) {
            if (remainingAmount < this.MINIMUM_ALLOCATION) break;

            const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
            if (neededAmount <= 0) continue;

            const goalPriority = goalPriorities.find(p => p.goalId === goal.id);
            if (!goalPriority) continue;

            // Allocate proportionally to priority score
            const proportion = goalPriority.priorityScore / totalPriorityScore;
            const allocation = Math.min(
                totalAmount * proportion,
                neededAmount,
                remainingAmount
            );

            if (allocation >= this.MINIMUM_ALLOCATION) {
                allocations.push(this.createAllocation(goal, allocation, 'priority_weighted', priorities));
                remainingAmount -= allocation;
            }
        }

        return allocations.sort((a, b) => b.priorityScore - a.priorityScore);
    }

    /**
     * Completion-first allocation - focus on nearly complete goals
     */
    allocateByCompletion(goals, totalAmount, priorities) {
        const allocations = [];
        let remainingAmount = totalAmount;

        // Sort by completion percentage (highest first)
        const sortedGoals = [...goals].sort((a, b) => {
            const aProgress = parseFloat(a.currentAmount) / parseFloat(a.targetAmount);
            const bProgress = parseFloat(b.currentAmount) / parseFloat(b.targetAmount);
            return bProgress - aProgress;
        });

        for (const goal of sortedGoals) {
            if (remainingAmount < this.MINIMUM_ALLOCATION) break;

            const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
            if (neededAmount <= 0) continue;

            // For nearly complete goals (>75%), try to finish them
            const progressPercent = parseFloat(goal.currentAmount) / parseFloat(goal.targetAmount);
            let allocation;

            if (progressPercent >= 0.75) {
                // Try to complete the goal
                allocation = Math.min(neededAmount, remainingAmount);
            } else {
                // Standard allocation based on remaining needed
                allocation = Math.min(
                    neededAmount * 0.25, // 25% of what's needed
                    remainingAmount
                );
            }

            if (allocation >= this.MINIMUM_ALLOCATION) {
                allocations.push(this.createAllocation(goal, allocation, 'completion_boost', priorities));
                remainingAmount -= allocation;
            }
        }

        return allocations;
    }

    /**
     * Create an allocation object
     */
    createAllocation(goal, amount, reason, priorities) {
        const neededAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount);
        const percentage = (amount / parseFloat(goal.totalAmount || goal.targetAmount)) * 100;
        const priority = priorities.priorities.find(p => p.goalId === goal.id);

        return {
            goalId: goal.id,
            goalTitle: goal.title,
            amount: Math.round(amount * 100) / 100,
            percentage: Math.round(percentage * 100) / 100,
            currentAmount: parseFloat(goal.currentAmount),
            targetAmount: parseFloat(goal.targetAmount),
            neededAmount,
            priorityScore: priority?.priorityScore || 50,
            reasoning: this.generateReasoning(goal, amount, reason, neededAmount),
            willComplete: amount >= neededAmount,
            projectedNewTotal: parseFloat(goal.currentAmount) + amount
        };
    }

    /**
     * Generate reasoning for allocation
     */
    generateReasoning(goal, amount, strategy, neededAmount) {
        const phrases = {
            minimum: `Minimum monthly contribution of $${amount.toFixed(2)}`,
            deadline_focused: `Optimal amount to meet ${new Date(goal.deadline).toLocaleDateString()} deadline`,
            priority_weighted: `Allocated based on high priority score`,
            completion_boost: `Pushing toward completion (${((parseFloat(goal.currentAmount) / parseFloat(goal.targetAmount)) * 100).toFixed(1)}% done)`,
            balanced: `Equal distribution across goals`
        };

        let reasoning = phrases[strategy] || `Contribution of $${amount.toFixed(2)}`;
        
        if (amount >= neededAmount) {
            reasoning += ` - Will complete this goal! 🎉`;
        }

        return reasoning;
    }

    /**
     * Get months until deadline
     */
    getMonthsUntilDeadline(goal) {
        const now = new Date();
        const deadline = new Date(goal.deadline);
        const monthsDiff = (deadline.getFullYear() - now.getFullYear()) * 12 + 
                          (deadline.getMonth() - now.getMonth());
        return Math.max(1, monthsDiff);
    }

    /**
     * Store allocation recommendation
     */
    async storeAllocationRecommendation(userId, period, totalAvailable, strategy, allocations) {
        try {
            await db.execute(sql`
                INSERT INTO goal_allocations (
                    user_id, allocation_period, total_available, 
                    strategy_used, allocations
                )
                VALUES (
                    ${userId}, ${period}, ${totalAvailable},
                    ${strategy}, ${JSON.stringify(allocations)}
                )
            `);
        } catch (error) {
            console.error('Error storing allocation recommendation:', error);
        }
    }

    /**
     * Get user's preferred allocation strategy
     */
    async getUserPreferredStrategy(userId) {
        try {
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId)
            });

            return user?.preferences?.allocationStrategy || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Generate allocation summary
     */
    generateAllocationSummary(allocations, availableAmount) {
        const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
        const goalsToComplete = allocations.filter(a => a.willComplete).length;
        const unallocated = availableAmount - totalAllocated;

        let summary = `Allocated $${totalAllocated.toFixed(2)} across ${allocations.length} goal(s)`;
        
        if (goalsToComplete > 0) {
            summary += `. ${goalsToComplete} goal(s) will be completed! 🎉`;
        }

        if (unallocated > 0) {
            summary += `. $${unallocated.toFixed(2)} remaining for discretionary savings.`;
        }

        return summary;
    }

    /**
     * Calculate available monthly surplus
     */
    async calculateAvailableSurplus(userId, month = null) {
        try {
            const periodStart = month ? new Date(month) : new Date();
            periodStart.setDate(1); // First day of month
            
            const periodEnd = new Date(periodStart);
            periodEnd.setMonth(periodEnd.getMonth() + 1);

            // Get user's monthly income
            const user = await db.query.users.findFirst({
                where: eq(users.id, userId)
            });

            const monthlyIncome = parseFloat(user?.monthlyIncome || 0);

            // Get month's expenses
            const monthExpenses = await db
                .select({ total: sql`COALESCE(SUM(amount), 0)` })
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    gte(expenses.date, periodStart),
                    lte(expenses.date, periodEnd)
                ));

            const totalExpenses = parseFloat(monthExpenses[0]?.total || 0);

            // Get existing goal contributions
            const monthContributions = await db.execute(sql`
                SELECT COALESCE(SUM(raw_amount), 0) as total
                FROM goal_contribution_line_items
                WHERE user_id = ${userId}
                AND created_at >= ${periodStart}
                AND created_at < ${periodEnd}
            `);

            const totalContributions = parseFloat(monthContributions.rows[0]?.total || 0);

            const availableSurplus = monthlyIncome - totalExpenses - totalContributions;

            return {
                monthlyIncome,
                totalExpenses,
                existingContributions: totalContributions,
                availableSurplus: Math.max(0, availableSurplus),
                period: periodStart.toISOString().slice(0, 7)
            };
        } catch (error) {
            console.error('Error calculating available surplus:', error);
            throw error;
        }
    }

    /**
     * Apply allocation recommendation (create contributions)
     */
    async applyAllocation(userId, allocationId) {
        try {
            // Get allocation recommendation
            const allocation = await db.execute(sql`
                SELECT * FROM goal_allocations
                WHERE id = ${allocationId} AND user_id = ${userId}
            `);

            if (!allocation.rows || allocation.rows.length === 0) {
                throw new Error('Allocation not found');
            }

            const allocationData = allocation.rows[0];
            const allocations = JSON.parse(allocationData.allocations);

            // Create contributions for each goal
            const contributions = [];
            for (const alloc of allocations) {
                const contrib = await db.execute(sql`
                    INSERT INTO goal_contribution_line_items (
                        goal_id, tenant_id, user_id, amount_cents, raw_amount, 
                        currency, entry_type, description
                    )
                    VALUES (
                        ${alloc.goalId}, 
                        (SELECT tenant_id FROM goals WHERE id = ${alloc.goalId}),
                        ${userId}, 
                        ${Math.round(alloc.amount * 100)},
                        ${alloc.amount},
                        'USD',
                        'contribution',
                        'Auto-allocated contribution via ${allocationData.strategy_used} strategy'
                    )
                    RETURNING *
                `);

                contributions.push(contrib.rows[0]);

                // Update goal current amount
                await db.execute(sql`
                    UPDATE goals
                    SET current_amount = current_amount + ${alloc.amount},
                        updated_at = NOW()
                    WHERE id = ${alloc.goalId}
                `);
            }

            // Mark allocation as accepted and applied
            await db.execute(sql`
                UPDATE goal_allocations
                SET was_accepted = TRUE,
                    applied_at = NOW(),
                    actual_allocations = ${JSON.stringify(allocations)},
                    updated_at = NOW()
                WHERE id = ${allocationId}
            `);

            return {
                success: true,
                contributionsCreated: contributions.length,
                totalAmount: allocations.reduce((sum, a) => sum + a.amount, 0),
                contributions
            };
        } catch (error) {
            console.error('Error applying allocation:', error);
            throw error;
        }
    }
}

export default new AutoAllocationEngine();
