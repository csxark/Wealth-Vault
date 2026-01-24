/**
 * Schema validation utilities for consistent data validation
 */

// Supported currencies
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR'
];

// Standard metadata schema
export const STANDARD_METADATA_SCHEMA = {
  createdBy: 'string',
  lastModified: 'timestamp',
  version: 'number',
  flags: 'array'
};

// Expense categories
export const EXPENSE_CATEGORIES = [
  'food', 'transport', 'entertainment', 'shopping', 'bills', 
  'healthcare', 'education', 'travel', 'other'
];

// Goal types
export const GOAL_TYPES = [
  'savings', 'investment', 'debt_payment', 'emergency_fund', 'purchase'
];

// Priority levels
export const PRIORITY_LEVELS = ['low', 'medium', 'high', 'urgent'];

// Status types
export const STATUS_TYPES = ['active', 'completed', 'paused', 'cancelled'];

/**
 * Validate currency code
 */
export const validateCurrency = (currency) => {
  return SUPPORTED_CURRENCIES.includes(currency?.toUpperCase());
};

/**
 * Validate metadata structure
 */
export const validateMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return false;
  
  return (
    typeof metadata.createdBy === 'string' &&
    typeof metadata.version === 'number' &&
    Array.isArray(metadata.flags)
  );
};

/**
 * Create standard metadata object
 */
export const createStandardMetadata = (createdBy = 'system', additionalData = {}) => {
  return {
    createdBy,
    lastModified: new Date().toISOString(),
    version: 1,
    flags: [],
    ...additionalData
  };
};

/**
 * Validate expense data
 */
export const validateExpenseData = (data) => {
  const errors = [];

  if (!data.amount || data.amount <= 0) {
    errors.push('Amount must be positive');
  }

  if (!validateCurrency(data.currency)) {
    errors.push('Invalid currency code');
  }

  if (!data.description || data.description.trim().length === 0) {
    errors.push('Description is required');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate goal data
 */
export const validateGoalData = (data) => {
  const errors = [];

  if (!data.targetAmount || data.targetAmount <= 0) {
    errors.push('Target amount must be positive');
  }

  if (data.currentAmount < 0) {
    errors.push('Current amount cannot be negative');
  }

  if (!validateCurrency(data.currency)) {
    errors.push('Invalid currency code');
  }

  if (!GOAL_TYPES.includes(data.type)) {
    errors.push('Invalid goal type');
  }

  if (!PRIORITY_LEVELS.includes(data.priority)) {
    errors.push('Invalid priority level');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validate category data
 */
export const validateCategoryData = (data) => {
  const errors = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push('Category name is required');
  }

  if (data.spendingLimit && data.spendingLimit < 0) {
    errors.push('Spending limit cannot be negative');
  }

  if (data.priority && (data.priority < 0 || data.priority > 100)) {
    errors.push('Priority must be between 0 and 100');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export default {
  SUPPORTED_CURRENCIES,
  STANDARD_METADATA_SCHEMA,
  EXPENSE_CATEGORIES,
  GOAL_TYPES,
  PRIORITY_LEVELS,
  STATUS_TYPES,
  validateCurrency,
  validateMetadata,
  createStandardMetadata,
  validateExpenseData,
  validateGoalData,
  validateCategoryData
};