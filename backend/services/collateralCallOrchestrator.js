/**
 * Collateral Call Orchestrator
 * Automatically triggers LTV maintenance requirements (margin calls) for private loans
 * Monitors collateral values and initiates margin call workflows when thresholds breached
 */

import { db } from '../config/db.js';
import { loanCollateralMetadata, debts, debtBayesianParams } from '../db/schema.js';
import { eq, and, lt, gte } from 'drizzle-orm';

/**
 * Check all collateral positions and trigger margin calls if needed
 */
export async function checkAllCollateralPositions(userId) {
    console.log(`Checking collateral positions for user ${userId}...`);

    // Get all active collateral positions
    const collateralPositions = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.isActive, true)
        ));

    const results = {
        total: collateralPositions.length,
        healthy: 0,
        warning: 0,
        marginCalls: 0,
        liquidations: 0,
        details: []
    };

    for (const position of collateralPositions) {
        const evaluation = await evaluateCollateralPosition(position);
        results.details.push(evaluation);

        if (evaluation.status === 'healthy') results.healthy++;
        else if (evaluation.status === 'warning') results.warning++;
        else if (evaluation.status === 'margin_call') results.marginCalls++;
        else if (evaluation.status === 'liquidation') results.liquidations++;

        // Trigger action if needed
        if (evaluation.actionRequired) {
            await executeCollateralAction(position, evaluation);
        }
    }

    console.log(`Collateral check complete: ${results.marginCalls} margin calls, ${results.liquidations} liquidations`);

    return results;
}

/**
 * Evaluate a single collateral position
 */
async function evaluateCollateralPosition(position) {
    const currentLTV = parseFloat(position.currentLTV);
    const maintenanceLTV = parseFloat(position.maintenanceLTV || 0.80);
    const liquidationLTV = parseFloat(position.liquidationLTV || 0.90);
    const alertThreshold = parseFloat(position.alertThreshold || 0.75);

    let status = 'healthy';
    let actionRequired = false;
    let action = null;
    let urgency = 'low';

    // Check if liquidation threshold breached
    if (currentLTV >= liquidationLTV) {
        status = 'liquidation';
        actionRequired = true;
        action = 'initiate_liquidation';
        urgency = 'critical';
    }
    // Check if maintenance threshold breached
    else if (currentLTV >= maintenanceLTV) {
        status = 'margin_call';
        actionRequired = true;
        action = 'issue_margin_call';
        urgency = 'high';
    }
    // Check if approaching maintenance threshold
    else if (currentLTV >= alertThreshold) {
        status = 'warning';
        actionRequired = true;
        action = 'send_warning';
        urgency = 'medium';
    }

    // Calculate required collateral to restore healthy LTV (70%)
    const loanAmount = parseFloat(position.loanAmount);
    const targetLTV = 0.70;
    const requiredCollateralValue = loanAmount / targetLTV;
    const currentCollateralValue = parseFloat(position.currentValue);
    const collateralDeficit = Math.max(0, requiredCollateralValue - currentCollateralValue);

    return {
        positionId: position.id,
        debtId: position.debtId,
        collateralType: position.collateralType,
        currentLTV,
        status,
        actionRequired,
        action,
        urgency,
        metrics: {
            loanAmount,
            currentCollateralValue,
            requiredCollateralValue,
            collateralDeficit,
            maintenanceLTV,
            liquidationLTV,
            alertThreshold
        }
    };
}

/**
 * Execute collateral action (margin call, warning, or liquidation)
 */
async function executeCollateralAction(position, evaluation) {
    const { action, urgency } = evaluation;

    if (action === 'send_warning') {
        await sendCollateralWarning(position, evaluation);
    } else if (action === 'issue_margin_call') {
        await issueMarginCall(position, evaluation);
    } else if (action === 'initiate_liquidation') {
        await initiateLiquidation(position, evaluation);
    }
}

/**
 * Send collateral warning (approaching maintenance threshold)
 */
async function sendCollateralWarning(position, evaluation) {
    console.log(`⚠️ Collateral warning for position ${position.id}: LTV ${evaluation.currentLTV.toFixed(4)}`);

    // Update metadata with warning
    await db.update(loanCollateralMetadata)
        .set({
            metadata: {
                ...(position.metadata || {}),
                lastWarning: {
                    date: new Date(),
                    ltv: evaluation.currentLTV,
                    message: 'Collateral value approaching maintenance threshold'
                }
            },
            updatedAt: new Date()
        })
        .where(eq(loanCollateralMetadata.id, position.id));

    // TODO: Send notification to user
    // await notificationService.send({
    //     userId: position.userId,
    //     type: 'collateral_warning',
    //     data: { position, evaluation }
    // });

    return {
        action: 'warning_sent',
        positionId: position.id,
        ltv: evaluation.currentLTV
    };
}

/**
 * Issue margin call (maintenance threshold breached)
 */
async function issueMarginCall(position, evaluation) {
    console.log(`📞 Margin call for position ${position.id}: LTV ${evaluation.currentLTV.toFixed(4)}`);

    // Calculate margin call amount
    const collateralDeficit = evaluation.metrics.collateralDeficit;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 5); // 5 business days to meet margin call

    // Update collateral record
    await db.update(loanCollateralMetadata)
        .set({
            marginCallRequired: true,
            marginCallDate: new Date(),
            marginCallAmount: collateralDeficit.toFixed(2),
            marginCallStatus: 'pending',
            marginCallDueDate: dueDate,
            metadata: {
                ...(position.metadata || {}),
                marginCalls: [
                    ...((position.metadata?.marginCalls) || []),
                    {
                        date: new Date(),
                        amount: collateralDeficit,
                        ltv: evaluation.currentLTV,
                        dueDate,
                        status: 'pending'
                    }
                ]
            },
            updatedAt: new Date()
        })
        .where(eq(loanCollateralMetadata.id, position.id));

    // TODO: Send urgent notification to user and borrower
    // await notificationService.send({
    //     userId: position.userId,
    //     type: 'margin_call',
    //     urgency: 'high',
    //     data: { position, evaluation, amount: collateralDeficit, dueDate }
    // });

    return {
        action: 'margin_call_issued',
        positionId: position.id,
        amount: collateralDeficit,
        dueDate,
        ltv: evaluation.currentLTV
    };
}

/**
 * Initiate collateral liquidation (liquidation threshold breached)
 */
async function initiateLiquidation(position, evaluation) {
    console.log(`🚨 Initiating liquidation for position ${position.id}: LTV ${evaluation.currentLTV.toFixed(4)}`);

    // Update collateral status
    await db.update(loanCollateralMetadata)
        .set({
            marginCallStatus: 'defaulted',
            metadata: {
                ...(position.metadata || {}),
                liquidation: {
                    initiatedDate: new Date(),
                    ltv: evaluation.currentLTV,
                    collateralValue: evaluation.metrics.currentCollateralValue,
                    loanAmount: evaluation.metrics.loanAmount,
                    status: 'pending_liquidation'
                }
            },
            updatedAt: new Date()
        })
        .where(eq(loanCollateralMetadata.id, position.id));

    // TODO: Trigger liquidation workflow
    // - Legal review
    // - Appraisal/valuation
    // - Sale process
    // - Proceeds distribution

    // TODO: Send critical notification
    // await notificationService.send({
    //     userId: position.userId,
    //     type: 'liquidation_initiated',
    //     urgency: 'critical',
    //     data: { position, evaluation }
    // });

    return {
        action: 'liquidation_initiated',
        positionId: position.id,
        ltv: evaluation.currentLTV
    };
}

/**
 * Process margin call satisfaction (borrower adds collateral)
 */
export async function satisfyMarginCall(userId, positionId, addedCollateralValue) {
    const position = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.id, positionId)
        ))
        .limit(1);

    if (position.length === 0) {
        throw new Error('Collateral position not found');
    }

    const pos = position[0];

    if (!pos.marginCallRequired) {
        throw new Error('No active margin call for this position');
    }

    // Update collateral value
    const currentValue = parseFloat(pos.currentValue);
    const newValue = currentValue + addedCollateralValue;
    const loanAmount = parseFloat(pos.loanAmount);
    const newLTV = loanAmount / newValue;

    // Check if margin call is satisfied
    const maintenanceLTV = parseFloat(pos.maintenanceLTV || 0.80);
    const satisfied = newLTV < maintenanceLTV;

    // Update position
    await db.update(loanCollateralMetadata)
        .set({
            currentValue: newValue.toFixed(2),
            currentLTV: newLTV.toFixed(4),
            marginCallRequired: !satisfied,
            marginCallStatus: satisfied ? 'satisfied' : 'pending',
            lastValuationDate: new Date(),
            metadata: {
                ...(pos.metadata || {}),
                marginCallSatisfaction: {
                    date: new Date(),
                    addedValue: addedCollateralValue,
                    newValue,
                    newLTV,
                    satisfied
                }
            },
            updatedAt: new Date()
        })
        .where(eq(loanCollateralMetadata.id, positionId));

    return {
        positionId,
        satisfied,
        newLTV,
        newCollateralValue: newValue,
        message: satisfied ? 'Margin call satisfied' : 'Additional collateral required'
    };
}

/**
 * Revalue collateral (periodic revaluation)
 */
export async function revalueCollateral(userId, positionId, newValue, valuationSource = 'appraisal') {
    const position = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.id, positionId)
        ))
        .limit(1);

    if (position.length === 0) {
        throw new Error('Collateral position not found');
    }

    const pos = position[0];
    const oldValue = parseFloat(pos.currentValue);
    const loanAmount = parseFloat(pos.loanAmount);
    const newLTV = loanAmount / newValue;

    // Calculate next revaluation date
    const revaluationFrequency = pos.revaluationFrequencyDays || 90;
    const nextRevaluationDate = new Date();
    nextRevaluationDate.setDate(nextRevaluationDate.getDate() + revaluationFrequency);

    // Update position
    await db.update(loanCollateralMetadata)
        .set({
            currentValue: newValue.toFixed(2),
            currentLTV: newLTV.toFixed(4),
            lastValuationDate: new Date(),
            valuationSource,
            nextRevaluationDate,
            metadata: {
                ...(pos.metadata || {}),
                valuationHistory: [
                    ...((pos.metadata?.valuationHistory) || []),
                    {
                        date: new Date(),
                        oldValue,
                        newValue,
                        source: valuationSource,
                        ltv: newLTV
                    }
                ]
            },
            updatedAt: new Date()
        })
        .where(eq(loanCollateralMetadata.id, positionId));

    // Check if revaluation triggers any actions
    const evaluation = await evaluateCollateralPosition({
        ...pos,
        currentValue: newValue,
        currentLTV: newLTV
    });

    if (evaluation.actionRequired) {
        await executeCollateralAction({ ...pos, currentValue: newValue, currentLTV: newLTV }, evaluation);
    }

    return {
        positionId,
        oldValue,
        newValue,
        newLTV,
        valuationSource,
        evaluation
    };
}

/**
 * Get collateral positions requiring attention
 */
export async function getPositionsRequiringAttention(userId) {
    const positions = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.isActive, true)
        ));

    const requiresAttention = positions.filter(pos => {
        const currentLTV = parseFloat(pos.currentLTV);
        const alertThreshold = parseFloat(pos.alertThreshold || 0.75);
        return currentLTV >= alertThreshold || pos.marginCallRequired;
    });

    return requiresAttention.map(pos => ({
        id: pos.id,
        debtId: pos.debtId,
        collateralType: pos.collateralType,
        currentLTV: parseFloat(pos.currentLTV),
        marginCallRequired: pos.marginCallRequired,
        marginCallDueDate: pos.marginCallDueDate,
        status: pos.marginCallRequired ? 'margin_call' : 'warning'
    }));
}

/**
 * Get upcoming revaluations
 */
export async function getUpcomingRevaluations(userId, daysAhead = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + daysAhead);

    const positions = await db.select()
        .from(loanCollateralMetadata)
        .where(and(
            eq(loanCollateralMetadata.userId, userId),
            eq(loanCollateralMetadata.isActive, true),
            lt(loanCollateralMetadata.nextRevaluationDate, cutoffDate)
        ));

    return positions.map(pos => ({
        id: pos.id,
        debtId: pos.debtId,
        collateralType: pos.collateralType,
        nextRevaluationDate: pos.nextRevaluationDate,
        daysUntilRevaluation: Math.ceil((new Date(pos.nextRevaluationDate) - new Date()) / (24 * 60 * 60 * 1000))
    }));
}

export default {
    checkAllCollateralPositions,
    satisfyMarginCall,
    revalueCollateral,
    getPositionsRequiringAttention,
    getUpcomingRevaluations
};
