import cron from 'node-cron';
import db from '../config/db.js';
import { goals, goalRiskProfiles } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import simulationService from '../services/simulationService.js';
import investmentService from '../services/investmentService.js';
import notificationService from '../services/notificationService.js';

/**
 * Risk Monitor Job (L3)
 * Periodically runs Monte Carlo simulations for all goals and adaptive rebalancing.
 */
class RiskMonitorJob {
    constructor() {
        this.task = null;
    }

    /**
     * Start the risk monitor job
     */
    start() {
        // Run every Sunday at midnight
        this.task = cron.schedule('0 0 * * 0', async () => {
            console.log('[Risk Monitor] Starting weekly simulation scan...');
            await this.processAllGoals();
        });

        console.log('[Risk Monitor] Job scheduled for 12:00 AM Sunday');
    }

    /**
     * Process simulations for all active goals
     */
    async processAllGoals() {
        try {
            const activeGoals = await db.select().from(goals).where(eq(goals.status, 'active'));

            for (const goal of activeGoals) {
                console.log(`[Risk Monitor] Simulating goal: ${goal.title} (${goal.id})`);

                // 1. Run Monte Carlo Simulation
                const result = await simulationService.runGoalSimulation(goal.userId, goal);

                // 2. Check for Adaptive Rebalancing
                const profile = await simulationService.getGoalRiskProfile(goal.id);

                if (profile.autoRebalance && parseFloat(result.successProbability) < profile.minSuccessProbability) {
                    console.log(`[Risk Monitor] ALERT: Goal ${goal.title} success probability (${result.successProbability}) below threshold (${profile.minSuccessProbability})`);

                    // Attempt to adjust risk profile (e.g., Aggressive -> Moderate -> Conservative)
                    const newRisk = this.getLowerRiskLevel(profile.riskLevel);

                    if (newRisk && newRisk !== profile.riskLevel) {
                        await investmentService.rebalanceGoalRisk(goal.id, profile.riskLevel, newRisk, result.successProbability);

                        // Notify User
                        await notificationService.sendNotification(goal.userId, {
                            title: 'Goal Risk Automatically Rebalanced',
                            message: `Due to market volatility, your goal "${goal.title}" success probability dropped. We've adjusted it to a ${newRisk} risk profile to preserve capital.`,
                            type: 'risk_rebalance'
                        });
                    } else {
                        // High Alert: Cannot de-risk further, but probability is low
                        await notificationService.sendNotification(goal.userId, {
                            title: 'URGENT: Goal Probability Low',
                            message: `Your goal "${goal.title}" has a success probability of ${(result.successProbability * 100).toFixed(1)}%. Consider increasing monthly contributions.`,
                            type: 'risk_warning'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('[Risk Monitor] Scan failed:', error);
        }
    }

    getLowerRiskLevel(current) {
        const flow = {
            aggressive: 'moderate',
            moderate: 'conservative',
            conservative: null
        };
        return flow[current];
    }
}

export default new RiskMonitorJob();
