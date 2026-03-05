import { simulationResults } from '../db/schema.js';
import db from '../config/db.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Prevent spamming of heavy Monte Carlo simulations
 */
export const simulationGuard = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { iterations = 1000 } = req.body;

        // 1. Limit iterations to prevent server crash
        if (iterations > 10000) {
            return res.status(400).json({
                success: false,
                message: "Maximum iterations allowed is 10,000"
            });
        }

        // 2. Check if user ran a simulation in the last 60 seconds
        const recentSim = await db.query.simulationResults.findFirst({
            where: and(
                eq(simulationResults.userId, userId),
                sql`${simulationResults.createdAt} > NOW() - INTERVAL '1 minute'`
            )
        });

        if (recentSim) {
            return res.status(429).json({
                success: false,
                message: "Please wait 60 seconds between portfolio simulations"
            });
        }

        next();
    } catch (error) {
        console.error("Simulation guard error:", error);
        next(); // Default to allowing if check fails
    }
};
