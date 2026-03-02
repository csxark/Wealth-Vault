import db from '../config/db.js';
import { taxLots, harvestEvents, assetCorrelationMatrix } from '../db/schema.js';
import { eq, and, desc, inArray, asc } from 'drizzle-orm';

class CryptoTaxHarvestService {
    constructor() {
        this.HARVEST_MIN_LOSS_USD = 250;
        this.MAX_CRYPTO_ASSETS_SCAN = 500;
    }

    normalizeAssetSymbol(symbol = '') {
        return String(symbol).trim().toUpperCase();
    }

    isCryptoAsset(lot) {
        const symbol = this.normalizeAssetSymbol(lot.assetSymbol);
        const metadataAssetClass = String(lot?.metadata?.assetClass || '').toLowerCase();
        const metadataIsCrypto = Boolean(lot?.metadata?.isCrypto);

        if (metadataIsCrypto || metadataAssetClass === 'crypto' || metadataAssetClass === 'cryptocurrency') {
            return true;
        }

        return /^[A-Z0-9]{2,12}$/.test(symbol);
    }

    async getLiveCryptoPrices(symbols = []) {
        const normalized = [...new Set(symbols.map((s) => this.normalizeAssetSymbol(s)).filter(Boolean))];
        if (normalized.length === 0) return {};

        const idsMap = {
            BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin', XRP: 'ripple',
            ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink',
            MATIC: 'matic-network', LTC: 'litecoin', BCH: 'bitcoin-cash', XLM: 'stellar', UNI: 'uniswap'
        };

        const knownIds = normalized.map((symbol) => idsMap[symbol]).filter(Boolean);
        const prices = {};

        if (knownIds.length > 0) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${knownIds.join(',')}&vs_currencies=usd`;
                const response = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);

                if (response.ok) {
                    const payload = await response.json();
                    for (const symbol of normalized) {
                        const id = idsMap[symbol];
                        if (id && payload[id]?.usd) {
                            prices[symbol] = Number(payload[id].usd);
                        }
                    }
                }
            } catch (_) {
                // Silent fallback to metadata / purchase price
            }
        }

        return prices;
    }

    async scanCryptoHarvestOpportunities(userId, options = {}) {
        const minLossUSD = Number(options.minLossUSD || this.HARVEST_MIN_LOSS_USD);

        const lots = await db.select().from(taxLots)
            .where(and(eq(taxLots.userId, userId), eq(taxLots.isSold, false)))
            .orderBy(desc(taxLots.createdAt));

        const cryptoLots = lots.filter((lot) => this.isCryptoAsset(lot)).slice(0, this.MAX_CRYPTO_ASSETS_SCAN);
        const symbols = [...new Set(cryptoLots.map((lot) => this.normalizeAssetSymbol(lot.assetSymbol)))];
        const livePrices = await this.getLiveCryptoPrices(symbols);

        const opportunities = [];

        for (const lot of cryptoLots) {
            const symbol = this.normalizeAssetSymbol(lot.assetSymbol);
            const quantity = Number(lot.quantity || 0);
            const costBasis = Number(lot.purchasePrice || 0);
            const fallbackPrice = Number(lot?.metadata?.currentPrice || costBasis || 0);
            const marketPrice = Number(livePrices[symbol] || fallbackPrice);
            const unrealizedPL = (marketPrice - costBasis) * quantity;

            if (unrealizedPL >= -Math.abs(minLossUSD)) continue;

            const replacementAsset = await this.findProxyAsset(symbol);
            const duplicateSignals = await this.detectCrossExchangeDuplicates(userId, symbol);

            opportunities.push({
                lotId: lot.id,
                assetSymbol: symbol,
                quantity,
                costBasis,
                marketPrice,
                unrealizedLoss: Math.abs(unrealizedPL),
                estimatedTaxSavings: Math.abs(unrealizedPL) * 0.22,
                methodOptions: ['FIFO', 'LIFO', 'SPECIFIC_LOT'],
                replacementAsset: replacementAsset?.proxyAssetSymbol || null,
                replacementCorrelation: replacementAsset?.correlationCoefficient || null,
                duplicateExchangeSignals: duplicateSignals,
                metadata: lot.metadata || {},
            });
        }

        return opportunities.sort((a, b) => b.unrealizedLoss - a.unrealizedLoss);
    }

    parseDefiTransactions(transactions = []) {
        return transactions.map((tx) => {
            const action = String(tx.action || tx.type || '').toLowerCase();
            const protocol = tx.protocol || tx.platform || 'unknown';
            const tokenIn = this.normalizeAssetSymbol(tx.tokenIn || tx.fromToken || tx.assetIn || '');
            const tokenOut = this.normalizeAssetSymbol(tx.tokenOut || tx.toToken || tx.assetOut || '');
            const amountIn = Number(tx.amountIn || tx.fromAmount || 0);
            const amountOut = Number(tx.amountOut || tx.toAmount || 0);

            let normalizedType = 'transfer';
            if (action.includes('swap')) normalizedType = 'swap';
            else if (action.includes('stake') || action.includes('unstake')) normalizedType = 'staking';
            else if (action.includes('liquidity') || action.includes('lp')) normalizedType = 'liquidity';
            else if (action.includes('farm') || action.includes('yield') || action.includes('reward')) normalizedType = 'yield';

            return {
                txHash: tx.txHash || tx.hash || null,
                timestamp: tx.timestamp || new Date(),
                protocol,
                normalizedType,
                tokenIn,
                tokenOut,
                amountIn,
                amountOut,
                taxableEvent: ['swap', 'yield'].includes(normalizedType),
                notes: tx.notes || null,
            };
        });
    }

    async detectCrossExchangeDuplicates(userId, assetSymbol) {
        const symbol = this.normalizeAssetSymbol(assetSymbol);
        const lots = await db.select().from(taxLots)
            .where(and(eq(taxLots.userId, userId), eq(taxLots.assetSymbol, symbol), eq(taxLots.isSold, false)))
            .orderBy(desc(taxLots.createdAt));

        const byExchange = {};
        for (const lot of lots) {
            const exchange = String(lot?.metadata?.exchange || 'unknown').toLowerCase();
            if (!byExchange[exchange]) byExchange[exchange] = [];
            byExchange[exchange].push(lot);
        }

        const exchanges = Object.keys(byExchange);
        if (exchanges.length <= 1) return [];

        const duplicates = [];
        for (let i = 0; i < exchanges.length; i++) {
            for (let j = i + 1; j < exchanges.length; j++) {
                const leftExchange = exchanges[i];
                const rightExchange = exchanges[j];
                const leftLots = byExchange[leftExchange];
                const rightLots = byExchange[rightExchange];

                for (const left of leftLots) {
                    for (const right of rightLots) {
                        const qtyDiff = Math.abs(Number(left.quantity) - Number(right.quantity));
                        const priceDiffPct = Math.abs(Number(left.purchasePrice) - Number(right.purchasePrice)) / Math.max(1, Number(left.purchasePrice));
                        if (qtyDiff < 0.0001 && priceDiffPct < 0.02) {
                            duplicates.push({
                                leftLotId: left.id,
                                rightLotId: right.id,
                                leftExchange,
                                rightExchange,
                                confidence: 0.9,
                            });
                        }
                    }
                }
            }
        }

        return duplicates;
    }

    async findProxyAsset(assetSymbol) {
        return await db.query.assetCorrelationMatrix.findFirst({
            where: eq(assetCorrelationMatrix.baseAssetSymbol, this.normalizeAssetSymbol(assetSymbol)),
            orderBy: desc(assetCorrelationMatrix.correlationCoefficient),
        });
    }

    async proposeAutomatedHarvest(userId, payload) {
        const {
            assetSymbol,
            lotIds = [],
            method = 'FIFO',
            autoExecute = false,
            approvalRequired = true,
            notes = null,
        } = payload;

        const lots = await this.resolveLotsForHarvest(userId, {
            assetSymbol,
            lotIds,
            method,
            quantityToHarvest: payload.quantityToHarvest,
        });

        if (lots.length === 0) {
            throw new Error('No eligible lots found for proposal');
        }

        const symbol = this.normalizeAssetSymbol(assetSymbol || lots[0].assetSymbol);
        const currentPrices = await this.getLiveCryptoPrices([symbol]);
        const marketPrice = Number(currentPrices[symbol] || lots[0]?.metadata?.currentPrice || lots[0].purchasePrice || 0);

        const totalLoss = lots.reduce((sum, lot) => {
            const qty = Number(lot.quantity || 0);
            const cost = Number(lot.purchasePrice || 0);
            const pl = (marketPrice - cost) * qty;
            return pl < 0 ? sum + Math.abs(pl) : sum;
        }, 0);

        const [event] = await db.insert(harvestEvents).values({
            userId,
            assetSymbol: symbol,
            totalLossHarvested: totalLoss.toFixed(2),
            status: approvalRequired ? 'proposed' : 'approved',
            metadata: {
                lotIds,
                method,
                autoExecute,
                approvalRequired,
                approvalStatus: approvalRequired ? 'pending' : 'approved',
                approvedBy: null,
                approvedAt: null,
                executionStatus: 'pending',
                source: 'crypto_automated_harvest',
                notes,
            },
        }).returning();

        if (!approvalRequired && autoExecute) {
            const execution = await this.executeApprovedHarvest(userId, event.id, { sellPriceOverride: marketPrice });
            return { event, execution };
        }

        return { event };
    }

    async resolveLotsForHarvest(userId, { assetSymbol, lotIds = [], method = 'FIFO', quantityToHarvest = null }) {
        const normalizedMethod = String(method || 'FIFO').toUpperCase();
        const symbol = this.normalizeAssetSymbol(assetSymbol);

        if (normalizedMethod === 'SPECIFIC_LOT') {
            if (!Array.isArray(lotIds) || lotIds.length === 0) {
                throw new Error('SPECIFIC_LOT method requires lotIds');
            }
            return await db.select().from(taxLots)
                .where(and(eq(taxLots.userId, userId), inArray(taxLots.id, lotIds), eq(taxLots.isSold, false)));
        }

        const orderClause = normalizedMethod === 'LIFO' ? desc(taxLots.purchaseDate) : asc(taxLots.purchaseDate);
        const pool = await db.select().from(taxLots)
            .where(and(eq(taxLots.userId, userId), eq(taxLots.assetSymbol, symbol), eq(taxLots.isSold, false)))
            .orderBy(orderClause);

        if (!quantityToHarvest) return pool;

        let remaining = Number(quantityToHarvest);
        const selected = [];
        for (const lot of pool) {
            if (remaining <= 0) break;
            const qty = Number(lot.quantity || 0);
            if (qty <= 0) continue;
            selected.push(lot);
            remaining -= qty;
        }

        return selected;
    }

    async ingestDefiTransactions(userId, payload) {
        const { portfolioId, vaultId, transactions = [] } = payload;
        const parsed = this.parseDefiTransactions(transactions);
        const trackedLots = [];

        for (const tx of parsed) {
            const isTrackable = tx.taxableEvent || tx.normalizedType === 'staking' || tx.normalizedType === 'liquidity';
            if (!isTrackable || !tx.tokenOut || tx.amountOut <= 0) continue;

            const estimatedUnitPrice = Number((transactions.find((raw) => (raw.txHash || raw.hash) === tx.txHash)?.usdPriceOut) || 0);

            const [lot] = await db.insert(taxLots).values({
                userId,
                portfolioId,
                vaultId,
                assetSymbol: tx.tokenOut,
                quantity: tx.amountOut.toString(),
                purchasePrice: estimatedUnitPrice.toFixed(2),
                purchaseDate: new Date(tx.timestamp),
                metadata: {
                    source: 'defi',
                    defiType: tx.normalizedType,
                    protocol: tx.protocol,
                    tokenIn: tx.tokenIn,
                    amountIn: tx.amountIn,
                    txHash: tx.txHash,
                    assetClass: 'crypto',
                    isCrypto: true,
                },
            }).returning();

            trackedLots.push(lot);
        }

        return {
            parsedCount: parsed.length,
            trackedCount: trackedLots.length,
            trackedLots,
        };
    }

    async approveHarvestProposal(userId, eventId, approverId) {
        const [event] = await db.select().from(harvestEvents)
            .where(and(eq(harvestEvents.id, eventId), eq(harvestEvents.userId, userId)));

        if (!event) throw new Error('Harvest proposal not found');

        const metadata = event.metadata || {};
        if (event.status !== 'proposed') {
            throw new Error('Only proposed harvest events can be approved');
        }

        const [updated] = await db.update(harvestEvents).set({
            status: 'approved',
            metadata: {
                ...metadata,
                approvalStatus: 'approved',
                approvedBy: approverId,
                approvedAt: new Date(),
            },
        }).where(eq(harvestEvents.id, eventId)).returning();

        return updated;
    }

    async executeApprovedHarvest(userId, eventId, options = {}) {
        const [event] = await db.select().from(harvestEvents)
            .where(and(eq(harvestEvents.id, eventId), eq(harvestEvents.userId, userId)));

        if (!event) throw new Error('Harvest event not found');
        if (!['approved', 'proposed'].includes(event.status)) {
            throw new Error('Harvest event is not executable');
        }

        const metadata = event.metadata || {};
        const lotIds = Array.isArray(metadata.lotIds) ? metadata.lotIds : [];
        if (lotIds.length === 0) throw new Error('No lot IDs attached to harvest event');

        const lots = await db.select().from(taxLots)
            .where(and(eq(taxLots.userId, userId), inArray(taxLots.id, lotIds), eq(taxLots.isSold, false)));

        if (lots.length === 0) throw new Error('No open lots found for execution');

        const symbol = this.normalizeAssetSymbol(event.assetSymbol);
        const prices = await this.getLiveCryptoPrices([symbol]);
        const sellPrice = Number(options.sellPriceOverride || prices[symbol] || lots[0].purchasePrice || 0);

        const soldLotIds = [];
        for (const lot of lots) {
            await db.update(taxLots).set({
                isSold: true,
                soldDate: new Date(),
                soldPrice: sellPrice.toFixed(2),
                metadata: {
                    ...(lot.metadata || {}),
                    harvestedVia: eventId,
                    harvestedAt: new Date(),
                },
            }).where(eq(taxLots.id, lot.id));
            soldLotIds.push(lot.id);
        }

        const [updatedEvent] = await db.update(harvestEvents).set({
            status: 'completed',
            metadata: {
                ...metadata,
                executionStatus: 'executed',
                executedAt: new Date(),
                soldLotIds,
                sellPrice,
            },
        }).where(eq(harvestEvents.id, eventId)).returning();

        return {
            event: updatedEvent,
            soldLotIds,
            sellPrice,
        };
    }

    async generateCryptoTaxDocuments(userId, taxYear, format = 'json') {
        const from = new Date(taxYear, 0, 1);
        const to = new Date(taxYear + 1, 0, 1);

        const soldLots = await db.select().from(taxLots)
            .where(and(eq(taxLots.userId, userId), eq(taxLots.isSold, true)));

        const yearLots = soldLots.filter((lot) => {
            const soldDate = lot.soldDate ? new Date(lot.soldDate) : null;
            return soldDate && soldDate >= from && soldDate < to;
        });

        const form8949 = yearLots.map((lot) => {
            const qty = Number(lot.quantity || 0);
            const proceeds = qty * Number(lot.soldPrice || 0);
            const cost = qty * Number(lot.purchasePrice || 0);
            const gainLoss = proceeds - cost;
            return {
                description: `${qty} ${this.normalizeAssetSymbol(lot.assetSymbol)}`,
                dateAcquired: lot.purchaseDate,
                dateSold: lot.soldDate,
                proceeds: Number(proceeds.toFixed(2)),
                costBasis: Number(cost.toFixed(2)),
                gainLoss: Number(gainLoss.toFixed(2)),
                term: (new Date(lot.soldDate) - new Date(lot.purchaseDate)) >= (365 * 24 * 60 * 60 * 1000) ? 'long' : 'short',
            };
        });

        const scheduleD = form8949.reduce((acc, row) => {
            if (row.term === 'short') {
                acc.shortTerm.gains += Math.max(0, row.gainLoss);
                acc.shortTerm.losses += Math.min(0, row.gainLoss);
            } else {
                acc.longTerm.gains += Math.max(0, row.gainLoss);
                acc.longTerm.losses += Math.min(0, row.gainLoss);
            }
            return acc;
        }, {
            shortTerm: { gains: 0, losses: 0 },
            longTerm: { gains: 0, losses: 0 },
        });

        const cryptoSummary = {
            assetCount: [...new Set(yearLots.map((lot) => this.normalizeAssetSymbol(lot.assetSymbol)))].length,
            transactionCount: yearLots.length,
            defiEvents: yearLots.filter((lot) => ['swap', 'staking', 'liquidity', 'yield'].includes(String(lot?.metadata?.defiType || '').toLowerCase())).length,
            totalGains: Number((scheduleD.shortTerm.gains + scheduleD.longTerm.gains).toFixed(2)),
            totalLosses: Number((scheduleD.shortTerm.losses + scheduleD.longTerm.losses).toFixed(2)),
        };

        const report = {
            taxYear,
            generatedAt: new Date(),
            form8949,
            scheduleD,
            cryptoSummary,
        };

        if (String(format).toLowerCase() === 'csv') {
            const header = 'description,date_acquired,date_sold,proceeds,cost_basis,gain_loss,term';
            const rows = form8949.map((row) => [
                row.description,
                row.dateAcquired,
                row.dateSold,
                row.proceeds,
                row.costBasis,
                row.gainLoss,
                row.term,
            ].join(','));
            return { format: 'csv', content: [header, ...rows].join('\n') };
        }

        return { format: 'json', content: report };
    }
}

export default new CryptoTaxHarvestService();
