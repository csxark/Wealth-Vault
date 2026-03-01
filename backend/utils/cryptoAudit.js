import crypto from 'crypto';

/**
 * CryptoAudit - Hashing primitives for Merkle Audits (#475)
 */
export const hashLeaf = (data) => {
    const sortedData = sortObjectKeys(data);
    const content = JSON.stringify(sortedData);
    return crypto.createHash('sha256').update(content).digest('hex');
};

export const sortObjectKeys = (obj) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortObjectKeys);

    return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
            acc[key] = sortObjectKeys(obj[key]);
            return acc;
        }, {});
};

export const generateHashChainLink = (prevHash, currentRoot) => {
    return crypto.createHash('sha256').update(prevHash + currentRoot).digest('hex');
};
