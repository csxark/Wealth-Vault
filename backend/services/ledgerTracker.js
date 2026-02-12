import { db } from '../db/index.js';
import { internalLedger, vaultBalances } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class LedgerTracker {
    /**
     * Records a debit or credit in the internal ledger and updates vault balance
     */
    async recordTransaction(tx, data) {
        const {
            userId,
            vaultId,
            type, // 'debit' or 'credit'
            amount,
            currency,
            description,
            referenceType,
            referenceId
        } = data;

        logInfo(`Recording ${type} of ${amount} ${currency} for vault ${vaultId}`);

        // 1. Get current balance
        const balanceRecord = await tx.select()
            .from(vaultBalances)
            .where(eq(vaultBalances.id, vaultId))
            .limit(1);

        if (balanceRecord.length === 0) throw new Error(`Vault ${vaultId} not found`);
        const currentBalance = parseFloat(balanceRecord[0].balance);
        const numericAmount = parseFloat(amount);

        let newBalance;
        if (type === 'debit') {
            if (currentBalance < numericAmount) {
                throw new Error(`Insufficient funds in vault ${vaultId}. Current: ${currentBalance}, Required: ${numericAmount}`);
            }
            newBalance = currentBalance - numericAmount;
        } else {
            newBalance = currentBalance + numericAmount;
        }

        // 2. Insert ledger entry
        await tx.insert(internalLedger).values({
            userId,
            vaultId,
            transactionType: type,
            amount: numericAmount.toString(),
            currency,
            description,
            referenceType,
            referenceId,
            balanceAfter: newBalance.toString()
        });

        // 3. Update vault balance
        await tx.update(vaultBalances)
            .set({
                balance: newBalance.toString(),
                updatedAt: new Date()
            })
            .where(eq(vaultBalances.id, vaultId));

        return { success: true, newBalance };
    }

    /**
     * Reconstructs the balance of a vault from ledger history
     */
    async reconstructBalance(vaultId) {
        const entries = await db.select()
            .from(internalLedger)
            .where(eq(internalLedger.vaultId, vaultId))
            .orderBy(internalLedger.createdAt);

        let balance = 0;
        for (const entry of entries) {
            const amt = parseFloat(entry.amount);
            if (entry.transactionType === 'debit') {
                balance -= amt;
            } else {
                balance += amt;
            }
        }
        return balance;
    }
}

export default new LedgerTracker();
