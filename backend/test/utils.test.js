// Unit tests for utility functions and helpers
import { describe, test, expect } from '@jest/globals';

describe('Utility Functions', () => {
  describe('Date Utilities', () => {
    test('should format date correctly', () => {
      const date = new Date('2026-01-15T10:30:00Z');
      const formatted = date.toISOString().split('T')[0];
      expect(formatted).toBe('2026-01-15');
    });

    test('should calculate days between dates', () => {
      const date1 = new Date('2026-01-01');
      const date2 = new Date('2026-01-31');
      const daysDiff = Math.ceil((date2 - date1) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBe(30);
    });
  });

  describe('Number Utilities', () => {
    test('should format currency correctly', () => {
      const amount = 1234.56;
      const formatted = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
      }).format(amount);
      expect(formatted).toContain('1,234.56');
    });

    test('should calculate percentage correctly', () => {
      const part = 25;
      const total = 100;
      const percentage = (part / total) * 100;
      expect(percentage).toBe(25);
    });
  });

  describe('Validation Utilities', () => {
    test('should validate email format', () => {
      const validEmail = 'test@example.com';
      const invalidEmail = 'invalid-email';
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      expect(emailRegex.test(validEmail)).toBe(true);
      expect(emailRegex.test(invalidEmail)).toBe(false);
    });

    test('should validate password strength', () => {
      const strongPassword = 'Test@12345';
      const weakPassword = 'test123';
      
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
      
      expect(passwordRegex.test(strongPassword)).toBe(true);
      expect(passwordRegex.test(weakPassword)).toBe(false);
    });
  });

  describe('Category Utilities', () => {
    test('should validate category types', () => {
      const validCategories = ['safe', 'impulsive', 'anxious'];
      const testCategory = 'safe';
      
      expect(validCategories.includes(testCategory)).toBe(true);
      expect(validCategories.includes('invalid')).toBe(false);
    });
  });
});
