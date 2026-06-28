import crypto from 'crypto';

/**
 * Crypto Utils (L3)
 * Advanced multi-party cryptographic signature verification logic.
 */
class CryptoUtils {
    /**
     * Generate a key pair for a user (Not stored, for demonstration)
     */
    generateKeyPair() {
        return crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem'
            }
        });
    }

    /**
     * Sign data using private key
     */
    signData(data, privateKey) {
        const sign = crypto.createSign('SHA256');
        sign.update(JSON.stringify(data));
        sign.end();
        return sign.sign(privateKey, 'base64');
    }

    /**
     * Verify signature using public key
     */
    verifySignature(data, signature, publicKey) {
        try {
            const verify = crypto.createVerify('SHA256');
            verify.update(JSON.stringify(data));
            verify.end();
            return verify.verify(publicKey, signature, 'base64');
        } catch (error) {
            console.error('[Crypto Utils] Verification failed:', error);
            return false;
        }
    }

    /**
     * Multi-signature verification
     * Verifies that at least M of N signatures are valid
     */
    verifyMultiSig(data, signatures, threshold) {
        let validCount = 0;

        for (const sigObj of signatures) {
            const { signature, publicKey } = sigObj;
            if (this.verifySignature(data, signature, publicKey)) {
                validCount++;
            }
        }

        return validCount >= threshold;
    }
}

export default new CryptoUtils();
