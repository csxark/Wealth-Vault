/**
 * Cryptographic Shard Operations
 * Low-level cryptographic primitives for Shamir Secret Sharing
 * Implements finite field arithmetic over GF(2^8) for secret reconstruction
 */

import crypto from 'crypto';

/**
 * Galois Field GF(2^8) arithmetic for Shamir Secret Sharing
 * Uses irreducible polynomial x^8 + x^4 + x^3 + x + 1 (0x11B)
 */
class GaloisField {
    constructor() {
        this.polynomial = 0x11B; // Irreducible polynomial for GF(2^8)
        this.expTable = new Array(256);
        this.logTable = new Array(256);
        this._initializeTables();
    }

    /**
     * Initialize exponential and logarithm lookup tables for fast arithmetic
     */
    _initializeTables() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            this.expTable[i] = x;
            this.logTable[x] = i;
            x = this._multiply(x, 3); // Generator = 3
        }
        this.expTable[255] = this.expTable[0]; // Wrap around
    }

    /**
     * Multiply two elements in GF(2^8) using Russian peasant algorithm
     */
    _multiply(a, b) {
        let result = 0;
        while (b > 0) {
            if (b & 1) {
                result ^= a;
            }
            if (a & 0x80) {
                a = (a << 1) ^ this.polynomial;
            } else {
                a <<= 1;
            }
            b >>= 1;
        }
        return result & 0xFF;
    }

    /**
     * Multiply using lookup tables (faster for multiple operations)
     */
    multiply(a, b) {
        if (a === 0 || b === 0) return 0;
        return this.expTable[(this.logTable[a] + this.logTable[b]) % 255];
    }

    /**
     * Divide two elements in GF(2^8)
     */
    divide(a, b) {
        if (b === 0) throw new Error('Division by zero in GF(2^8)');
        if (a === 0) return 0;
        return this.expTable[(this.logTable[a] - this.logTable[b] + 255) % 255];
    }

    /**
     * Compute power: a^exponent in GF(2^8)
     */
    power(a, exponent) {
        if (a === 0) return 0;
        return this.expTable[(this.logTable[a] * exponent) % 255];
    }
}

const GF = new GaloisField();

/**
 * Evaluate polynomial at x using Horner's method
 * polynomial = [a0, a1, a2, ...] represents a0 + a1*x + a2*x^2 + ...
 */
function evaluatePolynomial(polynomial, x) {
    let result = 0;
    for (let i = polynomial.length - 1; i >= 0; i--) {
        result = GF.multiply(result, x) ^ polynomial[i];
    }
    return result;
}

/**
 * Lagrange interpolation in GF(2^8) to reconstruct polynomial at x=0
 * points = [{x: x1, y: y1}, {x: x2, y: y2}, ...]
 */
function lagrangeInterpolate(points) {
    const k = points.length;
    let secret = 0;

    for (let i = 0; i < k; i++) {
        let numerator = 1;
        let denominator = 1;

        for (let j = 0; j < k; j++) {
            if (i !== j) {
                // Lagrange basis polynomial: L_i(0) = Product((0 - x_j) / (x_i - x_j))
                numerator = GF.multiply(numerator, points[j].x);
                denominator = GF.multiply(denominator, points[i].x ^ points[j].x);
            }
        }

        const lagrangeBasis = GF.divide(numerator, denominator);
        secret ^= GF.multiply(points[i].y, lagrangeBasis);
    }

    return secret;
}

/**
 * Split a secret into N shards where M are required to reconstruct (M-of-N threshold)
 * @param {Buffer} secret - The secret to split (arbitrary length)
 * @param {number} totalShards - Total number of shards (N)
 * @param {number} threshold - Minimum shards needed to reconstruct (M)
 * @returns {Array<{index: number, data: Buffer}>} Array of shards
 */
export function splitSecret(secret, totalShards, threshold) {
    if (threshold > totalShards) {
        throw new Error('Threshold cannot exceed total shards');
    }
    if (threshold < 2) {
        throw new Error('Threshold must be at least 2');
    }
    if (totalShards > 255) {
        throw new Error('Maximum 255 shards supported');
    }

    const shards = [];
    const secretBytes = Buffer.from(secret);

    // For each byte of the secret, create a polynomial and evaluate at N points
    for (let shardIndex = 1; shardIndex <= totalShards; shardIndex++) {
        const shardData = Buffer.alloc(secretBytes.length);

        for (let byteIndex = 0; byteIndex < secretBytes.length; byteIndex++) {
            // Create random polynomial of degree (threshold - 1) with constant term = secret byte
            const polynomial = [secretBytes[byteIndex]];
            for (let i = 1; i < threshold; i++) {
                polynomial.push(crypto.randomInt(0, 256));
            }

            // Evaluate polynomial at x = shardIndex
            shardData[byteIndex] = evaluatePolynomial(polynomial, shardIndex);
        }

        shards.push({
            index: shardIndex,
            data: shardData
        });
    }

    return shards;
}

/**
 * Combine M shards to reconstruct the original secret
 * @param {Array<{index: number, data: Buffer}>} shards - Array of at least M shards
 * @returns {Buffer} Reconstructed secret
 */
export function combineShards(shards) {
    if (shards.length < 2) {
        throw new Error('At least 2 shards required for reconstruction');
    }

    // Verify all shards have same length
    const shardLength = shards[0].data.length;
    for (const shard of shards) {
        if (shard.data.length !== shardLength) {
            throw new Error('All shards must have the same length');
        }
    }

    const secret = Buffer.alloc(shardLength);

    // Reconstruct each byte independently using Lagrange interpolation
    for (let byteIndex = 0; byteIndex < shardLength; byteIndex++) {
        const points = shards.map(shard => ({
            x: shard.index,
            y: shard.data[byteIndex]
        }));

        secret[byteIndex] = lagrangeInterpolate(points);
    }

    return secret;
}

/**
 * Compute SHA-256 checksum of shard for integrity verification
 */
export function computeShardChecksum(shardData) {
    return crypto.createHash('sha256').update(shardData).digest('hex');
}

/**
 * Verify shard integrity using checksum
 */
export function verifyShardChecksum(shardData, expectedChecksum) {
    const actualChecksum = computeShardChecksum(shardData);
    return actualChecksum === expectedChecksum;
}

/**
 * Encrypt shard with AES-256-GCM using a public key-derived symmetric key
 * In production, use RSA-OAEP or ECIES for asymmetric encryption
 * @param {Buffer} shardData - Shard data to encrypt
 * @param {string} guardianPublicKey - Guardian's public key (hex string)
 * @returns {{encrypted: string, iv: string, authTag: string}}
 */
export function encryptShard(shardData, guardianPublicKey) {
    // Derive symmetric key from public key (simplified - use proper KDF in production)
    const symmetricKey = crypto.createHash('sha256')
        .update(guardianPublicKey)
        .digest();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, iv);

    let encrypted = cipher.update(shardData);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        encrypted: encrypted.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    };
}

/**
 * Decrypt shard with AES-256-GCM
 * @param {string} encryptedHex - Encrypted shard data (hex)
 * @param {string} ivHex - Initialization vector (hex)
 * @param {string} authTagHex - Authentication tag (hex)
 * @param {string} guardianPrivateKey - Guardian's private key (hex string)
 * @returns {Buffer} Decrypted shard data
 */
export function decryptShard(encryptedHex, ivHex, authTagHex, guardianPrivateKey) {
    // Derive symmetric key from private key (must match encryption)
    const symmetricKey = crypto.createHash('sha256')
        .update(guardianPrivateKey)
        .digest();

    const encrypted = Buffer.from(encryptedHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted;
}

/**
 * Generate a cryptographic signature for non-repudiation
 */
export function signData(data, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    sign.end();
    return sign.sign(privateKey, 'hex');
}

/**
 * Verify a cryptographic signature
 */
export function verifySignature(data, signature, publicKey) {
    try {
        const verify = crypto.createVerify('SHA256');
        verify.update(data);
        verify.end();
        return verify.verify(publicKey, signature, 'hex');
    } catch (error) {
        return false;
    }
}

/**
 * Generate a master secret for vault recovery (256-bit random)
 */
export function generateMasterSecret() {
    return crypto.randomBytes(32); // 256 bits
}

/**
 * Hash secret for verification without exposing original
 */
export function hashSecret(secret) {
    return crypto.createHash('sha256').update(secret).digest('hex');
}

export default {
    splitSecret,
    combineShards,
    computeShardChecksum,
    verifyShardChecksum,
    encryptShard,
    decryptShard,
    signData,
    verifySignature,
    generateMasterSecret,
    hashSecret
};
