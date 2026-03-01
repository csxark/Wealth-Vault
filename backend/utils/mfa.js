/**
 * Multi-Factor Authentication (MFA) Utilities
 * Handles TOTP generation, verification, and recovery codes
 */

import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

/**
 * Generate MFA secret for a user
 * @param {string} email - User's email
 * @param {string} appName - Application name (default: Wealth-Vault)
 * @returns {object} Secret object with base32, otpauth_url, etc.
 */
export function generateMFASecret(email, appName = 'Wealth-Vault') {
  const secret = speakeasy.generateSecret({
    name: `${appName} (${email})`,
    issuer: appName,
    length: 32,
  });

  return {
    secret: secret.base32,
    otpauth_url: secret.otpauth_url,
  };
}

/**
 * Generate QR code from otpauth URL
 * @param {string} otpauth_url - The otpauth URL
 * @returns {Promise<string>} Base64 encoded QR code image
 */
export async function generateQRCode(otpauth_url) {
  try {
    const qrCodeDataURL = await QRCode.toDataURL(otpauth_url);
    return qrCodeDataURL;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify TOTP token
 * @param {string} secret - User's MFA secret (base32)
 * @param {string} token - 6-digit token from authenticator app
 * @param {number} window - Time window for validation (default: 2)
 * @returns {boolean} True if token is valid
 */
export function verifyTOTP(secret, token, window = 2) {
  if (!secret || !token) {
    return false;
  }

  // Remove any spaces from token
  const cleanToken = token.replace(/\s/g, '');

  // Verify token is 6 digits
  if (!/^\d{6}$/.test(cleanToken)) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanToken,
    window, // Allow 2 time steps before and after (60 seconds)
  });
}

/**
 * Generate backup/recovery codes
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {Array<string>} Array of recovery codes
 */
export function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for readability
    const formattedCode = `${code.slice(0, 4)}-${code.slice(4)}`;
    codes.push(formattedCode);
  }
  return codes;
}

/**
 * Hash recovery codes before storing in database
 * @param {Array<string>} codes - Array of recovery codes
 * @returns {Array<object>} Array of hashed codes with metadata
 */
export function hashRecoveryCodes(codes) {
  return codes.map(code => ({
    hash: crypto.createHash('sha256').update(code).digest('hex'),
    used: false,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Verify recovery code against stored hashes
 * @param {string} code - Recovery code to verify
 * @param {Array<object>} hashedCodes - Array of stored hashed codes
 * @returns {number} Index of matching code, or -1 if not found
 */
export function verifyRecoveryCode(code, hashedCodes) {
  if (!code || !Array.isArray(hashedCodes)) {
    return -1;
  }

  const codeHash = crypto.createHash('sha256').update(code).digest('hex');

  return hashedCodes.findIndex(
    item => item.hash === codeHash && !item.used
  );
}

/**
 * Mark recovery code as used
 * @param {Array<object>} hashedCodes - Array of hashed codes
 * @param {number} index - Index of code to mark as used
 * @returns {Array<object>} Updated array of hashed codes
 */
export function markRecoveryCodeAsUsed(hashedCodes, index) {
  if (index >= 0 && index < hashedCodes.length) {
    hashedCodes[index].used = true;
    hashedCodes[index].usedAt = new Date().toISOString();
  }
  return hashedCodes;
}

/**
 * Check if user has unused recovery codes
 * @param {Array<object>} hashedCodes - Array of hashed codes
 * @returns {object} Recovery code status
 */
export function getRecoveryCodeStatus(hashedCodes) {
  if (!Array.isArray(hashedCodes) || hashedCodes.length === 0) {
    return { total: 0, unused: 0, used: 0, hasUnused: false };
  }

  const unused = hashedCodes.filter(code => !code.used).length;
  const used = hashedCodes.filter(code => code.used).length;

  return {
    total: hashedCodes.length,
    unused,
    used,
    hasUnused: unused > 0,
  };
}

/**
 * Validate MFA token format
 * @param {string} token - Token to validate
 * @returns {boolean} True if format is valid
 */
export function isValidMFAToken(token) {
  if (!token) return false;
  const cleanToken = token.replace(/\s/g, '');
  return /^\d{6}$/.test(cleanToken);
}

/**
 * Generate backup codes in different formats
 * @param {number} count - Number of codes
 * @returns {object} Codes in different formats
 */
export function generateBackupCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // Generate 16-character code
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    // Format as XXXX-XXXX-XXXX-XXXX
    const formattedCode = code.match(/.{1,4}/g).join('-');
    codes.push(formattedCode);
  }

  return {
    codes,
    hashed: hashRecoveryCodes(codes),
  };
}

/**
 * Encrypt sensitive MFA data
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} Encrypted data
 */
export function encryptMFAData(data, key) {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  });
}

/**
 * Decrypt sensitive MFA data
 * @param {string} encryptedData - Encrypted data object (JSON string)
 * @param {string} key - Decryption key
 * @returns {string} Decrypted data
 */
export function decryptMFAData(encryptedData, key) {
  try {
    const { encrypted, iv, authTag } = JSON.parse(encryptedData);
    const algorithm = 'aes-256-gcm';
    
    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(key, 'hex'),
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting MFA data:', error);
    throw new Error('Failed to decrypt MFA data');
  }
}
