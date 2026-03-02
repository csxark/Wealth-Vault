import express from 'express';
import { db } from '../db/index.js';
import { successionPlans, successionHeirs, successionAccessShards } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { successionHeartbeatService } from '../services/successionHeartbeatService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Get succession plan
router.get('/plan', authMiddleware, async (req, res) => {
    try {
        const plan = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));
        if (plan.length === 0) return res.status(404).json({ message: 'No plan found' });

        const heirs = await db.select().from(successionHeirs).where(eq(successionHeirs.planId, plan[0].id));
        res.json({ ...plan[0], heirs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create/Update plan
router.post('/plan', authMiddleware, async (req, res) => {
    try {
        const { inactivityThresholdDays, gracePeriodDays, metadata } = req.body;

        const existing = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));

        if (existing.length > 0) {
            await db.update(successionPlans)
                .set({ inactivityThresholdDays, gracePeriodDays, metadata, updatedAt: new Date() })
                .where(eq(successionPlans.userId, req.user.id));
        } else {
            await db.insert(successionPlans).values({
                userId: req.user.id,
                inactivityThresholdDays,
                gracePeriodDays,
                metadata
            });
        }

        res.json({ message: 'Succession plan updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Heartbeat check-in
router.post('/heartbeat', authMiddleware, async (req, res) => {
    try {
        await successionHeartbeatService.recordHeartbeat(req.user.id, 'app_checkin', req.ip);
        res.json({ message: 'Heartbeat recorded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add heir
router.post('/heirs', authMiddleware, async (req, res) => {
    try {
        const { name, email, publicKey, role, shardIndex } = req.body;
        const plan = await db.select().from(successionPlans).where(eq(successionPlans.userId, req.user.id));

        if (plan.length === 0) return res.status(400).json({ message: 'Create a plan first' });

        await db.insert(successionHeirs).values({
            planId: plan[0].id,
            name,
            email,
            publicKey,
            role,
            shardIndex
        });

        res.json({ message: 'Heir added' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
