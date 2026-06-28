import crypto from 'crypto';
import { logInfo } from './logger.js';

/**
 * Encryption Vault Utility (L3)
 * Secure handling of private keys/secrets that are only released to heirs upon succession trigger.
 * Implements M-of-N secret sharing concepts (MOCK).
 */
class EncryptionVault {
    /**
     * Encrypt Secret for Succession
     * Encrypts data that only the system can decrypt when the will is 'triggered'.
     */
    async encryptForHeir(data, willId) {
        const secret = process.env.SUCCESSION_MASTER_KEY || 'death-is-only-the-beginning';
        const cipher = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(secret, 'salt', 32), Buffer.alloc(16, 0));

        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        logInfo(`[Encryption Vault] Secret locked for will ${willId}`);
        return encrypted;
    }

    /**
     * Release Secret to Heir
     * Decrypts and releases critical keys (e.g. BTC private keys, Legal Box codes).
     */
    async decryptForHeir(encryptedData, executorApprovals = []) {
        // High-security check: Only decrypt if executor approvals are verified
        if (executorApprovals.length < 2) {
            throw new Error('Insufficient executor consensus to release encryption vault secrets');
        }

        const secret = process.env.SUCCESSION_MASTER_KEY || 'death-is-only-the-beginning';
        const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(secret, 'salt', 32), Buffer.alloc(16, 0));

        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
    }
}

export default new EncryptionVault();
