import { body, query } from 'express-validator';

/**
 * Budget Validator - Validates smart budget requests
 */

export const validateBudgetAdjustment = [
    body('adjustmentRule')
        .optional()
        .isIn(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'])
        .withMessage('Invalid adjustment rule'),

    body('categoryId')
        .optional()
        .isUUID()
        .withMessage('Invalid category ID'),
];

export const validatePredictionRequest = [
    query('categoryId')
        .optional()
        .isUUID()
        .withMessage('Invalid category ID'),

    query('monthsAhead')
        .optional()
        .isInt({ min: 1, max: 12 })
        .withMessage('Months ahead must be between 1 and 12'),

    query('modelType')
        .optional()
        .isIn(['arima', 'lstm', 'prophet', 'moving_average'])
        .withMessage('Invalid model type'),
];

export const checkMinimumDataRequirement = async (req, res, next) => {
    // In production, check if user has minimum 3 months of data
    // For now, allow all requests
    next();
};

/**
 * Validate model training parameters
 */
export const validateModelTraining = [
    body('categoryId')
        .optional()
        .isUUID()
        .withMessage('Invalid category ID'),

    body('modelType')
        .optional()
        .isIn(['arima', 'lstm', 'prophet', 'moving_average'])
        .withMessage('Invalid model type. Must be one of: arima, lstm, prophet, moving_average'),

    body('lookbackMonths')
        .optional()
        .isInt({ min: 3, max: 24 })
        .withMessage('Lookback months must be between 3 and 24'),
];

/**
 * Validate simulation parameters
 */
export const validateSimulation = [
    body('categoryId')
        .isUUID()
        .withMessage('Category ID is required and must be valid'),

    body('budgetAmount')
        .isFloat({ min: 0.01 })
        .withMessage('Budget amount must be greater than 0'),

    body('months')
        .optional()
        .isInt({ min: 1, max: 12 })
        .withMessage('Months must be between 1 and 12'),
];

/**
 * Validate adjustment application
 */
export const validateAdjustmentApplication = [
    body('adjustmentIds')
        .isArray({ min: 1 })
        .withMessage('At least one adjustment ID is required'),

    body('adjustmentIds.*')
        .isUUID()
        .withMessage('All adjustment IDs must be valid UUIDs'),
];

/**
 * Validate confidence score
 */
export const validateConfidenceScore = (score) => {
    if (score < 0 || score > 1) {
        throw new Error('Confidence score must be between 0 and 1');
    }
    return true;
};

/**
 * Validate adjustment percentage
 */
export const validateAdjustmentPercentage = (percentage, rule) => {
    const limits = {
        CONSERVATIVE: 10,
        MODERATE: 20,
        AGGRESSIVE: 40
    };

    const maxPercentage = limits[rule] || 20;

    if (Math.abs(percentage) > maxPercentage) {
        throw new Error(`Adjustment percentage cannot exceed ${maxPercentage}% for ${rule} rule`);
    }

    return true;
};

/**
 * Validate prediction timeframe
 */
export const validatePredictionTimeframe = (monthsAhead) => {
    if (monthsAhead < 1 || monthsAhead > 12) {
        throw new Error('Prediction timeframe must be between 1 and 12 months');
    }
    return true;
};

/**
 * Validate data sufficiency
 */
export const validateDataSufficiency = (dataPoints, minRequired = 3) => {
    if (dataPoints < minRequired) {
        throw new Error(`Insufficient data: need at least ${minRequired} data points, got ${dataPoints}`);
    }
    return true;
};

/**
 * Validate seasonality index
 */
export const validateSeasonalityIndex = (seasonality) => {
    if (typeof seasonality !== 'object') {
        throw new Error('Seasonality index must be an object');
    }

    for (let month = 1; month <= 12; month++) {
        if (seasonality[month] === undefined) {
            throw new Error(`Missing seasonality factor for month ${month}`);
        }

        if (seasonality[month] < 0) {
            throw new Error(`Seasonality factor for month ${month} cannot be negative`);
        }
    }

    return true;
};

/**
 * Validate pattern type
 */
export const validatePatternType = (patternType) => {
    const validTypes = ['seasonal', 'trending', 'cyclical', 'irregular'];

    if (!validTypes.includes(patternType)) {
        throw new Error(`Invalid pattern type: ${patternType}. Must be one of: ${validTypes.join(', ')}`);
    }

    return true;
};

/**
 * Validate insight severity
 */
export const validateInsightSeverity = (severity) => {
    const validSeverities = ['low', 'medium', 'high', 'critical'];

    if (!validSeverities.includes(severity)) {
        throw new Error(`Invalid severity: ${severity}. Must be one of: ${validSeverities.join(', ')}`);
    }

    return true;
};

/**
 * Validate anomaly detection parameters
 */
export const validateAnomalyDetection = [
    query('categoryId')
        .optional()
        .isUUID()
        .withMessage('Invalid category ID'),

    query('threshold')
        .optional()
        .isFloat({ min: 1.0, max: 5.0 })
        .withMessage('Threshold must be between 1.0 and 5.0 standard deviations'),
];

/**
 * Validate budget amount
 */
export const validateBudgetAmount = (amount) => {
    if (amount <= 0) {
        throw new Error('Budget amount must be greater than 0');
    }

    if (amount > 1000000) {
        throw new Error('Budget amount cannot exceed $1,000,000');
    }

    return true;
};

/**
 * Validate growth rate
 */
export const validateGrowthRate = (growthRate) => {
    if (Math.abs(growthRate) > 200) {
        throw new Error('Growth rate cannot exceed ±200%');
    }

    return true;
};

/**
 * Check if adjustment is within safe limits
 */
export const checkAdjustmentSafety = (previousAmount, newAmount, rule) => {
    const change = Math.abs(newAmount - previousAmount);
    const percentageChange = (change / previousAmount) * 100;

    const limits = {
        CONSERVATIVE: 10,
        MODERATE: 20,
        AGGRESSIVE: 40
    };

    const maxChange = limits[rule] || 20;

    if (percentageChange > maxChange) {
        throw new Error(`Adjustment of ${percentageChange.toFixed(1)}% exceeds ${rule} limit of ${maxChange}%`);
    }

    return true;
};

/**
 * Validate prediction bounds
 */
export const validatePredictionBounds = (lowerBound, predictedAmount, upperBound) => {
    if (lowerBound > predictedAmount) {
        throw new Error('Lower bound cannot be greater than predicted amount');
    }

    if (upperBound < predictedAmount) {
        throw new Error('Upper bound cannot be less than predicted amount');
    }

    if (lowerBound < 0) {
        throw new Error('Lower bound cannot be negative');
    }

    return true;
};

/**
 * Middleware to check user has sufficient transaction history
 */
export const requireMinimumHistory = (minMonths = 3) => {
    return async (req, res, next) => {
        // In production, query database to check transaction history
        // For now, allow all requests
        next();
    };
};

/**
 * Middleware to validate category ownership
 */
export const validateCategoryOwnership = async (req, res, next) => {
    // In production, verify user owns the category
    // For now, allow all requests
    next();
};
