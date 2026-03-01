import { z } from 'zod';

// ============================================
// Authentication Schemas
// ============================================

/**
 * Login form validation schema
 */
export const loginSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address'),
    password: z
        .string()
        .min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Registration form validation schema
 */
export const registerSchema = z.object({
    username: z
        .string()
        .min(2, 'Full name must be at least 2 characters')
        .max(100, 'Full name cannot exceed 100 characters'),
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain at least one uppercase letter, one lowercase letter, and one number'
        ),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// ============================================
// Expense/Transaction Schemas
// ============================================

/**
 * Category enum for expense classification
 */
export const spendingCategoryEnum = z.enum(['safe', 'impulsive', 'anxious']);

/**
 * Payment method enum
 */
export const paymentMethodEnum = z.enum(['cash', 'card', 'upi', 'netbanking', 'other']);

/**
 * Recurring frequency enum
 */
export const recurringFrequencyEnum = z.enum(['daily', 'weekly', 'monthly', 'yearly']);

/**
 * Expense form validation schema
 */
export const expenseFormSchema = z.object({
    amount: z
        .string()
        .min(1, 'Amount is required')
        .refine(
            (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
            'Amount must be a positive number'
        ),
    description: z
        .string()
        .min(1, 'Description is required')
        .max(500, 'Description cannot exceed 500 characters'),
    category: spendingCategoryEnum,
    date: z
        .string()
        .min(1, 'Date is required')
        .refine(
            (val) => !isNaN(Date.parse(val)),
            'Please enter a valid date'
        ),
    paymentMethod: paymentMethodEnum,
    location: z.string().optional(),
    tags: z.string().optional(),
    notes: z.string().max(1000, 'Notes cannot exceed 1000 characters').optional(),
    isRecurring: z.boolean(),
    recurringFrequency: recurringFrequencyEnum,
    recurringInterval: z
        .string()
        .refine(
            (val) => val === '' || (!isNaN(parseInt(val)) && parseInt(val) >= 1),
            'Interval must be a positive number'
        ),
    recurringEndDate: z.string().optional(),
});

export type ExpenseFormData = z.infer<typeof expenseFormSchema>;

// ============================================
// Utility Functions
// ============================================

/**
 * Helper to get the first error message for a field
 */
export const getFieldError = (
    errors: Record<string, { message?: string } | undefined>,
    field: string
): string | undefined => {
    return errors[field]?.message;
};
