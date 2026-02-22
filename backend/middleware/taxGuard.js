import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { taxLotInventory } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

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
