/**
 * Recursive Multi-Sig Engine
 * Evaluates complex approval logic with nested AND/OR conditions
 * Example: "(1 Admin AND 2 Lawyers) OR (5 Family Members)"
 */

import { db } from '../config/db.js';
import { recursiveMultiSigRules, vaultGuardians, guardianVotes } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Create a recursive multi-sig rule for a vault
 * @param {string} vaultId - UUID of vault
 * @param {string} userId - UUID of vault owner
 * @param {object} ruleConfig - Rule configuration
 * @returns {Promise<object>}
 */
export async function createMultiSigRule(vaultId, userId, ruleConfig) {
    const {
        ruleName,
        ruleDescription,
        priority,
        triggerType,
        minAmount,
        maxAmount,
        approvalLogic,
        approvalTimeoutHours,
        requiresUnanimous
    } = ruleConfig;

    // Validate approval logic structure
    validateApprovalLogic(approvalLogic);

    const [rule] = await db.insert(recursiveMultiSigRules).values({
        vaultId,
        userId,
        ruleName,
        ruleDescription,
        priority: priority || 0,
        triggerType,
        minAmount: minAmount?.toString(),
        maxAmount: maxAmount?.toString(),
        approvalLogic,
        approvalTimeoutHours: approvalTimeoutHours || 72,
        requiresUnanimous: requiresUnanimous || false,
        isActive: true
    }).returning();

    console.log(`📜 Multi-sig rule created: ${ruleName} for vault ${vaultId}`);

    return rule;
}

/**
 * Validate approval logic structure
 * @param {object} logic - Approval logic object
 */
function validateApprovalLogic(logic) {
    if (!logic.operator) {
        throw new Error('Approval logic must have an operator (AND, OR, ALL)');
    }

    const validOperators = ['AND', 'OR', 'ALL', 'ANY'];
    if (!validOperators.includes(logic.operator)) {
        throw new Error(`Invalid operator: ${logic.operator}`);
    }

    if (logic.operator === 'AND' || logic.operator === 'OR') {
        if (!Array.isArray(logic.conditions)) {
            throw new Error('AND/OR operators require conditions array');
        }
        // Recursively validate nested conditions
        logic.conditions.forEach(condition => {
            if (condition.operator) {
                validateApprovalLogic(condition);
            } else if (condition.rules) {
                // Leaf node: validate rules array
                condition.rules.forEach(rule => {
                    if (!rule.role || rule.count === undefined) {
                        throw new Error('Rule must have role and count');
                    }
                });
            }
        });
    } else if (logic.operator === 'ALL') {
        if (!Array.isArray(logic.roles)) {
            throw new Error('ALL operator requires roles array');
        }
    }
}

/**
 * Find applicable multi-sig rule for a transaction
 * @param {string} vaultId - UUID of vault
 * @param {string} triggerType - Trigger type
 * @param {number} amount - Transaction amount
 * @returns {Promise<object|null>}
 */
export async function findApplicableRule(vaultId, triggerType, amount) {
    const rules = await db.select()
        .from(recursiveMultiSigRules)
        .where(and(
            eq(recursiveMultiSigRules.vaultId, vaultId),
            eq(recursiveMultiSigRules.triggerType, triggerType),
            eq(recursiveMultiSigRules.isActive, true)
        ))
        .orderBy(db.desc(recursiveMultiSigRules.priority));

    // Find first rule that matches amount range
    for (const rule of rules) {
        const minAmount = parseFloat(rule.minAmount || 0);
        const maxAmount = parseFloat(rule.maxAmount || Infinity);

        if (amount >= minAmount && amount <= maxAmount) {
            return rule;
        }
    }

    return null;
}

/**
 * Evaluate if approval requirements are met
 * @param {string} ruleId - UUID of multi-sig rule
 * @param {string} transactionId - UUID of transaction
 * @returns {Promise<{approved: boolean, details: object}>}
 */
export async function evaluateApprovalStatus(ruleId, transactionId) {
    const [rule] = await db.select()
        .from(recursiveMultiSigRules)
        .where(eq(recursiveMultiSigRules.id, ruleId));

    if (!rule) {
        throw new Error('Multi-sig rule not found');
    }

    // Get all guardian votes for this transaction
    const votes = await db.select()
        .from(guardianVotes)
        .leftJoin(vaultGuardians, eq(guardianVotes.guardianId, vaultGuardians.id))
        .where(and(
            eq(guardianVotes.transactionId, transactionId),
            eq(guardianVotes.voteType, 'approval')
        ));

    const approvals = votes.filter(v => v.guardian_votes.approvalDecision === 'approve');
    const rejections = votes.filter(v => v.guardian_votes.approvalDecision === 'reject');

    // Group approvals by guardian role
    const approvalsByRole = {};
    approvals.forEach(a => {
        const role = a.vault_guardians.guardianRole;
        if (!approvalsByRole[role]) {
            approvalsByRole[role] = [];
        }
        approvalsByRole[role].push({
            guardianId: a.vault_guardians.id,
            guardianName: a.vault_guardians.guardianName,
            approvalWeight: a.vault_guardians.approvalWeight,
            submittedAt: a.guardian_votes.submittedAt
        });
    });

    // Evaluate approval logic
    const result = evaluateLogicNode(rule.approvalLogic, approvalsByRole);

    // Check timeout
    const timeoutHours = rule.approvalTimeoutHours || 72;
    const oldestVote = votes.length > 0 ? 
        Math.min(...votes.map(v => new Date(v.guardian_votes.submittedAt).getTime())) : null;
    
    const timedOut = oldestVote && 
        (Date.now() - oldestVote) > (timeoutHours * 60 * 60 * 1000);

    return {
        approved: result.satisfied,
        requiresUnanimous: rule.requiresUnanimous,
        totalVotes: votes.length,
        approvalCount: approvals.length,
        rejectionCount: rejections.length,
        approvalsByRole,
        details: result,
        timedOut,
        timeoutHours
    };
}

/**
 * Recursively evaluate a logic node
 * @param {object} node - Logic node
 * @param {object} approvalsByRole - Grouped approvals by role
 * @returns {object} Evaluation result
 */
function evaluateLogicNode(node, approvalsByRole) {
    const operator = node.operator;

    if (operator === 'AND') {
        // All conditions must be satisfied
        const results = node.conditions.map(condition => 
            condition.operator ? 
                evaluateLogicNode(condition, approvalsByRole) :
                evaluateRuleSet(condition, approvalsByRole)
        );

        const allSatisfied = results.every(r => r.satisfied);

        return {
            operator: 'AND',
            satisfied: allSatisfied,
            conditions: results
        };
    } else if (operator === 'OR') {
        // At least one condition must be satisfied
        const results = node.conditions.map(condition => 
            condition.operator ? 
                evaluateLogicNode(condition, approvalsByRole) :
                evaluateRuleSet(condition, approvalsByRole)
        );

        const anySatisfied = results.some(r => r.satisfied);

        return {
            operator: 'OR',
            satisfied: anySatisfied,
            conditions: results
        };
    } else if (operator === 'ALL') {
        // All guardians of specified roles must approve
        const results = node.roles.map(role => {
            const count = approvalsByRole[role]?.length || 0;
            return {
                role,
                required: 'all',
                actual: count,
                satisfied: count > 0 // At least 1 for ALL
            };
        });

        return {
            operator: 'ALL',
            satisfied: results.every(r => r.satisfied),
            roleRequirements: results
        };
    } else if (operator === 'ANY') {
        // At least one guardian from specified roles must approve
        const totalCount = node.roles.reduce((sum, role) => 
            sum + (approvalsByRole[role]?.length || 0), 0);

        return {
            operator: 'ANY',
            satisfied: totalCount >= (node.count || 1),
            required: node.count || 1,
            actual: totalCount,
            roles: node.roles
        };
    }

    throw new Error(`Unknown operator: ${operator}`);
}

/**
 * Evaluate a rule set (leaf node in decision tree)
 * @param {object} ruleSet - Rule set with rules array
 * @param {object} approvalsByRole - Grouped approvals by role
 * @returns {object} Evaluation result
 */
function evaluateRuleSet(ruleSet, approvalsByRole) {
    const results = ruleSet.rules.map(rule => {
        const role = rule.role;
        const required = rule.count;
        const useWeight = rule.useWeight || false;

        let actual = 0;
        if (useWeight) {
            // Sum approval weights
            actual = (approvalsByRole[role] || []).reduce((sum, a) => 
                sum + (a.approvalWeight || 1), 0);
        } else {
            // Count approvals
            actual = approvalsByRole[role]?.length || 0;
        }

        return {
            role,
            required,
            actual,
            satisfied: actual >= required,
            useWeight
        };
    });

    // All rules in the set must be satisfied (implicit AND)
    const allSatisfied = results.every(r => r.satisfied);

    return {
        satisfied: allSatisfied,
        rules: results
    };
}

/**
 * Request approval from guardians for a transaction
 * @param {string} vaultId - UUID of vault
 * @param {string} transactionId - UUID of transaction
 * @param {string} triggerType - Trigger type
 * @param {number} amount - Transaction amount
 * @returns {Promise<object>}
 */
export async function requestApproval(vaultId, transactionId, triggerType, amount) {
    // Find applicable rule
    const rule = await findApplicableRule(vaultId, triggerType, amount);

    if (!rule) {
        // No rule found - transaction can proceed without approval
        return {
            requiresApproval: false,
            message: 'No multi-sig rule applies to this transaction'
        };
    }

    // Get guardians who need to approve
    const guardians = await db.select()
        .from(vaultGuardians)
        .where(and(
            eq(vaultGuardians.vaultId, vaultId),
            eq(vaultGuardians.canApproveTransactions, true),
            eq(vaultGuardians.isActive, true)
        ));

    console.log(`📋 Approval requested for transaction ${transactionId}`);
    console.log(`   Rule: ${rule.ruleName}`);
    console.log(`   Eligible guardians: ${guardians.length}`);

    return {
        requiresApproval: true,
        ruleId: rule.id,
        ruleName: rule.ruleName,
        approvalLogic: rule.approvalLogic,
        timeoutHours: rule.approvalTimeoutHours,
        eligibleGuardians: guardians.map(g => ({
            id: g.id,
            name: g.guardianName,
            role: g.guardianRole,
            approvalWeight: g.approvalWeight
        })),
        expiresAt: new Date(Date.now() + rule.approvalTimeoutHours * 60 * 60 * 1000)
    };
}

/**
 * Submit guardian approval/rejection for transaction
 * @param {string} guardianId - UUID of guardian
 * @param {string} transactionId - UUID of transaction
 * @param {string} decision - 'approve' or 'reject'
 * @param {string} comments - Optional comments
 * @returns {Promise<object>}
 */
export async function submitGuardianApproval(guardianId, transactionId, decision, comments) {
    // Check if guardian already voted
    const existing = await db.select()
        .from(guardianVotes)
        .where(and(
            eq(guardianVotes.guardianId, guardianId),
            eq(guardianVotes.transactionId, transactionId),
            eq(guardianVotes.voteType, 'approval')
        ));

    if (existing.length > 0) {
        throw new Error('Guardian has already voted on this transaction');
    }

    // Record vote
    const [vote] = await db.insert(guardianVotes).values({
        guardianId,
        transactionId,
        voteType: 'approval',
        approvalDecision: decision,
        submittedAt: new Date(),
        comments
    }).returning();

    console.log(`🗳️ Guardian vote recorded: ${decision} for transaction ${transactionId}`);

    return vote;
}

/**
 * Get approval status summary
 * @param {string} transactionId - UUID of transaction
 * @returns {Promise<object>}
 */
export async function getApprovalSummary(transactionId) {
    const votes = await db.select()
        .from(guardianVotes)
        .leftJoin(vaultGuardians, eq(guardianVotes.guardianId, vaultGuardians.id))
        .where(and(
            eq(guardianVotes.transactionId, transactionId),
            eq(guardianVotes.voteType, 'approval')
        ));

    return {
        totalVotes: votes.length,
        approvals: votes.filter(v => v.guardian_votes.approvalDecision === 'approve').length,
        rejections: votes.filter(v => v.guardian_votes.approvalDecision === 'reject').length,
        votes: votes.map(v => ({
            guardianName: v.vault_guardians.guardianName,
            guardianRole: v.vault_guardians.guardianRole,
            decision: v.guardian_votes.approvalDecision,
            submittedAt: v.guardian_votes.submittedAt,
            comments: v.guardian_votes.comments
        }))
    };
}

export default {
    createMultiSigRule,
    findApplicableRule,
    evaluateApprovalStatus,
    requestApproval,
    submitGuardianApproval,
    getApprovalSummary
};
