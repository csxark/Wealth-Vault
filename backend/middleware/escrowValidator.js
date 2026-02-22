import db from '../config/db.js';
import { escrowContracts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Escrow Validator
 * Ensures that sensitive escrow operations are properly authorized and meet base conditions.
 */
export const validateEscrowAccess = async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const contract = await db.query.escrowContracts.findFirst({
            where: eq(escrowContracts.id, id)
        });

        if (!contract) {
            return res.status(404).json({ error: 'Escrow contract not found' });
        }

        // Check if user is a party to the contract
        const isParty = contract.userId === userId ||
            contract.payerId === userId ||
            contract.payeeId === userId ||
            contract.creatorId === userId;

        if (!isParty) {
            return res.status(403).json({ error: 'Insufficient permissions for this escrow contract' });
        }

        req.escrow = contract;
        next();
    } catch (error) {
        console.error('[Escrow Validator] Error:', error);
        res.status(500).json({ error: 'Internal server error during escrow validation' });
    }
};

/**
 * Validates that an escrow contract is in the correct state for the requested action
 */
export const validateEscrowState = (allowedStates) => (req, res, next) => {
    const { escrow } = req;

    if (!allowedStates.includes(escrow.status)) {
        return res.status(400).json({
            error: `Invalid escrow state. Action not allowed in '${escrow.status}' state.`
        });
    }

    next();
};
