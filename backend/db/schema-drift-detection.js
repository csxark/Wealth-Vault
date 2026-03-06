/**
 * ML Model Drift Detection Schema
 * 
 * Database schema for tracking transaction categorization model drift
 * and implementing automatic retraining mechanisms
 * 
 * Issue #610: Transaction Categorization ML Model Drift Detection
 */

import { pgTable, uuid, text, numeric, timestamp, jsonb, integer, doublePrecision, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users, expenses, categories } from './schema.js';

// Enum for model status
export const modelStatusEnum = pgEnum('model_status', ['active', 'training', 'deprecated', 'failed']);

// Enum for drift severity
export const driftSeverityEnum = pgEnum('drift_severity', ['none', 'low', 'medium', 'high', 'critical']);

// Categorization Predictions - Store ML model predictions with confidence scores
export const categorizationPredictions = pgTable('categorization_predictions', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    expenseId: uuid('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
    
    // Transaction details
    description: text('description').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    
    // ML prediction
    predictedCategoryId: uuid('predicted_category_id').references(() => categories.id, { onDelete: 'set null' }),
    predictedCategoryName: text('predicted_category_name'),
    confidenceScore: doublePrecision('confidence_score').notNull(), // 0.0 to 1.0
    
    // Top N predictions (for analysis)
    topPredictions: jsonb('top_predictions').default([]), // [{ categoryId, categoryName, score }]
    
    // Actual categorization (for validation)
    actualCategoryId: uuid('actual_category_id').references(() => categories.id, { onDelete: 'set null' }),
    actualCategoryName: text('actual_category_name'),
    
    // User feedback
    wasCorrect: boolean('was_correct'),
    userCorrected: boolean('user_corrected').default(false),
    correctedAt: timestamp('corrected_at'),
    
    // Model information
    modelVersion: text('model_version').notNull(),
    modelType: text('model_type').default('gemini'), // gemini, custom_ml, rule_based
    
    // Features used for prediction
    features: jsonb('features').default({
        descriptionTokens: [],
        amount: null,
        merchantName: null,
        timeOfDay: null,
        dayOfWeek: null,
        historicalPattern: null
    }),
    
    // Metadata
    metadata: jsonb('metadata').default({
        processingTimeMs: 0,
        fallbackUsed: false,
        errorOccurred: false
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Model Drift Metrics - Track model performance over time
export const modelDriftMetrics = pgTable('model_drift_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Time window
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    periodType: text('period_type').default('daily').notNull(), // hourly, daily, weekly
    
    // Model version
    modelVersion: text('model_version').notNull(),
    modelType: text('model_type').notNull(),
    
    // Performance metrics
    totalPredictions: integer('total_predictions').default(0).notNull(),
    correctPredictions: integer('correct_predictions').default(0).notNull(),
    incorrectPredictions: integer('incorrect_predictions').default(0).notNull(),
    userCorrectedCount: integer('user_corrected_count').default(0).notNull(),
    
    // Accuracy metrics
    accuracy: doublePrecision('accuracy'), // correctPredictions / totalPredictions
    precision: doublePrecision('precision'),
    recall: doublePrecision('recall'),
    f1Score: doublePrecision('f1_score'),
    
    // Confidence metrics
    avgConfidenceScore: doublePrecision('avg_confidence_score'),
    avgConfidenceCorrect: doublePrecision('avg_confidence_correct'), // Avg confidence when correct
    avgConfidenceIncorrect: doublePrecision('avg_confidence_incorrect'), // Avg confidence when incorrect
    
    // Confidence distribution
    lowConfidenceCount: integer('low_confidence_count').default(0), // < 0.5
    mediumConfidenceCount: integer('medium_confidence_count').default(0), // 0.5 - 0.75
    highConfidenceCount: integer('high_confidence_count').default(0), // > 0.75
    
    // Drift indicators
    driftScore: doublePrecision('drift_score'), // 0.0 to 1.0 (higher = more drift)
    driftSeverity: driftSeverityEnum('drift_severity').default('none'),
    
    // Comparison to baseline
    baselineAccuracy: doublePrecision('baseline_accuracy'),
    accuracyDrift: doublePrecision('accuracy_drift'), // Current - Baseline
    
    // Category-specific performance
    categoryPerformance: jsonb('category_performance').default({}), // { categoryId: { accuracy, count } }
    worstCategories: jsonb('worst_categories').default([]), // Categories with lowest accuracy
    
    // Statistical measures
    predictionVariance: doublePrecision('prediction_variance'),
    confidenceVariance: doublePrecision('confidence_variance'),
    
    // Metadata
    metadata: jsonb('metadata').default({
        dataQuality: 'good',
        missingLabels: 0,
        anomalyCount: 0
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Model Training History - Track retraining events
export const modelTrainingHistory = pgTable('model_training_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Model information
    modelVersion: text('model_version').notNull(),
    modelType: text('model_type').notNull(),
    previousVersion: text('previous_version'),
    
    // Training trigger
    triggerReason: text('trigger_reason').notNull(), // drift_detected, manual, scheduled, accuracy_drop
    driftScoreTrigger: doublePrecision('drift_score_trigger'),
    
    // Training data
    trainingDataCount: integer('training_data_count').notNull(),
    validationDataCount: integer('validation_data_count'),
    
    // Training results
    trainingAccuracy: doublePrecision('training_accuracy'),
    validationAccuracy: doublePrecision('validation_accuracy'),
    testAccuracy: doublePrecision('test_accuracy'),
    
    // Performance comparison
    preTrainingAccuracy: doublePrecision('pre_training_accuracy'),
    postTrainingAccuracy: doublePrecision('post_training_accuracy'),
    accuracyImprovement: doublePrecision('accuracy_improvement'),
    
    // Training metrics
    trainingDurationMs: integer('training_duration_ms'),
    epochs: integer('epochs'),
    learningRate: doublePrecision('learning_rate'),
    
    // Status
    status: modelStatusEnum('status').default('training').notNull(),
    errorMessage: text('error_message'),
    
    // Deployment
    deployedAt: timestamp('deployed_at'),
    isCurrentModel: boolean('is_current_model').default(false),
    
    // Metadata
    hyperparameters: jsonb('hyperparameters').default({}),
    metadata: jsonb('metadata').default({
        categoryCount: 0,
        featureCount: 0,
        modelSize: null
    }),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Categorization Feedback - User feedback for model improvement
export const categorizationFeedback = pgTable('categorization_feedback', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    predictionId: uuid('prediction_id').references(() => categorizationPredictions.id, { onDelete: 'cascade' }).notNull(),
    
    // Feedback type
    feedbackType: text('feedback_type').notNull(), // correction, confirmation, rejection
    
    // Original vs corrected
    originalCategoryId: uuid('original_category_id').references(() => categories.id, { onDelete: 'set null' }),
    correctedCategoryId: uuid('corrected_category_id').references(() => categories.id, { onDelete: 'set null' }),
    
    // User input
    userComment: text('user_comment'),
    confidenceRating: integer('confidence_rating'), // 1-5 how confident user is
    
    // Usage in training
    usedInTraining: boolean('used_in_training').default(false),
    trainingBatchId: uuid('training_batch_id'),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
});

// Drift Detection Config - Per-tenant drift detection settings
export const driftDetectionConfig = pgTable('drift_detection_config', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Thresholds
    driftThreshold: doublePrecision('drift_threshold').default(0.15).notNull(), // 15% accuracy drop
    retrainThreshold: doublePrecision('retrain_threshold').default(0.20).notNull(), // 20% drop triggers retrain
    minPredictionsForDrift: integer('min_predictions_for_drift').default(50).notNull(),
    
    // Monitoring windows
    monitoringWindowDays: integer('monitoring_window_days').default(7).notNull(),
    comparisonBaselineDays: integer('comparison_baseline_days').default(30).notNull(),
    
    // Confidence thresholds
    lowConfidenceThreshold: doublePrecision('low_confidence_threshold').default(0.5),
    highConfidenceThreshold: doublePrecision('high_confidence_threshold').default(0.75),
    
    // Auto-retraining
    autoRetrainEnabled: boolean('auto_retrain_enabled').default(true),
    minTrainingDataSize: integer('min_training_data_size').default(100),
    maxRetrainingFrequencyDays: integer('max_retraining_frequency_days').default(7),
    
    // Notifications
    notifyOnDrift: boolean('notify_on_drift').default(true),
    notifyOnRetrain: boolean('notify_on_retrain').default(true),
    notificationChannels: jsonb('notification_channels').default(['email', 'in-app']),
    
    // Advanced settings
    enableCategorySpecificDrift: boolean('enable_category_specific_drift').default(true),
    enableConfidenceCalibration: boolean('enable_confidence_calibration').default(true),
    
    isActive: boolean('is_active').default(true),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Drift Alerts - Notifications when drift is detected
export const driftAlerts = pgTable('drift_alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    
    // Alert details
    alertType: text('alert_type').notNull(), // drift_detected, accuracy_drop, retrain_recommended, retrain_started
    severity: driftSeverityEnum('severity').notNull(),
    
    // Metrics
    currentAccuracy: doublePrecision('current_accuracy'),
    baselineAccuracy: doublePrecision('baseline_accuracy'),
    driftScore: doublePrecision('drift_score'),
    
    // Model info
    modelVersion: text('model_version'),
    affectedCategories: jsonb('affected_categories').default([]),
    
    // Message
    message: text('message'),
    recommendation: text('recommendation'),
    
    // Action taken
    actionRequired: text('action_required'), // retrain, review, none
    actionTaken: text('action_taken'),
    actionTakenAt: timestamp('action_taken_at'),
    
    // Status
    isActive: boolean('is_active').default(true),
    isDismissed: boolean('is_dismissed').default(false),
    dismissedAt: timestamp('dismissed_at'),
    
    // Notification
    notificationSent: boolean('notification_sent').default(false),
    sentAt: timestamp('sent_at'),
    
    metadata: jsonb('metadata').default({}),
    
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});
