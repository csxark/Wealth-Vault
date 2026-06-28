/**
 * MFA Utilities Unit Tests
 */

import {
  generateRecoveryCodes,
  generateBackupCodes,
  hashRecoveryCodes,
  verifyRecoveryCode,
  markRecoveryCodeAsUsed,
  getRecoveryCodeStatus,
  isValidMFAToken,
} from '../../utils/mfa';

describe('MFA Utilities', () => {
  describe('generateRecoveryCodes', () => {
    it('should generate 10 recovery codes by default', () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it('should generate the specified number of codes', () => {
      const codes = generateRecoveryCodes(5);
      expect(codes).toHaveLength(5);
    });

    it('should generate codes with 16 hex characters (without hyphens)', () => {
      const codes = generateRecoveryCodes(1);
      const codeWithoutHyphens = codes[0].replace(/-/g, '');
      expect(codeWithoutHyphens).toHaveLength(16);
      expect(codeWithoutHyphens).toMatch(/^[0-9A-F]+$/);
    });

    it('should format codes as XXXX-XXXX-XXXX-XXXX', () => {
      const codes = generateRecoveryCodes(1);
      const code = codes[0];
      // Should have 3 hyphens (4 groups of 4 characters)
      const hyphens = (code.match(/-/g) || []).length;
      expect(hyphens).toBe(3);
      // Total length should be 19 (16 chars + 3 hyphens)
      expect(code).toHaveLength(19);
      // Should match pattern: XXXX-XXXX-XXXX-XXXX
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    });

    it('should generate unique codes', () => {
      const codes = generateRecoveryCodes(100);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(100);
    });

    it('should generate uppercase hex characters', () => {
      const codes = generateRecoveryCodes(1);
      const code = codes[0];
      expect(code).toBe(code.toUpperCase());
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate 8 backup codes by default', () => {
      const result = generateBackupCodes();
      expect(result.codes).toHaveLength(8);
    });

    it('should generate the specified number of codes', () => {
      const result = generateBackupCodes(5);
      expect(result.codes).toHaveLength(5);
    });

    it('should generate codes with 16 hex characters (without hyphens)', () => {
      const result = generateBackupCodes(1);
      const codeWithoutHyphens = result.codes[0].replace(/-/g, '');
      expect(codeWithoutHyphens).toHaveLength(16);
      expect(codeWithoutHyphens).toMatch(/^[0-9A-F]+$/);
    });

    it('should format codes as XXXX-XXXX-XXXX-XXXX', () => {
      const result = generateBackupCodes(1);
      const code = result.codes[0];
      const hyphens = (code.match(/-/g) || []).length;
      expect(hyphens).toBe(3);
      expect(code).toHaveLength(19);
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    });

    it('should return hashed codes', () => {
      const result = generateBackupCodes();
      expect(result.hashed).toBeDefined();
      expect(result.hashed).toHaveLength(result.codes.length);
      expect(result.hashed[0]).toHaveProperty('hash');
      expect(result.hashed[0]).toHaveProperty('used');
      expect(result.hashed[0]).toHaveProperty('createdAt');
    });

    it('should generate unique codes', () => {
      const result = generateBackupCodes(100);
      const uniqueCodes = new Set(result.codes);
      expect(uniqueCodes.size).toBe(100);
    });
  });

  describe('Consistency between generateRecoveryCodes and generateBackupCodes', () => {
    it('should generate codes with the same format', () => {
      const recoveryCode = generateRecoveryCodes(1)[0];
      const backupCode = generateBackupCodes(1).codes[0];

      const recoveryCodePattern = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;
      const backupCodePattern = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

      expect(recoveryCode).toMatch(recoveryCodePattern);
      expect(backupCode).toMatch(backupCodePattern);
      expect(recoveryCode.length).toBe(backupCode.length);
    });

    it('should both produce 16 hex characters (excluding hyphens)', () => {
      const recoveryCode = generateRecoveryCodes(1)[0].replace(/-/g, '');
      const backupCode = generateBackupCodes(1).codes[0].replace(/-/g, '');

      expect(recoveryCode).toHaveLength(16);
      expect(backupCode).toHaveLength(16);
    });
  });

  describe('hashRecoveryCodes', () => {
    it('should hash each code in the array', () => {
      const codes = ['ABCD-1234-EFGH-5678', 'IJKL-9012-MNOP-3456'];
      const hashed = hashRecoveryCodes(codes);

      expect(hashed).toHaveLength(2);
      expect(hashed[0]).toHaveProperty('hash');
      expect(hashed[0]).toHaveProperty('used');
      expect(hashed[0]).toHaveProperty('createdAt');
    });

    it('should set used to false by default', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed = hashRecoveryCodes(codes);

      expect(hashed[0].used).toBe(false);
    });

    it('should produce consistent hashes for the same code', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed1 = hashRecoveryCodes(codes);
      const hashed2 = hashRecoveryCodes(codes);

      expect(hashed1[0].hash).toBe(hashed2[0].hash);
    });
  });

  describe('verifyRecoveryCode', () => {
    it('should return -1 for invalid input', () => {
      expect(verifyRecoveryCode(null, [])).toBe(-1);
      expect(verifyRecoveryCode('', [])).toBe(-1);
      expect(verifyRecoveryCode('ABCD-1234', null)).toBe(-1);
    });

    it('should find and return index of valid unused code', () => {
      const codes = ['ABCD-1234-EFGH-5678', 'IJKL-9012-MNOP-3456'];
      const hashed = hashRecoveryCodes(codes);

      const index = verifyRecoveryCode(codes[0], hashed);
      expect(index).toBe(0);
    });

    it('should return -1 for used code', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed = hashRecoveryCodes(codes);
      hashed[0].used = true;

      const index = verifyRecoveryCode(codes[0], hashed);
      expect(index).toBe(-1);
    });

    it('should return -1 for invalid code', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed = hashRecoveryCodes(codes);

      const index = verifyRecoveryCode('WRONG-CODE-HERE', hashed);
      expect(index).toBe(-1);
    });
  });

  describe('markRecoveryCodeAsUsed', () => {
    it('should mark code as used at specified index', () => {
      const codes = ['ABCD-1234-EFGH-5678', 'IJKL-9012-MNOP-3456'];
      const hashed = hashRecoveryCodes(codes);

      const result = markRecoveryCodeAsUsed(hashed, 0);

      expect(result[0].used).toBe(true);
      expect(result[0].usedAt).toBeDefined();
      expect(result[1].used).toBe(false);
    });

    it('should not modify array for invalid index', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed = hashRecoveryCodes(codes);
      const originalUsed = hashed[0].used;

      const result = markRecoveryCodeAsUsed(hashed, 10);

      expect(result[0].used).toBe(originalUsed);
    });
  });

  describe('getRecoveryCodeStatus', () => {
    it('should return empty status for empty array', () => {
      const status = getRecoveryCodeStatus([]);
      expect(status).toEqual({
        total: 0,
        unused: 0,
        used: 0,
        hasUnused: false,
      });
    });

    it('should return correct status for used and unused codes', () => {
      const codes = ['ABCD-1234-EFGH-5678', 'IJKL-9012-MNOP-3456'];
      const hashed = hashRecoveryCodes(codes);
      hashed[0].used = true;

      const status = getRecoveryCodeStatus(hashed);

      expect(status.total).toBe(2);
      expect(status.unused).toBe(1);
      expect(status.used).toBe(1);
      expect(status.hasUnused).toBe(true);
    });

    it('should return hasUnused false when all codes used', () => {
      const codes = ['ABCD-1234-EFGH-5678'];
      const hashed = hashRecoveryCodes(codes);
      hashed[0].used = true;

      const status = getRecoveryCodeStatus(hashed);

      expect(status.hasUnused).toBe(false);
    });
  });

  describe('isValidMFAToken', () => {
    it('should return false for invalid input', () => {
      expect(isValidMFAToken(null)).toBe(false);
      expect(isValidMFAToken('')).toBe(false);
    });

    it('should return true for valid 6-digit token', () => {
      expect(isValidMFAToken('123456')).toBe(true);
      expect(isValidMFAToken('000000')).toBe(true);
      expect(isValidMFAToken('999999')).toBe(true);
    });

    it('should return false for invalid token format', () => {
      expect(isValidMFAToken('12345')).toBe(false);
      expect(isValidMFAToken('1234567')).toBe(false);
      expect(isValidMFAToken('12345a')).toBe(false);
      expect(isValidMFAToken('abcdef')).toBe(false);
    });

    it('should ignore spaces in token', () => {
      expect(isValidMFAToken('123 456')).toBe(true);
      expect(isValidMFAToken(' 123456 ')).toBe(true);
    });
  });
});

