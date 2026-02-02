import { describe, it, expect } from '@jest/globals';
import { validatePasswordStrength } from '../../utils/passwordValidator.js';

describe('Password Validator', () => {
  describe('validatePasswordStrength', () => {
    it('should accept strong passwords', () => {
      const strongPasswords = [
        'StrongPass123!',
        'C0mpl3x!Pass',
        'MyP@ssw0rd123',
        'Secure#Pass456'
      ];

      strongPasswords.forEach(password => {
        const result = validatePasswordStrength(password);
        expect(result.score).toBeGreaterThanOrEqual(2);
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        'password',
        '12345678',
        'qwerty',
        'abc123'
      ];

      weakPasswords.forEach(password => {
        const result = validatePasswordStrength(password);
        expect(result.score).toBeLessThan(3);
      });
    });

    it('should provide feedback for weak passwords', () => {
      const result = validatePasswordStrength('password');
      
      expect(result.score).toBeLessThan(3);
      expect(result).toHaveProperty('feedback');
    });

    it('should handle empty passwords', () => {
      const result = validatePasswordStrength('');
      
      expect(result.score).toBe(0);
    });
  });
});
