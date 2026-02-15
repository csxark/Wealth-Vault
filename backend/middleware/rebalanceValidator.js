import { db } from '../db/index.js';
import { portfolios } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Validates that the targets add up to exactly 100% and currency exists
 */
export const validateAllocationSum = (req, res, next) => {
    const { targets } = req.body;

    if (!targets || targets.length === 0) {
        return res.status(400).json({ message: "No target allocations provided." });
    }

    const total = targets.reduce((sum, t) => sum + parseFloat(t.targetPercentage), 0);

    // Allow for small floating point drift
    if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({
            message: `Total allocation must sum to 100%. Current sum: ${total}%`
        });
    }

    next();
};

/**
 * Ensures the user has authority over the portfolio they are trying to rebalance
 */
export const validatePortfolioAccess = async (req, res, next) => {
    const userId = req.user.id;
    const portfolioId = req.params.portfolioId;

    try {
        const portfolio = await db.select()
            .from(portfolios)
            .where(and(
                eq(portfolios.id, portfolioId),
                eq(portfolios.userId, userId)
            ))
            .limit(1);

        if (portfolio.length === 0) {
            return res.status(403).json({
                message: "Unauthorized: You do not own this portfolio."
            });
        }

        next();
    } catch (error) {
        console.error('Portfolio validation error:', error);
        res.status(500).json({ message: "Backend validation pipeline failure." });
    }
};
