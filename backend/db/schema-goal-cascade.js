import { pgTable, uuid, text, boolean, integer, numeric, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { goals, users, tenants } from './schema.js';

/**
 * GOAL CASCADE RISK PROPAGATION ENGINE - Issue #731
 * 
 * Tracks explicit goal dependencies and propagates deadline/funding impacts
 * when upstream goals slip, enabling automated risk assessment and mitigation planning.
 */

// ============================================================================
// GOAL DEPENDENCIES - Instance-Level Goal Relationships
// ============================================================================

/**
 * Goal Dependencies - Explicit relationships between specific goal instances
 * 
 * Example: "Home Down Payment" depends on "Emergency Fund" reaching $10k
 * When Emergency Fund slips, Home Down Payment timeline is automatically impacted
 */
export const goalDependencies = pgTable('goal_dependencies', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Dependency Relationship
    upstreamGoalId: uuid('upstream_goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(), // Goal that must complete first
    downstreamGoalId: uuid('downstream_goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(), // Goal that depends on upstream
    
    // Dependency Constraints
    dependencyType: text('dependency_type').default('sequential').notNull(), // sequential, partial, funding_priority
    requiredProgress: numeric('required_progress', { precision: 5, scale: 2 }).default('100.00'), // Upstream % needed before downstream can start
    fundingImpact: numeric('funding_impact', { precision: 5, scale: 2 }).default('0.00'), // % of monthly funds upstream takes from downstream
    
    // Blocking Configuration
    isBlocking: boolean('is_blocking').default(true), // Does upstream delay downstream start?
    allowParallelProgress: boolean('allow_parallel_progress').default(false), // Can both progress simultaneously?
    
    // Relationship Metadata
    relationshipReason: text('relationship_reason'), // Why these goals are linked
    createdBy: text('created_by').default('user'), // user, system, auto_detected
    strength: text('strength').default('hard'), // hard (must follow), soft (recommended), advisory
    
    // Status
    isActive: boolean('is_active').default(true),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_goal_dependencies_user').on(table.userId),
    upstreamIdx: index('idx_goal_dependencies_upstream').on(table.upstreamGoalId),
    downstreamIdx: index('idx_goal_dependencies_downstream').on(table.downstreamGoalId),
    activeIdx: index('idx_goal_dependencies_active').on(table.isActive),
}));

// ============================================================================
// CASCADE IMPACT ANALYSIS - Propagation Results
// ============================================================================

/**
 * Goal Cascade Analyses - Results of cascade propagation when goals slip
 * 
 * Records: Which goals are affected, by how much, and what mitigations are suggested
 */
export const goalCascadeAnalyses = pgTable('goal_cascade_analyses', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Trigger Information
    triggerGoalId: uuid('trigger_goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(), // Goal that slipped
    triggerEvent: text('trigger_event').notNull(), // deadline_miss, progress_decline, funding_reduction, manual_trigger
    triggerSeverity: text('trigger_severity').default('medium'), // low, medium, high, critical
    
    // Analysis Scope
    analysisDepth: integer('analysis_depth').default(3), // How many dependency levels analyzed
    totalAffectedGoals: integer('total_affected_goals').default(0),
    directAffectedCount: integer('direct_affected_count').default(0), // First-level dependencies
    indirectAffectedCount: integer('indirect_affected_count').default(0), // Second+ level
    
    // Impact Summary
    totalDeadlineSlipDays: integer('total_deadline_slip_days').default(0), // Cumulative days across all goals
    maxDeadlineSlipDays: integer('max_deadline_slip_days').default(0), // Worst single goal impact
    totalFundingGapAmount: numeric('total_funding_gap_amount', { precision: 15, scale: 2 }).default('0.00'),
    
    // Risk Assessment
    cascadeRiskScore: integer('cascade_risk_score').default(0), // 0-100 risk score
    riskLevel: text('risk_level').default('low'), // low, medium, high, severe
    criticalPathsAffected: integer('critical_paths_affected').default(0),
    
    // Mitigation Summary
    mitigationStrategiesCount: integer('mitigation_strategies_count').default(0),
    autoResolvable: boolean('auto_resolvable').default(false), // Can system auto-adjust?
    requiresUserIntervention: boolean('requires_user_intervention').default(true),
    estimatedResolutionDays: integer('estimated_resolution_days'),
    
    // Analysis Results (JSON)
    impactGraph: jsonb('impact_graph').default('{}'), // Dependency graph with impacts
    affectedGoalsDetails: jsonb('affected_goals_details').default('[]'), // [{goalId, impact, newDeadline}]
    cascadePath: jsonb('cascade_path').default('[]'), // Ordered list of propagation
    
    // Status
    analysisStatus: text('analysis_status').default('completed'), // pending, in_progress, completed, failed
    acknowledgedAt: timestamp('acknowledged_at'),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_goal_cascade_analyses_user').on(table.userId),
    triggerGoalIdx: index('idx_goal_cascade_analyses_trigger').on(table.triggerGoalId),
    severityIdx: index('idx_goal_cascade_analyses_severity').on(table.triggerSeverity),
    statusIdx: index('idx_goal_cascade_analyses_status').on(table.analysisStatus),
    createdAtIdx: index('idx_goal_cascade_analyses_created').on(table.createdAt),
}));

// ============================================================================
// CASCADED GOAL IMPACTS - Per-Goal Impact Details
// ============================================================================

/**
 * Cascaded Goal Impacts - Detailed impact on each affected downstream goal
 * 
 * One record per affected goal in a cascade analysis
 */
export const cascadedGoalImpacts = pgTable('cascaded_goal_impacts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Relationship
    cascadeAnalysisId: uuid('cascade_analysis_id').references(() => goalCascadeAnalyses.id, { onDelete: 'cascade' }).notNull(),
    affectedGoalId: uuid('affected_goal_id').references(() => goals.id, { onDelete: 'cascade' }).notNull(),
    
    // Impact Details
    impactLevel: text('impact_level').default('medium'), // negligible, low, medium, high, severe
    propagationDepth: integer('propagation_depth').default(1), // 1 = direct dependent, 2+ = indirect
    
    // Deadline Impact
    originalDeadline: timestamp('original_deadline').notNull(),
    revisedDeadline: timestamp('revised_deadline').notNull(),
    deadlineSlipDays: integer('deadline_slip_days').notNull(),
    deadlineSlipPercentage: numeric('deadline_slip_percentage', { precision: 5, scale: 2 }),
    
    // Funding Impact
    originalMonthlyContribution: numeric('original_monthly_contribution', { precision: 12, scale: 2 }).default('0.00'),
    revisedMonthlyContribution: numeric('revised_monthly_contribution', { precision: 12, scale: 2 }).default('0.00'),
    contributionChangeDelta: numeric('contribution_change_delta', { precision: 12, scale: 2 }).default('0.00'),
    contributionChangePercentage: numeric('contribution_change_percentage', { precision: 5, scale: 2 }),
    
    // Feasibility Assessment
    remainsFeasible: boolean('remains_feasible').default(true),
    feasibilityScore: numeric('feasibility_score', { precision: 5, scale: 2 }).default('100.00'), // 0-100
    conflictingGoalsCount: integer('conflicting_goals_count').default(0),
    
    // Explanation
    impactReason: text('impact_reason'), // Natural language explanation
    propagationChain: jsonb('propagation_chain').default('[]'), // [{goalId, relationship}] path
    
    // Mitigation
    hasMitigation: boolean('has_mitigation').default(false),
    mitigationApplied: boolean('mitigation_applied').default(false),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    cascadeIdx: index('idx_cascaded_impacts_cascade').on(table.cascadeAnalysisId),
    goalIdx: index('idx_cascaded_impacts_goal').on(table.affectedGoalId),
    userIdx: index('idx_cascaded_impacts_user').on(table.userId),
    impactLevelIdx: index('idx_cascaded_impacts_level').on(table.impactLevel),
}));

// ============================================================================
// CASCADE MITIGATION STRATEGIES - Suggested Actions
// ============================================================================

/**
 * Cascade Mitigation Strategies - Recommended actions to resolve cascade impacts
 * 
 * Generated for each cascade analysis with actionable steps
 */
export const cascadeMitigationStrategies = pgTable('cascade_mitigation_strategies', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Association
    cascadeAnalysisId: uuid('cascade_analysis_id').references(() => goalCascadeAnalyses.id, { onDelete: 'cascade' }).notNull(),
    impactId: uuid('impact_id').references(() => cascadedGoalImpacts.id, { onDelete: 'cascade' }), // Optional: specific to one impact
    
    // Strategy Details
    strategyType: text('strategy_type').notNull(), // extend_deadline, increase_funding, reprioritize, reduce_target, adjust_dependencies, pause_goal
    strategyTitle: text('strategy_title').notNull(),
    strategyDescription: text('strategy_description').notNull(),
    
    // Action Plan
    requiredActions: jsonb('required_actions').default('[]'), // [{action, goalId, parameter, value}]
    affectedGoals: jsonb('affected_goals').default('[]'), // [{goalId, changeType, oldValue, newValue}]
    
    // Effectiveness Metrics
    resolvesSeverity: text('resolves_severity').default('full'), // full, partial, minimal
    reducesRiskBy: numeric('reduces_risk_by', { precision: 5, scale: 2 }).default('0.00'), // % risk reduction
    estimatedRecoveryDays: integer('estimated_recovery_days'),
    
    // Cost-Benefit
    implementationDifficulty: text('implementation_difficulty').default('medium'), // easy, medium, hard, very_hard
    budgetImpact: numeric('budget_impact', { precision: 12, scale: 2 }).default('0.00'), // Monthly budget change
    tradeoffs: jsonb('tradeoffs').default('[]'), // [{description, severity}]
    
    // Recommendation
    recommendationScore: numeric('recommendation_score', { precision: 5, scale: 2 }).default('50.00'), // 0-100 suitability
    isPrimaryRecommendation: boolean('is_primary_recommendation').default(false),
    alternativeToStrategyId: uuid('alternative_to_strategy_id').references(() => cascadeMitigationStrategies.id, { onDelete: 'set null' }),
    
    // Execution
    isApplied: boolean('is_applied').default(false),
    appliedAt: timestamp('applied_at'),
    appliedBy: uuid('applied_by').references(() => users.id, { onDelete: 'set null' }),
    applicationResult: jsonb('application_result').default('{}'), // Outcome after applying
    
    // Status
    isActive: boolean('is_active').default(true),
    expiresAt: timestamp('expires_at'), // Mitigation validity window
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    cascadeIdx: index('idx_cascade_mitigations_cascade').on(table.cascadeAnalysisId),
    userIdx: index('idx_cascade_mitigations_user').on(table.userId),
    typeIdx: index('idx_cascade_mitigations_type').on(table.strategyType),
    primaryIdx: index('idx_cascade_mitigations_primary').on(table.isPrimaryRecommendation),
}));

// ============================================================================
// CASCADE DETECTION TRIGGERS - Automated Monitoring
// ============================================================================

/**
 * Cascade Detection Triggers - Rules for when to run cascade analysis
 * 
 * Monitors goal progress and automatically triggers cascade analysis
 */
export const cascadeDetectionTriggers = pgTable('cascade_detection_triggers', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Trigger Configuration
    triggerName: text('trigger_name').notNull(),
    triggerType: text('trigger_type').notNull(), // progress_decline, deadline_miss, funding_cut, dependency_change
    
    // Conditions
    thresholdType: text('threshold_type').notNull(), // percentage, days, amount, count
    thresholdValue: numeric('threshold_value', { precision: 12, scale: 2 }).notNull(),
    comparisonOperator: text('comparison_operator').default('less_than'), // less_than, greater_than, equals, not_equals
    
    // Scope
    appliesToGoalId: uuid('applies_to_goal_id').references(() => goals.id, { onDelete: 'cascade' }), // Specific goal or NULL for all
    appliesToGoalTypes: jsonb('applies_to_goal_types').default('[]'), // Filter by goal type
    
    // Frequency Control
    checkFrequencyin: text('check_frequency').default('daily'), // hourly, daily, weekly, realtime
    minTimeBetweenTriggers: integer('min_time_between_triggers').default(24), // Hours
    lastTriggeredAt: timestamp('last_triggered_at'),
    
    // Action
    autoRunAnalysis: boolean('auto_run_analysis').default(true),
    notifyUser: boolean('notify_user').default(true),
    notificationSeverity: text('notification_severity').default('medium'),
    
    // Status
    isEnabled: boolean('is_enabled').default(true),
    triggerCount: integer('trigger_count').default(0),
    lastTriggerAnalysisId: uuid('last_trigger_analysis_id').references(() => goalCascadeAnalyses.id, { onDelete: 'set null' }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_cascade_triggers_user').on(table.userId),
    enabledIdx: index('idx_cascade_triggers_enabled').on(table.isEnabled),
    typeIdx: index('idx_cascade_triggers_type').on(table.triggerType),
}));

// ============================================================================
// CASCADE NOTIFICATION QUEUE - User Alerts
// ============================================================================

/**
 * Cascade Notification Queue - Pending notifications about cascade events
 * 
 * Tracks which cascade analyses need user attention
 */
export const cascadeNotificationQueue = pgTable('cascade_notification_queue', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    
    // Notification Content
    cascadeAnalysisId: uuid('cascade_analysis_id').references(() => goalCascadeAnalyses.id, { onDelete: 'cascade' }).notNull(),
    notificationType: text('notification_type').default('cascade_detected'), // cascade_detected, mitigation_suggested, critical_impact
    priority: text('priority').default('medium'), // low, medium, high, urgent
    
    // Message
    title: text('title').notNull(),
    message: text('message').notNull(),
    actionUrl: text('action_url'), // Deep link to cascade details
    
    // Delivery Status
    deliveryStatus: text('delivery_status').default('pending'), // pending, sent, delivered, read, dismissed
    sentAt: timestamp('sent_at'),
    readAt: timestamp('read_at'),
    dismissedAt: timestamp('dismissed_at'),
    
    // Delivery Channels
    deliverViaEmail: boolean('deliver_via_email').default(false),
    deliverViaPush: boolean('deliver_via_push').default(true),
    deliverViaInApp: boolean('deliver_via_in_app').default(true),
    
    // Tracking
    retryCount: integer('retry_count').default(0),
    lastRetryAt: timestamp('last_retry_at'),
    expiresAt: timestamp('expires_at'), // Auto-dismiss after this
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
    userIdx: index('idx_cascade_notifications_user').on(table.userId),
    statusIdx: index('idx_cascade_notifications_status').on(table.deliveryStatus),
    priorityIdx: index('idx_cascade_notifications_priority').on(table.priority),
    createdAtIdx: index('idx_cascade_notifications_created').on(table.createdAt),
}));

export default {
    goalDependencies,
    goalCascadeAnalyses,
    cascadedGoalImpacts,
    cascadeMitigationStrategies,
    cascadeDetectionTriggers,
    cascadeNotificationQueue,
};
