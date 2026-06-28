import db from '../config/db.js';
import { interCompanyLedger, entities, ledgerAccounts, ledgerEntries, fxValuationSnapshots, vaults, investments } from '../db/schema.js';
import { eq, and, sql, or, desc } from 'drizzle-orm';
import currencyService from './currencyService.js';
import { logAuditEvent } from './auditService.js';

import fxEngine from './fxEngine.js';

/**
 * Inter-Company Ledger Service (L3)
 * Handles double-entry validation and inter-entity fund movement.
 */
class LedgerService {
    /**
     * Optimize Settlement Path (L3)
     * Detects if an inter-company settlement is cheaper via a triangular route or specific currency.
     */
    async optimizeSettlementPath(userId, fromEntityId, toEntityId, amountUSD) {
        // 1. Detect any FX Arbitrage opportunities that can be leveraged
        const opportunities = await fxEngine.detectTriangularArbitrage('USD');

        // 2. Map entities to their primary local currencies (simplified logic)
        // In a production app, we'd fetch this from entity metadata
        const bestOpp = opportunities[0]; // Take top spread

        if (bestOpp && bestOpp.spread > 0.1) { // If spread > 0.1%, it's worth the hop
            return {
                isOptimized: true,
                cheapestPath: bestOpp.path,
                expectedSavings: amountUSD * (bestOpp.spread / 100),
                recommendation: `Settle via ${bestOpp.path.join(' -> ')} to capture ${bestOpp.spread.toFixed(2)}% spread.`
            };
        }

        return {
            isOptimized: false,
            cheapestPath: ['USD'],
            expectedSavings: 0,
            recommendation: 'Direct USD settlement is currently optimal.'
        };
    }
    /**
     * Record an inter-company transfer with validation
     */
    async recordTransfer(userId, transferData) {
        const { fromEntityId, toEntityId, amount, currency, type, description } = transferData;

        if (fromEntityId === toEntityId) {
            throw new Error('Self-transfer is not an inter-company movement');
        }

        // 1. Verify both entities exist and belong to the user
        const [fromEntity, toEntity] = await Promise.all([
            db.query.entities.findFirst({ where: and(eq(entities.id, fromEntityId), eq(entities.userId, userId)) }),
            db.query.entities.findFirst({ where: and(eq(entities.id, toEntityId), eq(entities.userId, userId)) })
        ]);

        if (!fromEntity || !toEntity) {
            throw new Error('One or both entities not found or unauthorized');
        }

        // 2. Perform Double-Entry Validation
        // For inter-company, a transfer from Entity A to Entity B creates a "Due From" on A and a "Due To" on B.
        const [entry] = await db.insert(interCompanyLedger).values({
            userId,
            fromEntityId,
            toEntityId,
            amount,
            currency,
            transactionType: type || 'loan',
            description,
            status: 'pending'
        }).returning();

        await logAuditEvent({
            userId,
            action: 'INTER_COMPANY_TRANSFER',
            resourceType: 'entity',
            resourceId: entry.id,
            metadata: {
                from: fromEntity.name,
                to: toEntity.name,
                amount,
                currency
            }
        });

        console.log(`[Ledger] Recorded ${amount} ${currency} transfer from ${fromEntity.name} to ${toEntity.name}`);
        return entry;
    }

    /**
     * Consolidate Due-To/Due-From balances between two entities
     */
    async getConsolidatedBalance(entityAId, entityBId, userId) {
        const transfers = await db.select({
            from: interCompanyLedger.fromEntityId,
            amount: interCompanyLedger.amount,
            currency: interCompanyLedger.currency
        }).from(interCompanyLedger)
            .where(and(
                eq(interCompanyLedger.userId, userId),
                or(
                    and(eq(interCompanyLedger.fromEntityId, entityAId), eq(interCompanyLedger.toEntityId, entityBId)),
                    and(eq(interCompanyLedger.fromEntityId, entityBId), eq(interCompanyLedger.toEntityId, entityAId))
                )
            ));

        // Use base currency for consolidation logic
        let netBalance = 0;
        for (const t of transfers) {
            const amountInUSD = await currencyService.convertToBase(t.amount, t.currency);
            if (t.from === entityAId) {
                netBalance += amountInUSD; // Entity A is owed money
            } else {
                netBalance -= amountInUSD; // Entity A owes money
            }
        }

        return {
            netBalanceUSD: netBalance,
            status: netBalance > 0 ? 'A_RECEIVABLE' : 'A_PAYABLE',
            absBalanceUSD: Math.abs(netBalance)
        };
    }

    /**
     * Create a standard ledger account (L3)
     */
    async createLedgerAccount(userId, accountData) {
        const { name, accountType, currency, vaultId, investmentId } = accountData;
        const [account] = await db.insert(ledgerAccounts).values({
            userId,
            name,
            accountType,
            currency: currency || 'USD',
            vaultId,
            investmentId
        }).returning();
        return account;
    }

    /**
     * Post a double-entry transaction leg (L3)
     */
    async postLedgerEntry(userId, entryData) {
        const { accountId, transactionId, debit, credit, currency, description, metadata } = entryData;

        // 1. Get current FX rate to base (USD) for normalization
        const fxRate = await currencyService.getExchangeRate(currency, 'USD');
        const amount = parseFloat(debit) > 0 ? parseFloat(debit) : parseFloat(credit);
        const baseAmount = amount * fxRate;

        const [entry] = await db.insert(ledgerEntries).values({
            userId,
            accountId,
            transactionId,
            debit: debit.toString(),
            credit: credit.toString(),
            currency,
            fxRateBase: fxRate.toString(),
            baseAmount: baseAmount.toString(),
            description,
            metadata: metadata || {}
        }).returning();

        // 2. Trigger Real-Time Revaluation if it's an asset liquidation (Credit to asset account)
        if (parseFloat(credit) > 0) {
            await this.calculateRealizedGain(accountId, userId, parseFloat(credit), currency, fxRate);
        }

        return entry;
    }

    /**
     * Reconstruct balance from ledger entries with FX Delta (L3)
     */
    async getReconstructedBalance(accountId, userId) {
        const entries = await db.select().from(ledgerEntries)
            .where(and(eq(ledgerEntries.accountId, accountId), eq(ledgerEntries.userId, userId)));

        let netLocal = 0;
        let costBasisBase = 0;

        for (const entry of entries) {
            const debit = parseFloat(entry.debit);
            const credit = parseFloat(entry.credit);
            netLocal += (debit - credit);
            costBasisBase += (debit - credit) * parseFloat(entry.fxRateBase);
        }

        const currentRate = await currencyService.getExchangeRate(entries[0]?.currency || 'USD', 'USD');
        const currentMarketValueBase = netLocal * currentRate;
        const unrealizedFXGain = currentMarketValueBase - costBasisBase;

        return {
            accountId,
            localBalance: netLocal,
            currency: entries[0]?.currency || 'USD',
            costBasisUSD: costBasisBase,
            marketValueUSD: currentMarketValueBase,
            unrealizedFXGainUSD: unrealizedFXGain,
            revaluedAt: new Date()
        };
    }

    /**
     * Calculate realized gain/loss on asset movement (L3)
     */
    async calculateRealizedGain(accountId, userId, amountSold, currency, currentRate) {
        // Simple Average Cost Basis model for FX Realized Gain
        const [account] = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, accountId));
        if (!account) return;

        const result = await this.getReconstructedBalance(accountId, userId);
        const averageCostRate = result.costBasisUSD / result.localBalance;

        const realizedGain = amountSold * (currentRate - averageCostRate);

        // Record a valuation snapshot for audit trail
        await db.insert(fxValuationSnapshots).values({
            userId,
            accountId,
            bookValueBase: (amountSold * averageCostRate).toString(),
            marketValueBase: (amountSold * currentRate).toString(),
            unrealizedGainLoss: '0.00',
            realizedGainLoss: realizedGain.toString(),
            valuationDate: new Date()
        });

        return realizedGain;
    }

    /**
     * Run global revaluation of all user ledger accounts
     */
    async runGlobalRevaluation(userId) {
        const accounts = await db.select().from(ledgerAccounts).where(eq(ledgerAccounts.userId, userId));
        const snapshots = [];

        for (const account of accounts) {
            const reval = await this.getReconstructedBalance(account.id, userId);
            const [snapshot] = await db.insert(fxValuationSnapshots).values({
                userId,
                accountId: account.id,
                bookValueBase: reval.costBasisUSD.toString(),
                marketValueBase: reval.marketValueUSD.toString(),
                unrealizedGainLoss: reval.unrealizedFXGainUSD.toString(),
                valuationDate: new Date()
            }).returning();
            snapshots.push(snapshot);
        }

        return snapshots;
    }

    // ========================================================================
    // DOUBLE-ENTRY ACCOUNTING ENHANCEMENTS
    // ========================================================================

    /**
     * Initialize default chart of accounts for user
     */
    async initializeChartOfAccounts(userId, baseCurrency = 'USD') {
        const defaultAccounts = [
            // Assets
            { code: '1000', name: 'Cash', type: 'asset', normalBalance: 'debit' },
            { code: '1100', name: 'Vaults', type: 'asset', normalBalance: 'debit' },
            { code: '1300', name: 'Investments', type: 'asset', normalBalance: 'debit' },
            { code: '1500', name: 'FX Unrealized Gains', type: 'asset', normalBalance: 'debit' },
            // Liabilities
            { code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit' },
            { code: '2100', name: 'Debts', type: 'liability', normalBalance: 'credit' },
            { code: '2500', name: 'FX Unrealized Losses', type: 'liability', normalBalance: 'credit' },
            // Revenue
            { code: '4000', name: 'Income', type: 'revenue', normalBalance: 'credit' },
            { code: '4500', name: 'FX Realized Gains', type: 'revenue', normalBalance: 'credit' },
            // Expenses
            { code: '5000', name: 'Expenses', type: 'expense', normalBalance: 'debit' },
            { code: '5500', name: 'FX Realized Losses', type: 'expense', normalBalance: 'debit' }
        ];

        const accounts = defaultAccounts.map(acc => ({
            userId,
            name: `${acc.code} - ${acc.name}`,
            accountType: acc.type,
            accountCode: acc.code,
            normalBalance: acc.normalBalance,
            currency: baseCurrency,
            isSystem: true,
            createdAt: new Date()
        }));

        const result = await db.insert(ledgerAccounts).values(accounts).returning();
        console.log(`[Ledger] Initialized ${result.length} accounts for user ${userId}`);
        return result;
    }

    /**
     * Create double-entry journal (debit + credit)
     */
    async createJournalEntry({ 
        userId, debitAccountId, creditAccountId, amount, currency = 'USD',
        description, referenceType, referenceId, vaultId
    }) {
        if (!amount || amount <= 0) {
            throw new Error('Amount must be positive');
        }

        const fxRate = currency !== 'USD' 
            ? await currencyService.getExchangeRate(currency, 'USD')
            : 1.0;

        const journalId = `JE-${Date.now()}`;
        const baseCurrencyAmount = amount * fxRate;

        const entries = [
            {
                userId, journalId, accountId: debitAccountId,
                transactionType: 'debit', amount, currency,
                baseCurrencyAmount, fxRate, description,
                referenceType, referenceId, vaultId,
                metadata: {}
            },
            {
                userId, journalId, accountId: creditAccountId,
                transactionType: 'credit', amount, currency,
                baseCurrencyAmount, fxRate, description,
                referenceType, referenceId, vaultId,
                metadata: {}
            }
        ];

        const result = await db.insert(ledgerEntries).values(entries).returning();
        
        await logAuditEvent({
            userId,
            action: 'JOURNAL_ENTRY_CREATED',
            resourceType: 'ledger',
            resourceId: journalId,
            metadata: { debitAccountId, creditAccountId, amount, currency }
        });

        return { journalId, entries: result };
    }

    /**
     * Get vault balance from ledger entries
     */
    async getVaultBalanceFromLedger(vaultId, userId) {
        const entries = await db.select()
            .from(ledgerEntries)
            .where(and(
                eq(ledgerEntries.vaultId, vaultId),
                eq(ledgerEntries.userId, userId)
            ));

        let balance = 0;
        for (const entry of entries) {
            const amount = parseFloat(entry.baseCurrencyAmount || entry.amount || 0);
            balance += entry.transactionType === 'debit' ? amount : -amount;
        }

        return Math.round(balance * 100) / 100;
    }

    /**
     * Revalue all accounts for FX rate changes
     */
    async revalueAllAccounts(userId, newFxRates) {
        const accounts = await db.select()
            .from(ledgerAccounts)
            .where(eq(ledgerAccounts.userId, userId));

        const revaluations = [];

        for (const account of accounts) {
            if (account.currency !== 'USD') {
                const newRate = newFxRates[account.currency];
                if (newRate) {
                    const balance = await this.getReconstructedBalance(account.id, userId);
                    const unrealizedGain = balance.unrealizedFXGainUSD;

                    if (Math.abs(unrealizedGain) > 0.01) {
                        const [snapshot] = await db.insert(fxValuationSnapshots).values({
                            userId,
                            accountId: account.id,
                            bookValueBase: balance.costBasisUSD.toString(),
                            marketValueBase: balance.marketValueUSD.toString(),
                            unrealizedGainLoss: unrealizedGain.toString(),
                            fxRate: newRate,
                            valuationDate: new Date()
                        }).returning();

                        revaluations.push(snapshot);
                    }
                }
            }
        }

        console.log(`[FX Revaluation] Processed ${revaluations.length} accounts`);
        return { count: revaluations.length, revaluations };
    }
}

export default new LedgerService();
