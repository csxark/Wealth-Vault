import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { eq, desc, and } from 'drizzle-orm';
import db from '../config/db.js';
import { netWorth, users } from '../db/schema.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array(),
        });
    }
    next();
};

// Helper function to calculate totals and net worth
const calculateNetWorth = (data) => {
    const assets = {
        cash: parseFloat(data.cash) || 0,
        savingsAccount: parseFloat(data.savingsAccount) || 0,
        checkingAccount: parseFloat(data.checkingAccount) || 0,
        emergencyFund: parseFloat(data.emergencyFund) || 0,
        investments: parseFloat(data.investments) || 0,
        retirementAccounts: parseFloat(data.retirementAccounts) || 0,
        realEstate: parseFloat(data.realEstate) || 0,
        vehicles: parseFloat(data.vehicles) || 0,
        otherAssets: parseFloat(data.otherAssets) || 0,
    };

    const liabilities = {
        creditCardDebt: parseFloat(data.creditCardDebt) || 0,
        autoLoans: parseFloat(data.autoLoans) || 0,
        studentLoans: parseFloat(data.studentLoans) || 0,
        mortgage: parseFloat(data.mortgage) || 0,
        personalLoans: parseFloat(data.personalLoans) || 0,
        otherLiabilities: parseFloat(data.otherLiabilities) || 0,
    };

    const totalAssets = Object.values(assets).reduce((sum, val) => sum + val, 0);
    const totalLiabilities = Object.values(liabilities).reduce((sum, val) => sum + val, 0);
    const totalNetWorth = totalAssets - totalLiabilities;

    return {
        totalAssets: totalAssets.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
        netWorth: totalNetWorth.toFixed(2),
    };
};

/**
 * @swagger
 * /api/net-worth:
 *   get:
 *     summary: Get current net worth record for authenticated user
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Net worth record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', protect, async (req, res) => {
    try {
        const result = await db
            .select()
            .from(netWorth)
            .where(eq(netWorth.userId, req.user.id))
            .orderBy(desc(netWorth.createdAt))
            .limit(1);

        if (!result || result.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No net worth record found. Please create one.',
                data: null,
            });
        }

        const record = result[0];
        res.json({
            success: true,
            message: 'Net worth record retrieved successfully',
            data: {
                id: record.id,
                userId: record.userId,
                assets: {
                    cash: record.cash,
                    savingsAccount: record.savingsAccount,
                    checkingAccount: record.checkingAccount,
                    emergencyFund: record.emergencyFund,
                    investments: record.investments,
                    retirementAccounts: record.retirementAccounts,
                    realEstate: record.realEstate,
                    vehicles: record.vehicles,
                    otherAssets: record.otherAssets,
                    total: record.totalAssets,
                },
                liabilities: {
                    creditCardDebt: record.creditCardDebt,
                    autoLoans: record.autoLoans,
                    studentLoans: record.studentLoans,
                    mortgage: record.mortgage,
                    personalLoans: record.personalLoans,
                    otherLiabilities: record.otherLiabilities,
                    total: record.totalLiabilities,
                },
                netWorth: record.netWorth,
                currency: record.currency,
                notes: record.notes,
                metadata: record.metadata,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            },
        });
    } catch (error) {
        console.error('Error fetching net worth record:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch net worth record',
            error: error.message,
        });
    }
});

/**
 * @swagger
 * /api/net-worth:
 *   post:
 *     summary: Create or update net worth record
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currency
 *             properties:
 *               cash:
 *                 type: number
 *               savingsAccount:
 *                 type: number
 *               checkingAccount:
 *                 type: number
 *               emergencyFund:
 *                 type: number
 *               investments:
 *                 type: number
 *               retirementAccounts:
 *                 type: number
 *               realEstate:
 *                 type: number
 *               vehicles:
 *                 type: number
 *               otherAssets:
 *                 type: number
 *               creditCardDebt:
 *                 type: number
 *               autoLoans:
 *                 type: number
 *               studentLoans:
 *                 type: number
 *               mortgage:
 *                 type: number
 *               personalLoans:
 *                 type: number
 *               otherLiabilities:
 *                 type: number
 *               currency:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Net worth record updated successfully
 *       201:
 *         description: Net worth record created successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
    '/',
    protect,
    [
        body('cash').optional().isFloat({ min: 0 }),
        body('savingsAccount').optional().isFloat({ min: 0 }),
        body('checkingAccount').optional().isFloat({ min: 0 }),
        body('emergencyFund').optional().isFloat({ min: 0 }),
        body('investments').optional().isFloat({ min: 0 }),
        body('retirementAccounts').optional().isFloat({ min: 0 }),
        body('realEstate').optional().isFloat({ min: 0 }),
        body('vehicles').optional().isFloat({ min: 0 }),
        body('otherAssets').optional().isFloat({ min: 0 }),
        body('creditCardDebt').optional().isFloat({ min: 0 }),
        body('autoLoans').optional().isFloat({ min: 0 }),
        body('studentLoans').optional().isFloat({ min: 0 }),
        body('mortgage').optional().isFloat({ min: 0 }),
        body('personalLoans').optional().isFloat({ min: 0 }),
        body('otherLiabilities').optional().isFloat({ min: 0 }),
        body('currency').optional().isString().trim(),
        body('notes').optional().isString().trim(),
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const {
                cash,
                savingsAccount,
                checkingAccount,
                emergencyFund,
                investments,
                retirementAccounts,
                realEstate,
                vehicles,
                otherAssets,
                creditCardDebt,
                autoLoans,
                studentLoans,
                mortgage,
                personalLoans,
                otherLiabilities,
                currency = 'USD',
                notes,
            } = req.body;

            // Validate that at least one field is provided
            if (
                !cash && !savingsAccount && !checkingAccount && !emergencyFund &&
                !investments && !retirementAccounts && !realEstate && !vehicles &&
                !otherAssets && !creditCardDebt && !autoLoans && !studentLoans &&
                !mortgage && !personalLoans && !otherLiabilities
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide at least one asset or liability value',
                });
            }

            // Check if user already has a net worth record
            const existingRecord = await db
                .select()
                .from(netWorth)
                .where(eq(netWorth.userId, req.user.id))
                .limit(1);

            // Prepare the data
            const calculationData = {
                cash,
                savingsAccount,
                checkingAccount,
                emergencyFund,
                investments,
                retirementAccounts,
                realEstate,
                vehicles,
                otherAssets,
                creditCardDebt,
                autoLoans,
                studentLoans,
                mortgage,
                personalLoans,
                otherLiabilities,
            };

            const { totalAssets, totalLiabilities, netWorth: calculatedNetWorth } = calculateNetWorth(calculationData);

            if (existingRecord.length > 0) {
                // Update existing record
                const record = existingRecord[0];

                const previousNetWorth = record.netWorth;
                const metadata = {
                    ...(record.metadata || {}),
                    previousNetWorth: record.netWorth,
                    changes: [
                        ...(record.metadata?.changes || []),
                        {
                            previousNetWorth,
                            newNetWorth: calculatedNetWorth,
                            change: (calculatedNetWorth - previousNetWorth).toFixed(2),
                            changedAt: new Date(),
                        },
                    ],
                    breakdown: calculationData,
                };

                // Keep only last 10 changes for performance
                if (metadata.changes.length > 10) {
                    metadata.changes = metadata.changes.slice(-10);
                }

                const updated = await db
                    .update(netWorth)
                    .set({
                        cash: cash !== undefined ? cash : record.cash,
                        savingsAccount: savingsAccount !== undefined ? savingsAccount : record.savingsAccount,
                        checkingAccount: checkingAccount !== undefined ? checkingAccount : record.checkingAccount,
                        emergencyFund: emergencyFund !== undefined ? emergencyFund : record.emergencyFund,
                        investments: investments !== undefined ? investments : record.investments,
                        retirementAccounts: retirementAccounts !== undefined ? retirementAccounts : record.retirementAccounts,
                        realEstate: realEstate !== undefined ? realEstate : record.realEstate,
                        vehicles: vehicles !== undefined ? vehicles : record.vehicles,
                        otherAssets: otherAssets !== undefined ? otherAssets : record.otherAssets,
                        totalAssets,
                        creditCardDebt: creditCardDebt !== undefined ? creditCardDebt : record.creditCardDebt,
                        autoLoans: autoLoans !== undefined ? autoLoans : record.autoLoans,
                        studentLoans: studentLoans !== undefined ? studentLoans : record.studentLoans,
                        mortgage: mortgage !== undefined ? mortgage : record.mortgage,
                        personalLoans: personalLoans !== undefined ? personalLoans : record.personalLoans,
                        otherLiabilities: otherLiabilities !== undefined ? otherLiabilities : record.otherLiabilities,
                        totalLiabilities,
                        netWorth: calculatedNetWorth,
                        currency: currency || record.currency,
                        notes: notes !== undefined ? notes : record.notes,
                        metadata,
                        updatedAt: new Date(),
                    })
                    .where(eq(netWorth.id, record.id))
                    .returning();

                return res.json({
                    success: true,
                    message: 'Net worth record updated successfully',
                    data: {
                        id: updated[0].id,
                        userId: updated[0].userId,
                        assets: {
                            cash: updated[0].cash,
                            savingsAccount: updated[0].savingsAccount,
                            checkingAccount: updated[0].checkingAccount,
                            emergencyFund: updated[0].emergencyFund,
                            investments: updated[0].investments,
                            retirementAccounts: updated[0].retirementAccounts,
                            realEstate: updated[0].realEstate,
                            vehicles: updated[0].vehicles,
                            otherAssets: updated[0].otherAssets,
                            total: updated[0].totalAssets,
                        },
                        liabilities: {
                            creditCardDebt: updated[0].creditCardDebt,
                            autoLoans: updated[0].autoLoans,
                            studentLoans: updated[0].studentLoans,
                            mortgage: updated[0].mortgage,
                            personalLoans: updated[0].personalLoans,
                            otherLiabilities: updated[0].otherLiabilities,
                            total: updated[0].totalLiabilities,
                        },
                        netWorth: updated[0].netWorth,
                        currency: updated[0].currency,
                        notes: updated[0].notes,
                        metadata: updated[0].metadata,
                        createdAt: updated[0].createdAt,
                        updatedAt: updated[0].updatedAt,
                    },
                });
            } else {
                // Create new record
                const metadata = {
                    previousNetWorth: null,
                    changes: [],
                    breakdown: calculationData,
                };

                const created = await db
                    .insert(netWorth)
                    .values({
                        userId: req.user.id,
                        cash: cash || 0,
                        savingsAccount: savingsAccount || 0,
                        checkingAccount: checkingAccount || 0,
                        emergencyFund: emergencyFund || 0,
                        investments: investments || 0,
                        retirementAccounts: retirementAccounts || 0,
                        realEstate: realEstate || 0,
                        vehicles: vehicles || 0,
                        otherAssets: otherAssets || 0,
                        totalAssets,
                        creditCardDebt: creditCardDebt || 0,
                        autoLoans: autoLoans || 0,
                        studentLoans: studentLoans || 0,
                        mortgage: mortgage || 0,
                        personalLoans: personalLoans || 0,
                        otherLiabilities: otherLiabilities || 0,
                        totalLiabilities,
                        netWorth: calculatedNetWorth,
                        currency: currency || 'USD',
                        notes: notes || null,
                        metadata,
                    })
                    .returning();

                return res.status(201).json({
                    success: true,
                    message: 'Net worth record created successfully',
                    data: {
                        id: created[0].id,
                        userId: created[0].userId,
                        assets: {
                            cash: created[0].cash,
                            savingsAccount: created[0].savingsAccount,
                            checkingAccount: created[0].checkingAccount,
                            emergencyFund: created[0].emergencyFund,
                            investments: created[0].investments,
                            retirementAccounts: created[0].retirementAccounts,
                            realEstate: created[0].realEstate,
                            vehicles: created[0].vehicles,
                            otherAssets: created[0].otherAssets,
                            total: created[0].totalAssets,
                        },
                        liabilities: {
                            creditCardDebt: created[0].creditCardDebt,
                            autoLoans: created[0].autoLoans,
                            studentLoans: created[0].studentLoans,
                            mortgage: created[0].mortgage,
                            personalLoans: created[0].personalLoans,
                            otherLiabilities: created[0].otherLiabilities,
                            total: created[0].totalLiabilities,
                        },
                        netWorth: created[0].netWorth,
                        currency: created[0].currency,
                        notes: created[0].notes,
                        metadata: created[0].metadata,
                        createdAt: created[0].createdAt,
                        updatedAt: created[0].updatedAt,
                    },
                });
            }
        } catch (error) {
            console.error('Error creating/updating net worth record:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create/update net worth record',
                error: error.message,
            });
        }
    }
);

/**
 * @swagger
 * /api/net-worth/{id}:
 *   put:
 *     summary: Update a specific net worth record by ID
 *     tags: [Net Worth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cash:
 *                 type: number
 *               savingsAccount:
 *                 type: number
 *               checkingAccount:
 *                 type: number
 *               emergencyFund:
 *                 type: number
 *               investments:
 *                 type: number
 *               retirementAccounts:
 *                 type: number
 *               realEstate:
 *                 type: number
 *               vehicles:
 *                 type: number
 *               otherAssets:
 *                 type: number
 *               creditCardDebt:
 *                 type: number
 *               autoLoans:
 *                 type: number
 *               studentLoans:
 *                 type: number
 *               mortgage:
 *                 type: number
 *               personalLoans:
 *                 type: number
 *               otherLiabilities:
 *                 type: number
 *               currency:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Net worth record updated successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Net worth record not found
 *       500:
 *         description: Internal server error
 */
router.put(
    '/:id',
    protect,
    [
        param('id').isUUID(),
        body('cash').optional().isFloat({ min: 0 }),
        body('savingsAccount').optional().isFloat({ min: 0 }),
        body('checkingAccount').optional().isFloat({ min: 0 }),
        body('emergencyFund').optional().isFloat({ min: 0 }),
        body('investments').optional().isFloat({ min: 0 }),
        body('retirementAccounts').optional().isFloat({ min: 0 }),
        body('realEstate').optional().isFloat({ min: 0 }),
        body('vehicles').optional().isFloat({ min: 0 }),
        body('otherAssets').optional().isFloat({ min: 0 }),
        body('creditCardDebt').optional().isFloat({ min: 0 }),
        body('autoLoans').optional().isFloat({ min: 0 }),
        body('studentLoans').optional().isFloat({ min: 0 }),
        body('mortgage').optional().isFloat({ min: 0 }),
        body('personalLoans').optional().isFloat({ min: 0 }),
        body('otherLiabilities').optional().isFloat({ min: 0 }),
        body('currency').optional().isString().trim(),
        body('notes').optional().isString().trim(),
    ],
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id } = req.params;
            const {
                cash,
                savingsAccount,
                checkingAccount,
                emergencyFund,
                investments,
                retirementAccounts,
                realEstate,
                vehicles,
                otherAssets,
                creditCardDebt,
                autoLoans,
                studentLoans,
                mortgage,
                personalLoans,
                otherLiabilities,
                currency,
                notes,
            } = req.body;

            // Find the record and verify ownership
            const record = await db
                .select()
                .from(netWorth)
                .where(and(eq(netWorth.id, id), eq(netWorth.userId, req.user.id)));

            if (!record || record.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Net worth record not found',
                });
            }

            const existingRecord = record[0];

            // Prepare calculation data with existing values as fallback
            const calculationData = {
                cash: cash !== undefined ? cash : existingRecord.cash,
                savingsAccount: savingsAccount !== undefined ? savingsAccount : existingRecord.savingsAccount,
                checkingAccount: checkingAccount !== undefined ? checkingAccount : existingRecord.checkingAccount,
                emergencyFund: emergencyFund !== undefined ? emergencyFund : existingRecord.emergencyFund,
                investments: investments !== undefined ? investments : existingRecord.investments,
                retirementAccounts: retirementAccounts !== undefined ? retirementAccounts : existingRecord.retirementAccounts,
                realEstate: realEstate !== undefined ? realEstate : existingRecord.realEstate,
                vehicles: vehicles !== undefined ? vehicles : existingRecord.vehicles,
                otherAssets: otherAssets !== undefined ? otherAssets : existingRecord.otherAssets,
                creditCardDebt: creditCardDebt !== undefined ? creditCardDebt : existingRecord.creditCardDebt,
                autoLoans: autoLoans !== undefined ? autoLoans : existingRecord.autoLoans,
                studentLoans: studentLoans !== undefined ? studentLoans : existingRecord.studentLoans,
                mortgage: mortgage !== undefined ? mortgage : existingRecord.mortgage,
                personalLoans: personalLoans !== undefined ? personalLoans : existingRecord.personalLoans,
                otherLiabilities: otherLiabilities !== undefined ? otherLiabilities : existingRecord.otherLiabilities,
            };

            const { totalAssets, totalLiabilities, netWorth: calculatedNetWorth } = calculateNetWorth(calculationData);

            const previousNetWorth = existingRecord.netWorth;
            const metadata = {
                ...(existingRecord.metadata || {}),
                previousNetWorth: existingRecord.netWorth,
                changes: [
                    ...(existingRecord.metadata?.changes || []),
                    {
                        previousNetWorth,
                        newNetWorth: calculatedNetWorth,
                        change: (calculatedNetWorth - previousNetWorth).toFixed(2),
                        changedAt: new Date(),
                    },
                ],
                breakdown: calculationData,
            };

            // Keep only last 10 changes
            if (metadata.changes.length > 10) {
                metadata.changes = metadata.changes.slice(-10);
            }

            const updated = await db
                .update(netWorth)
                .set({
                    cash: calculationData.cash,
                    savingsAccount: calculationData.savingsAccount,
                    checkingAccount: calculationData.checkingAccount,
                    emergencyFund: calculationData.emergencyFund,
                    investments: calculationData.investments,
                    retirementAccounts: calculationData.retirementAccounts,
                    realEstate: calculationData.realEstate,
                    vehicles: calculationData.vehicles,
                    otherAssets: calculationData.otherAssets,
                    totalAssets,
                    creditCardDebt: calculationData.creditCardDebt,
                    autoLoans: calculationData.autoLoans,
                    studentLoans: calculationData.studentLoans,
                    mortgage: calculationData.mortgage,
                    personalLoans: calculationData.personalLoans,
                    otherLiabilities: calculationData.otherLiabilities,
                    totalLiabilities,
                    netWorth: calculatedNetWorth,
                    currency: currency || existingRecord.currency,
                    notes: notes !== undefined ? notes : existingRecord.notes,
                    metadata,
                    updatedAt: new Date(),
                })
                .where(eq(netWorth.id, id))
                .returning();

            res.json({
                success: true,
                message: 'Net worth record updated successfully',
                data: {
                    id: updated[0].id,
                    userId: updated[0].userId,
                    assets: {
                        cash: updated[0].cash,
                        savingsAccount: updated[0].savingsAccount,
                        checkingAccount: updated[0].checkingAccount,
                        emergencyFund: updated[0].emergencyFund,
                        investments: updated[0].investments,
                        retirementAccounts: updated[0].retirementAccounts,
                        realEstate: updated[0].realEstate,
                        vehicles: updated[0].vehicles,
                        otherAssets: updated[0].otherAssets,
                        total: updated[0].totalAssets,
                    },
                    liabilities: {
                        creditCardDebt: updated[0].creditCardDebt,
                        autoLoans: updated[0].autoLoans,
                        studentLoans: updated[0].studentLoans,
                        mortgage: updated[0].mortgage,
                        personalLoans: updated[0].personalLoans,
                        otherLiabilities: updated[0].otherLiabilities,
                        total: updated[0].totalLiabilities,
                    },
                    netWorth: updated[0].netWorth,
                    currency: updated[0].currency,
                    notes: updated[0].notes,
                    metadata: updated[0].metadata,
                    createdAt: updated[0].createdAt,
                    updatedAt: updated[0].updatedAt,
                },
            });
        } catch (error) {
            console.error('Error updating net worth record:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update net worth record',
                error: error.message,
            });
        }
    }
);

export default router;
