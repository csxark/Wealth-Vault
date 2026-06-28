
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateEntityOwnership, payrollValidator } from '../middleware/corporateValidator.js';
import payrollService from '../services/payrollService.js';

const router = express.Router();

// Add employee to entity
router.post('/employees', protect, validateEntityOwnership, async (req, res) => {
    const employee = await payrollService.addEmployee(req.body.entityId, req.body);
    res.status(201).json({ success: true, data: employee });
});

// Preview payroll run
router.post('/preview', protect, validateEntityOwnership, async (req, res) => {
    const preview = await payrollService.previewPayrollRun(req.body.entityId, req.body.periodStart, req.body.periodEnd);
    res.json({ success: true, data: preview });
});

// Execute payroll run
router.post('/execute', protect, validateEntityOwnership, payrollValidator, async (req, res) => {
    const run = await payrollService.executePayrollRun(req.body.entityId, req.body);
    res.json({ success: true, data: run });
});

// Get payroll history for entity
router.get('/history/:entityId', protect, validateEntityOwnership, async (req, res) => {
    const history = await payrollService.getPayrollHistory(req.params.entityId);
    res.json({ success: true, data: history });
});

export default router;
