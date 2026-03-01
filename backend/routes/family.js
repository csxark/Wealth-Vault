import express from 'express';
import familyService from '../services/familyService.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Children Management
router.post('/children', async (req, res, next) => {
    try {
        const child = await familyService.createChild(req.user.id, req.body);
        res.status(201).json(child);
    } catch (error) {
        next(error);
    }
});

router.get('/children', async (req, res, next) => {
    try {
        const { vaultId } = req.query;
        const children = await familyService.getChildren(req.user.id, vaultId);
        res.json(children);
    } catch (error) {
        next(error);
    }
});

router.get('/children/:childId', async (req, res, next) => {
    try {
        const children = await familyService.getChildren(req.user.id);
        const child = children.find(c => c.id === req.params.childId);
        
        if (!child) {
            return res.status(404).json({ error: 'Child not found' });
        }
        
        res.json(child);
    } catch (error) {
        next(error);
    }
});

router.put('/children/:childId', async (req, res, next) => {
    try {
        const child = await familyService.updateChild(req.user.id, req.params.childId, req.body);
        res.json(child);
    } catch (error) {
        next(error);
    }
});

router.delete('/children/:childId', async (req, res, next) => {
    try {
        await familyService.deleteChild(req.user.id, req.params.childId);
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

// Allowances Management
router.post('/allowances', async (req, res, next) => {
    try {
        const allowance = await familyService.createAllowance(req.user.id, req.body);
        res.status(201).json(allowance);
    } catch (error) {
        next(error);
    }
});

router.get('/allowances', async (req, res, next) => {
    try {
        const { childId } = req.query;
        const allowances = await familyService.getAllowances(req.user.id, childId);
        res.json(allowances);
    } catch (error) {
        next(error);
    }
});

router.post('/allowances/:allowanceId/pay', async (req, res, next) => {
    try {
        const payment = await familyService.processAllowancePayment(req.user.id, req.params.allowanceId);
        res.json(payment);
    } catch (error) {
        next(error);
    }
});

// Spending Limits
router.post('/limits', async (req, res, next) => {
    try {
        const limit = await familyService.createSpendingLimit(req.user.id, req.body);
        res.status(201).json(limit);
    } catch (error) {
        next(error);
    }
});

router.get('/children/:childId/limits', async (req, res, next) => {
    try {
        const children = await familyService.getChildren(req.user.id);
        const child = children.find(c => c.id === req.params.childId);
        
        if (!child) {
            return res.status(404).json({ error: 'Child not found' });
        }
        
        // Get all limits for this child
        const allLimits = await familyService.getAllowances(req.user.id);
        const childLimits = allLimits.filter(l => l.childId === req.params.childId);
        
        res.json(childLimits);
    } catch (error) {
        next(error);
    }
});

// Child Transactions
router.post('/transactions', async (req, res, next) => {
    try {
        const transaction = await familyService.createChildTransaction(req.user.id, req.body);
        res.status(201).json(transaction);
    } catch (error) {
        next(error);
    }
});

router.get('/children/:childId/transactions', async (req, res, next) => {
    try {
        const { type, status, dateFrom, dateTo, limit, offset } = req.query;
        const transactions = await familyService.getChildTransactions(req.user.id, req.params.childId, {
            type,
            status,
            dateFrom,
            dateTo,
            limit: parseInt(limit) || 50,
            offset: parseInt(offset) || 0
        });
        res.json(transactions);
    } catch (error) {
        next(error);
    }
});

router.post('/transactions/:transactionId/approve', async (req, res, next) => {
    try {
        const { approvalNotes } = req.body;
        const transaction = await familyService.approveChildTransaction(
            req.user.id, 
            req.params.transactionId, 
            approvalNotes
        );
        res.json(transaction);
    } catch (error) {
        next(error);
    }
});

// Child Tasks/Chores
router.post('/tasks', async (req, res, next) => {
    try {
        const task = await familyService.createChildTask(req.user.id, req.body);
        res.status(201).json(task);
    } catch (error) {
        next(error);
    }
});

router.get('/children/:childId/tasks', async (req, res, next) => {
    try {
        const children = await familyService.getChildren(req.user.id);
        const child = children.find(c => c.id === req.params.childId);
        
        if (!child) {
            return res.status(404).json({ error: 'Child not found' });
        }
        
        // Get tasks for this child
        const allTasks = await familyService.getAllowances(req.user.id);
        const childTasks = allTasks.filter(t => t.childId === req.params.childId);
        
        res.json(childTasks);
    } catch (error) {
        next(error);
    }
});

router.post('/tasks/:taskId/complete', async (req, res, next) => {
    try {
        const { completedBy } = req.body;
        const task = await familyService.completeChildTask(req.user.id, req.params.taskId, completedBy);
        res.json(task);
    } catch (error) {
        next(error);
    }
});

// Child Savings Goals
router.post('/goals', async (req, res, next) => {
    try {
        const goal = await familyService.createChildSavingsGoal(req.user.id, req.body);
        res.status(201).json(goal);
    } catch (error) {
        next(error);
    }
});

router.get('/children/:childId/goals', async (req, res, next) => {
    try {
        const children = await familyService.getChildren(req.user.id);
        const child = children.find(c => c.id === req.params.childId);
        
        if (!child) {
            return res.status(404).json({ error: 'Child not found' });
        }
        
        // Get goals for this child - simplified response
        res.json([]);
    } catch (error) {
        next(error);
    }
});

router.post('/goals/:goalId/contribute', async (req, res, next) => {
    try {
        const { amount, contributionType } = req.body;
        const goal = await familyService.contributeToChildSavingsGoal(
            req.user.id, 
            req.params.goalId, 
            amount, 
            contributionType
        );
        res.json(goal);
    } catch (error) {
        next(error);
    }
});

// Financial Summary
router.get('/children/:childId/summary', async (req, res, next) => {
    try {
        const summary = await familyService.getChildFinancialSummary(req.user.id, req.params.childId);
        res.json(summary);
    } catch (error) {
        next(error);
    }
});

export default router;
