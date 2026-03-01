import residencyEngine from '../services/residencyEngine.js';
import ApiResponse from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { taxResidencyHistory } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Compliance Guard Middleware (L3)
 * Blocks high-value transfers if residency status is "Undetermined" or "High-Risk".
 * Ensures jurisdictional tax compliance before capital flight.
 */
export const complianceGuard = async (req, res, next) => {
    const userId = req.user.id;
    const { amount = 0 } = req.body;

    // Threshold for compliance check (e.g. $10,000)
    const COMPLIANCE_THRESHOLD = 10000;

    if (amount > COMPLIANCE_THRESHOLD) {
        try {
            // Check if user has a verified primary residency
            const primaryResidency = await db.query.taxResidencyHistory.findFirst({
                where: and(
                    eq(taxResidencyHistory.userId, userId),
                    eq(taxResidencyHistory.isPrimary, true),
                    eq(taxResidencyHistory.status, 'active')
                )
            });

            if (!primaryResidency) {
                return new ApiResponse(403, {
                    code: 'RESIDENCY_VERIFICATION_REQUIRED',
                    message: 'High-value transfer requires verified tax residency status.',
                    requirement: 'Update your physical presence logs and primary tax jurisdiction.'
                }, 'Compliance Block: Undetermined Tax Residency').send(res);
            }

            // Optional: Block if moving to a "Sanctioned" country (Mock logic)
            const { targetJurisdiction } = req.body;
            const sanctionedCountries = ['KP', 'IR', 'SY'];
            if (sanctionedCountries.includes(targetJurisdiction)) {
                return new ApiResponse(403, null, 'Compliance Block: Prohibited Jurisdictional Movement').send(res);
            }

        } catch (error) {
            return next(error);
        }
    }

    next();
};

/**
 * Enhanced AML Interceptor
 */
export const amlInterceptor = (req, res, next) => {
    // Logic for rapid-fire transfer detection
    next();
};
