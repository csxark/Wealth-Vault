import express from 'express';
import { protect } from '../middleware/auth.js';
import governanceEngine from '../services/governanceEngine.js';
import db from '../config/db.js';
import { governanceResolutions, shadowEntities, bylawDefinitions, votingRecords } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import asyncHandler from 'express-async-handler';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @desc Create a shadow entity (Trust, LLC, etc.)
 * @route POST /api/governance/entities
 */
router.post('/entities', protect, asyncHandler(async (req, res) => {
    const { name, entityType, taxId, legalAddress } = req.body;
    const [entity] = await db.insert(shadowEntities).values({
        userId: req.user.id,
        name,
        entityType,
        taxId,
        legalAddress
    }).returning();

    return new ApiResponse(201, entity, "Shadow entity created").send(res);
}));

/**
 * @desc Define a new institutional bylaw
 * @route POST /api/governance/bylaws
 */
router.post('/bylaws', protect, asyncHandler(async (req, res) => {
    const { entityId, vaultId, thresholdAmount, requiredQuorum, votingPeriodHours } = req.body;
    const [bylaw] = await db.insert(bylawDefinitions).values({
        entityId,
        vaultId,
        thresholdAmount: thresholdAmount.toString(),
        requiredQuorum,
        votingPeriodHours
    }).returning();

    return new ApiResponse(201, bylaw, "Bylaw definition established").send(res);
}));

/**
 * @desc Get all open resolutions for the user
 * @route GET /api/governance/resolutions
 */
router.get('/resolutions', protect, asyncHandler(async (req, res) => {
    const resolutions = await db.select().from(governanceResolutions)
        .where(eq(governanceResolutions.status, 'open'))
        .orderBy(desc(governanceResolutions.createdAt));

    return new ApiResponse(200, resolutions, "Open resolutions retrieved").send(res);
}));

/**
 * @desc Cast a vote on a resolution
 * @route POST /api/governance/resolutions/:id/vote
 */
router.post('/resolutions/:id/vote', protect, asyncHandler(async (req, res) => {
    const { vote, reason } = req.body;
    const result = await governanceEngine.submitVote(req.user.id, req.params.id, vote, reason);
    return new ApiResponse(200, result, "Vote cast successfully").send(res);
}));

export default router;
