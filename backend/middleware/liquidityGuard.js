import { body, param } from 'express-validator';

/**
 * Liquidity Guard - Validates liquidity-related requests
 */

export const validateRescueRules = [
    body('enabled')
        .optional()
        .isBoolean()
        .withMessage('Enabled must be a boolean value'),

    body('minTransferAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum transfer amount must be a positive number'),

    body('maxTransferAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum transfer amount must be a positive number')
        .custom((value, { req }) => {
            if (req.body.minTransferAmount && value < req.body.minTransferAmount) {
                throw new Error('Maximum transfer amount must be greater than minimum');
            }
            return true;
        }),

    body('cooldownHours')
        .optional()
        .isInt({ min: 1, max: 168 })
        .withMessage('Cooldown must be between 1 and 168 hours (1 week)'),
];

export const validateForecastRequest = [
    body('daysAhead')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Days ahead must be between 1 and 365'),
];

export const validateScenarioImpact = [
    body('incomeReduction')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Income reduction must be between 0 and 100%'),

    body('expenseIncrease')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Expense increase must be between 0 and 100%'),
];

export const validateStressScenario = [
    body('scenarioType')
        .isIn(['job_loss', 'market_crash', 'medical_emergency', 'recession', 'catastrophic'])
        .withMessage('Invalid scenario type'),

    body('customParameters')
        .optional()
        .isObject()
        .withMessage('Custom parameters must be an object'),

    body('customParameters.incomeReduction')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Income reduction must be 0-100%'),

    body('customParameters.marketDrop')
        .optional()
        .isFloat({ min: 0, max: 100 })
        .withMessage('Market drop must be 0-100%'),

    body('customParameters.emergencyCost')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Emergency cost must be positive'),

    body('customParameters.duration')
        .optional()
        .isInt({ min: 1, max: 60 })
        .withMessage('Duration must be 1-60 months'),
];

/**
 * Validate runway threshold
 */
export const validateRunwayThreshold = (runwayDays) => {
    if (runwayDays < 0) {
        throw new Error('Runway days cannot be negative');
    }

    if (runwayDays < 30) {
        return {
            status: 'critical',
            alert: true,
            message: 'Critical: Less than 30 days of runway'
        };
    }

    if (runwayDays < 90) {
        return {
            status: 'warning',
            alert: true,
            message: 'Warning: Less than 90 days of runway'
        };
    }

    return {
        status: 'healthy',
        alert: false,
        message: 'Runway is healthy'
    };
};

/**
 * Validate liquidity health score
 */
export const validateHealthScore = (score) => {
    if (score < 0 || score > 100) {
        throw new Error('Health score must be between 0 and 100');
    }

    if (score < 40) {
        return {
            status: 'critical',
            recommendation: 'Immediate action required to improve liquidity'
        };
    }

    if (score < 60) {
        return {
            status: 'poor',
            recommendation: 'Focus on reducing expenses and increasing income'
        };
    }

    if (score < 80) {
        return {
            status: 'fair',
            recommendation: 'Continue building emergency fund'
        };
    }

    return {
        status: 'excellent',
        recommendation: 'Maintain current financial discipline'
    };
};

/**
 * Validate rescue transfer amount
 */
export const validateRescueAmount = (amount, sourceBalance, minAmount, maxAmount) => {
    if (amount <= 0) {
        throw new Error('Transfer amount must be positive');
    }

    if (amount < minAmount) {
        throw new Error(`Transfer amount must be at least ${minAmount}`);
    }

    if (amount > maxAmount) {
        throw new Error(`Transfer amount cannot exceed ${maxAmount}`);
    }

    if (amount > sourceBalance) {
        throw new Error('Insufficient funds in source wallet');
    }

    return true;
};

/**
 * Validate stress scenario parameters
 */
export const validateScenarioParameters = (scenarioType, parameters) => {
    const errors = [];

    switch (scenarioType) {
        case 'job_loss':
            if (parameters.incomeReduction < 0 || parameters.incomeReduction > 100) {
                errors.push('Income reduction must be 0-100%');
            }
            if (parameters.duration && (parameters.duration < 1 || parameters.duration > 60)) {
                errors.push('Duration must be 1-60 months');
            }
            break;

        case 'market_crash':
            if (parameters.marketDrop < 0 || parameters.marketDrop > 100) {
                errors.push('Market drop must be 0-100%');
            }
            break;

        case 'medical_emergency':
            if (parameters.emergencyCost < 0) {
                errors.push('Emergency cost must be positive');
            }
            if (parameters.insuranceCoverage && (parameters.insuranceCoverage < 0 || parameters.insuranceCoverage > 100)) {
                errors.push('Insurance coverage must be 0-100%');
            }
            break;

        case 'recession':
            if (parameters.incomeReduction < 0 || parameters.incomeReduction > 100) {
                errors.push('Income reduction must be 0-100%');
            }
            if (parameters.expenseIncrease < 0 || parameters.expenseIncrease > 100) {
                errors.push('Expense increase must be 0-100%');
            }
            break;
    }

    return errors;
};

/**
 * Middleware to check liquidity status before operations
 */
export const checkLiquidityStatus = async (req, res, next) => {
    try {
        // In production, fetch actual liquidity status
        const liquidityStatus = {
            healthy: true,
            runwayDays: 120
        };

        if (!liquidityStatus.healthy) {
            return res.status(400).json({
                success: false,
                message: 'Liquidity status is unhealthy. Please review your cash flow.',
                data: liquidityStatus
            });
        }

        req.liquidityStatus = liquidityStatus;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Middleware to enforce rescue cooldown
 */
export const enforceRescueCooldown = (cooldownHours = 24) => {
    return (req, res, next) => {
        // In production, check last rescue timestamp
        const lastRescue = req.user.lastRescueAt;

        if (lastRescue) {
            const hoursSinceRescue = (Date.now() - new Date(lastRescue).getTime()) / (1000 * 60 * 60);

            if (hoursSinceRescue < cooldownHours) {
                return res.status(429).json({
                    success: false,
                    message: `Rescue on cooldown. Please wait ${Math.ceil(cooldownHours - hoursSinceRescue)} more hours.`,
                    retryAfter: Math.ceil(cooldownHours - hoursSinceRescue)
                });
            }
        }

        next();
    };
};
