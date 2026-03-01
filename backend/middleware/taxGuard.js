import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { taxLotInventory, taxLotHistory, washSaleViolations, investments } from '../db/schema.js';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { computeWashSaleDisallowance } from '../utils/taxMath.js';
import { logInfo, logWarn } from '../utils/logger.js';

/**
 * Tax Guard Middleware (#448)
 * Validates inventory availability before allowing lot-specific sales.
 */
export const validateLotAvailability = async (req, res, next) => {
    const userId = req.user.id;
    const { investmentId, quantityToSell, lotSelection } = req.body;

    if (!quantityToSell || parseFloat(quantityToSell) <= 0) {
        return res.status(400).json(new ApiResponse(400, null, "Invalid sale quantity."));
    }

    try {
        // 1. Calculate Total Available Balance based on Granular Open Lots
        const [inventory] = await db.select({
            totalAvailable: sql`SUM(CAST(remaining_quantity AS NUMERIC))`
        }).from(taxLotInventory).where(and(
            eq(taxLotInventory.userId, userId),
            eq(taxLotInventory.investmentId, investmentId),
            eq(taxLotInventory.lotStatus, 'open')
        ));

        const available = parseFloat(inventory?.totalAvailable || 0);

        if (available < parseFloat(quantityToSell)) {
            return res.status(403).json(new ApiResponse(403, null,
                `Insufficient tax lot inventory. Available: ${available} units. Requested: ${quantityToSell} units.`
            ));
        }

        // 2. Specific ID Validation (if user specified lots)
        if (lotSelection && Array.isArray(lotSelection)) {
            let selectionTotal = 0;
            for (const selection of lotSelection) {
                const [lot] = await db.select().from(taxLotInventory).where(and(
                    eq(taxLotInventory.id, selection.lotId),
                    eq(taxLotInventory.userId, userId)
                ));

                if (!lot || lot.lotStatus !== 'open') {
                    return res.status(400).json(new ApiResponse(400, null, `Lot ${selection.lotId} is invalid or closed.`));
                }

                if (parseFloat(lot.remainingQuantity) < parseFloat(selection.quantity)) {
                    return res.status(400).json(new ApiResponse(400, null, `Requested quantity from lot ${selection.lotId} exceeds availability.`));
                }
                selectionTotal += parseFloat(selection.quantity);
            }

            if (Math.abs(selectionTotal - parseFloat(quantityToSell)) > 0.00000001) {
                return res.status(400).json(new ApiResponse(400, null, "Specific lot selection total does not match requested sale quantity."));
            }
        }

        next();
    } catch (error) {
        res.status(500).json(new ApiResponse(500, null, error.message));
    }
};

// ─── Feature #460: Wash-Sale Shield Middleware ────────────────────────────────

/**
 * taxGuard — IRS §1091 Wash-Sale Pre-Flight Check (#460)
 *
 * Intercepts SELL / HARVEST requests and:
 *  1. Scans for repurchases within ±30 days of the intended sale date
 *  2. Computes disallowed/allowed loss split via computeWashSaleDisallowance
 *  3. Records violations to washSaleViolations audit table (non-blocking)
 *  4. Hard-blocks fully-disallowed harvests (loss > $100)
 *  5. Soft-warns on partial disallowance via req.washSaleWarning
 *  6. Injects req.washSaleAnalysis for downstream handlers
 */
export const taxGuard = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) return next();

        const investmentId = req.body?.investmentId ?? req.params?.id;
        const quantitySold = parseFloat(req.body?.quantity ?? req.body?.units ?? 0);
        const saleDate = new Date(req.body?.saleDate ?? Date.now());

        if (!investmentId || quantitySold <= 0) return next();

        logInfo(`[TaxGuard/WashSale] Pre-flight check: user=${userId} asset=${investmentId} qty=${quantitySold}`);

        const windowStart = new Date(saleDate); windowStart.setDate(windowStart.getDate() - 30);
        const windowEnd = new Date(saleDate); windowEnd.setDate(windowEnd.getDate() + 30);

        const repurchases = await db.select().from(taxLotHistory).where(
            and(
                eq(taxLotHistory.userId, userId),
                eq(taxLotHistory.investmentId, investmentId),
                eq(taxLotHistory.status, 'open'),
                gte(taxLotHistory.acquisitionDate, windowStart),
                lte(taxLotHistory.acquisitionDate, windowEnd)
            )
        );

        if (repurchases.length === 0) {
            req.washSaleAnalysis = { isViolation: false, disallowedAmount: 0 };
            return next();
        }

        const totalRepurchaseQty = repurchases.reduce(
            (sum, lot) => sum + parseFloat(lot.quantity), 0
        );

        const [investment, openLots] = await Promise.all([
            db.query.investments.findFirst({ where: eq(investments.id, investmentId) }),
            db.select().from(taxLotHistory).where(
                and(eq(taxLotHistory.userId, userId), eq(taxLotHistory.investmentId, investmentId), eq(taxLotHistory.status, 'open'))
            )
        ]);

        const currentPrice = investment?.currentPrice ? parseFloat(investment.currentPrice) : 0;
        const avgBasis = openLots.length > 0
            ? openLots.reduce((s, l) => s + parseFloat(l.unitPrice), 0) / openLots.length
            : currentPrice;

        const estimatedLoss = (currentPrice - avgBasis) * quantitySold;
        const washAnalysis = computeWashSaleDisallowance(estimatedLoss, quantitySold, totalRepurchaseQty);

        if (washAnalysis.disallowedAmount > 0 && investment) {
            db.insert(washSaleViolations).values({
                userId,
                investmentId,
                assetSymbol: investment.symbol ?? investmentId,
                violationDate: saleDate,
                disallowedLoss: washAnalysis.disallowedAmount.toString(),
                description: `Wash-sale §1091: ${repurchases.length} repurchase lot(s) within 30 days. Disallowed: $${washAnalysis.disallowedAmount.toFixed(2)}.`,
                metadata: {
                    repurchaseLotIds: repurchases.map(r => r.id),
                    washRatio: (totalRepurchaseQty / quantitySold).toFixed(4),
                    estimatedLoss: estimatedLoss.toFixed(4)
                }
            }).catch(err => logWarn('[TaxGuard] Violation log error (non-blocking):', err));
        }

        req.washSaleAnalysis = {
            isViolation: washAnalysis.disallowedAmount > 0,
            disallowedAmount: washAnalysis.disallowedAmount,
            allowedAmount: washAnalysis.allowedAmount,
            basisAdjustment: washAnalysis.basisAdjustment,
            repurchaseLotCount: repurchases.length,
            totalRepurchaseQty,
            estimatedLoss,
        };

        // Hard-block fully-disallowed harvests over $100
        if (washAnalysis.disallowedAmount >= Math.abs(estimatedLoss) && Math.abs(estimatedLoss) > 100) {
            logWarn(`[TaxGuard] BLOCKED: full wash-sale for asset ${investmentId}`);
            return res.status(409).json({
                success: false,
                message: `Wash-Sale Shield (§1091): This harvest is fully disallowed. The $${Math.abs(estimatedLoss).toFixed(2)} loss would be disallowed because ${totalRepurchaseQty} units were repurchased within the 30-day window.`,
                washSaleDetails: req.washSaleAnalysis,
                suggestion: 'Wait until the 30-day window has passed, or choose a lot not subject to wash-sale rules.'
            });
        }

        if (washAnalysis.disallowedAmount > 0) {
            logWarn(`[TaxGuard] PARTIAL wash-sale: $${washAnalysis.disallowedAmount} disallowed for asset ${investmentId}`);
            req.washSaleWarning = true;
        }

        next();
    } catch (err) {
        logWarn('[TaxGuard] Non-blocking guard error:', err);
        next();
    }
};

/**
 * recordTaxLotAcquisition — records a new tax lot on any acquisition event
 * Call from investment, expense, or FX routes when the user acquires an asset.
 */
export async function recordTaxLotAcquisition(userId, investmentId, quantity, unitPrice, options = {}) {
    const {
        currency = 'USD',
        jurisdiction = 'US',
        lotSource = 'manual',
        fxRate = 1,
        metadata = {}
    } = options;

    const [lot] = await db.insert(taxLotHistory).values({
        userId,
        investmentId,
        acquisitionDate: new Date(),
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        costBasis: (parseFloat(quantity) * parseFloat(unitPrice)).toFixed(2),
        currency,
        jurisdiction,
        lotSource,
        fxRateAtAcquisition: fxRate.toString(),
        metadata
    }).returning();

    logInfo(`[TaxGuard] Recorded lot ${lot.id}: ${quantity} units @ $${unitPrice} (source: ${lotSource})`);
    return lot;
}
