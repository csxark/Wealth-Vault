# Issue #612: Expense Anomaly Detection ML Model - Implementation Guide

## Overview

Real-time machine learning anomaly detection system for expense transactions using hybrid ensemble approach. Enable:
- **Automatic flagging** of suspicious spending patterns
- **Learning from user feedback** to improve detection accuracy
- **Custom rule engine** for domain-specific patterns
- **Per-category models** for personalized baselines
- **Seamless integration** with expense creation workflow

**Status**: ✅ COMPLETED (Schema, Migration, Service, Routes, Tests, Server Integration)

---

## Architecture

### Hybrid ML Approach

The system uses an **ensemble method** combining two complementary approaches:

```javascript
Final Score = (Statistical Z-Score × 0.6) + (Isolation Forest Score × 0.4)
Anomaly Detected if: Final Score ≥ 0.5 (configurable threshold)
```

#### 1. **Statistical Score (60% weight)**
- Calculates Z-score for transaction amount
- Maps deviation ranges to scores:
  - **1 σ** (68% of transactions): 0.25
  - **2 σ** (95% of transactions): 0.60
  - **3 σ** (99.7% of transactions): 0.95
- Captures amount extremism

#### 2. **Isolation Forest Score (40% weight)**
- Statistical anomaly indicator approach
- Evaluates multiple feature deviations:
  - **Amount Deviation**: Difference from 90-day average
  - **Frequency Deviation**: Transactions per day vs. baseline
  - **Temporal Anomalies**: Unusual time-of-day or day-of-week patterns
  - **Weekend Flag**: Different spending on weekends
- Anomaly likelihood increases with deviation count

#### 3. **Rule Engine Layer**
- Custom pattern-based detection rules
- Types: threshold, pattern, ratio
- Overrides ensemble score when rule matches
- Allows domain-specific false positive reduction

### Disease Flow

```
Expense Created
    ↓
Extract Features (amount, temporal, behavioral)
    ↓
Calculate Statistical Score (Z-score)
    ↓
Calculate Isolation Forest Score
    ↓
Evaluate Custom Rules
    ↓
Determine Severity (low/medium/high/critical)
    ↓
If Score ≥ 0.5: Create Detection Record
    ↓
Collect Training Data Automatically
    ↓
Publish Outbox Event for Async Processing
    ↓
Notify User (if critical)
    ↓
User Reviews: Confirm/False Positive/Mark Reviewed
```

---

## Database Schema

### Core Tables

#### 1. **anomalyModels**
Per-category/user isolation forest models with training metadata

```sql
CREATE TABLE anomalyModels (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL (foreign key: tenants),
  userId UUID NOT NULL (foreign key: users),
  categoryId UUID NOT NULL (foreign key: categories),
  modelVersion VARCHAR(10),        -- e.g., "1.0"
  isActive BOOLEAN,               -- Model actively detecting anomalies
  needsRetraining BOOLEAN,        -- Needs ML retraining (drift detected)
  modelParams JSONB,              -- Feature configuration, thresholds
  trainingDataPoints INTEGER,     -- Samples used in latest training
  lastTrainedAt TIMESTAMP,        -- When last trained/updated
  accuracy DECIMAL(5,4),          -- Model accuracy percentage (0-1)
  precision DECIMAL(5,4),         -- True positive rate
  recall DECIMAL(5,4),            -- Coverage rate
  f1Score DECIMAL(5,4),           -- Harmonic mean of precision/recall
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

**Indexes**:
- `(tenantId, userId, categoryId)` - Unique model lookup
- `(tenantId, needsRetraining)` - Find models needing retraining
- `(lastTrainedAt DESC)` - Models ordered by freshness

#### 2. **anomalyDetections**
Detected anomalies with user review workflow

```sql
CREATE TABLE anomalyDetections (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL (foreign key: tenants),
  userId UUID NOT NULL (foreign key: users),
  expenseId UUID NOT NULL (foreign key: expenses),
  categoryId UUID,                -- Expense category
  modelId UUID,                   -- Which model detected it
  ruleIds TEXT[],                 -- Rules that triggered
  anomalyScore DECIMAL(3,2),      -- Final ensemble score (0-1)
  statisticalScore DECIMAL(3,2),  -- Z-score component
  isolationScore DECIMAL(3,2),    -- Isolation forest component
  features JSONB,                 -- Extracted features (amount, temporal, etc.)
  severity VARCHAR(20),           -- low, medium, high, critical (enum)
  status VARCHAR(20),             -- detected, confirmed, false_positive, reviewed
  actionTaken VARCHAR(50),        -- What user did (confirm/reject/review)
  reviewedBy UUID,                -- User who reviewed
  reviewNotes TEXT,               -- User's comments
  reviewedAt TIMESTAMP,           -- When reviewed
  resolvedAt TIMESTAMP,           -- When action taken
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

**Key Enums**:
```javascript
anomaly_severity = ['low', 'medium', 'high', 'critical']
anomaly_status = ['detected', 'confirmed', 'false_positive', 'reviewed', 'dismissed']
```

**Indexes**:
- `(tenantId, userId, status, severity)` - User dashboard queries
- `(expenseId)` - Find detection by expense
- `(createdAt DESC)` - Recent anomalies first
- `(severity)` - Filter by severity

#### 3. **anomalyTrainingData**
Automatically collected labeled training points for model retraining

```sql
CREATE TABLE anomalyTrainingData (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL,
  userId UUID NOT NULL,
  categoryId UUID NOT NULL,
  detectionId UUID,               -- Related anomaly detection (may be null)
  expenseId UUID NOT NULL,        -- The transaction
  features JSONB,                 -- Extracted features
  userLabel VARCHAR(20),          -- What user says (confirmed/false_positive/unclear)
  modelScore DECIMAL(3,2),        -- What model predicted
  validationAccuracy DECIMAL(3,2),-- How accurate was this prediction
  usedInRetraining BOOLEAN,       -- Was this included in last model update
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

**Purpose**: 
- Automatic collection of feedback from user reviews
- Training set for periodic model retraining
- Tracks model performance over time

#### 4. **anomalyRules**
Custom pattern-matching detection rules

```sql
CREATE TABLE anomalyRules (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL,
  userId UUID,                    -- Null for tenant-wide rules
  categoryId UUID,                -- Null for all categories
  ruleName VARCHAR(100),          -- Descriptive name
  description TEXT,               -- What the rule detects
  ruleType VARCHAR(20),           -- threshold, pattern, ratio (enum)
  condition JSONB,                -- {field, operator, value}
  action VARCHAR(20),             -- flag, alert, block, ignore
  severity VARCHAR(20),           -- Alert severity level
  priority INTEGER,               -- Evaluation order
  isActive BOOLEAN,
  timesTriggered INTEGER,         -- How often triggered
  lastTriggeredAt TIMESTAMP,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

**Rule Type Examples**:

```javascript
// Threshold: Single value exceeds limit
{
  field: "amount",
  operator: "gt",
  value: 500
}

// Pattern: Transaction frequency too low/high
{
  field: "frequencyDeviation",
  operator: "gt",
  value: 3  // 3 sigma deviation
}

// Ratio: Expense disproportionate to category average
{
  field: "amountRatio",
  operator: "gt",
  value: 5  // 5x normal amount
}

// Operators: gt, gte, lt, lte, eq, neq, in, contains, matches
```

#### 5. **anomalyStatistics**
Aggregated statistics by time period and category

```sql
CREATE TABLE anomalyStatistics (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL,
  userId UUID NOT NULL,
  categoryId UUID NOT NULL,
  periodType VARCHAR(20),         -- daily, weekly, monthly
  periodStart DATE,
  transactionCount INTEGER,       -- Total transactions in period
  anomalyCount INTEGER,           -- Anomalies detected
  anomalyPercentage DECIMAL(5,2), -- Percentage
  lowSeverity INTEGER,
  mediumSeverity INTEGER,
  highSeverity INTEGER,
  criticalSeverity INTEGER,
  averageScore DECIMAL(3,2),
  maxScore DECIMAL(3,2),
  minScore DECIMAL(3,2),
  confirmedCount INTEGER,         -- Confirmed anomalies
  falsePositiveCount INTEGER,     -- User rejected
  avgReviewTime INTERVAL,         -- Time to user review
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
)
```

**Views**:

```sql
-- Dashboard of recent anomalies
v_recent_anomalies
  - Last 7 days
  - Grouped by severity
  - With expense & category info

-- Model management dashboard
v_models_needing_retraining
  - Models with high error rates
  - Models with drifted patterns
  - Training readiness

-- Rule effectiveness tracking
v_rule_effectiveness
  - Trigger frequency
  - Confirmation rate
  - False positive percentage
```

---

## Service Layer

### anomalyDetectionService.js

Main service handling detection, model management, and statistics.

#### Key Functions

##### 1. **detectAnomaly(expenseId, tenantId)**
Main entry point called during expense creation. Returns detection or null.

```javascript
// Usage
const detection = await anomalyDetectionService.detectAnomaly(
  expenseId,
  tenantId
);

// Response
{
  id: "uuid",
  status: "detected",
  anomalyScore: 0.73,
  severity: "high",
  features: { amount: 500, dayOfWeek: "Wednesday", ... },
  modelId: "uuid"
}
```

**Process**:
1. Fetch expense and 90-day history
2. Extract 8 features from transaction
3. Calculate statistical Z-score (60% weight)
4. Calculate isolation forest score (40% weight)
5. Evaluate custom rules (override if match)
6. Determine severity (0.4=low, 0.6=medium, 0.8=high, 1.0=critical)
7. Create detection record if score ≥ 0.5
8. Auto-collect training data
9. Publish outbox event for notifications

##### 2. **getUnreviewedAnomalies(userId, tenantId, limit)**
Get pending anomalies for user dashboard

```javascript
const anomalies = await anomalyDetectionService.getUnreviewedAnomalies(
  userId,
  tenantId,
  10  // limit
);

// Returns: [{id, expenseId, severity, score, features, created...}, ...]
```

##### 3. **reviewAnomaly(detectionId, userId, tenantId, action, notes)**
User confirms/rejects anomaly

```javascript
const reviewed = await anomalyDetectionService.reviewAnomaly(
  detectionId,
  userId,
  tenantId,
  "false_positive",  // or "confirmed" or "mark_reviewed"
  "This is a legitimate purchase"
);

// Returns: Updated detection with status='reviewed'
```

**Effects**:
- Triggers automatic training data collection
- Marks model for retraining if drift detected
- Updates statistics
- Publishes event for notifications

##### 4. **getAnomalyStats(userId, categoryId, tenantId, periodType)**
Query aggregated statistics

```javascript
const stats = await anomalyDetectionService.getAnomalyStats(
  userId,
  categoryId,
  tenantId,
  "daily"  // or "weekly", "monthly"
);

// Returns: {
//   transactionCount: 15,
//   anomalyCount: 2,
//   anomalyPercentage: 13.33,
//   severity: { low: 1, medium: 1, high: 0, critical: 0 },
//   avgScore: 0.62,
//   confirmedRate: 50
// }
```

##### 5. **getModelsForRetraining(tenantId)**
Find models that need retraining

```javascript
const models = await anomalyDetectionService.getModelsForRetraining(
  tenantId
);

// Returns: [{ id, userId, categoryId, accuracy, needsRetraining }, ...]
```

#### Feature Extraction

Automatically extracts 8 features per transaction:

```javascript
{
  amount: 500.00,              // Transaction amount
  dayOfWeek: 3,                // 0=Sunday, 6=Saturday
  hourOfDay: 14,               // 0-23 hour
  isWeekend: false,            // Saturday or Sunday
  amountDeviation: 2.3,        // Sigma units from mean
  frequencyDeviation: 1.5,     // Transactions/day vs baseline
  isNewCategory: false,        // Category < 30 days old
  isMerchantAnomaly: false     // Unusual merchant for category
}
```

#### Scoring Algorithm

**Statistical Score**:
```
if |amount - mean| <= σ:   score = 0.25
if |amount - mean| <= 2σ:  score = 0.60
if |amount - mean| <= 3σ:  score = 0.95
else:                        score = 1.00
```

**Isolation Forest Score**:
```
anomalyEvents = 0
if amountDeviation > 2.5:    anomalyEvents += 1
if frequencyDeviation > 2.0: anomalyEvents += 1
if isWeekendUnusual:         anomalyEvents += 0.5
if isNewCategory:            anomalyEvents += 0.3

score = min(anomalyEvents / 3, 1.0)
```

**Final Score**:
```
final = (statisticalScore × 0.6) + (isolationScore × 0.4)
severity = categorizeScore(final)
  < 0.4:  "low"
  < 0.6:  "medium"
  < 0.8:  "high"
  >= 0.8: "critical"
```

---

## API Routes

Base URL: `/api/anomalies`

### Endpoints

#### 1. **GET /unreviewed**
List pending anomalies for authenticated user

```bash
GET /api/anomalies/unreviewed?limit=20&severity=high

Response:
{
  "success": true,
  "data": {
    "anomalies": [
      {
        "id": "uuid",
        "expenseId": "uuid",
        "amount": "500.00",
        "description": "Electronics purchase",
        "category": "Electronics",
        "severity": "high",
        "anomalyScore": 0.73,
        "detectedAt": "2024-01-15T10:30:00Z",
        "actionRequired": true
      },
      ...
    ],
    "total": 5,
    "unreviewed": 3
  }
}
```

**Query Parameters**:
- `limit` (optional, default=20): Results per page
- `severity` (optional): Filter by "low", "medium", "high", "critical"
- `categoryId` (optional): Filter by category

#### 2. **POST /:detectionId/review**
Mark anomaly as confirmed, false positive, or reviewed

```bash
POST /api/anomalies/uuid/review

Body:
{
  "action": "false_positive",  // "confirmed", "false_positive", "mark_reviewed"
  "notes": "This is a legitimate purchase"  // Optional
}

Response:
{
  "success": true,
  "data": {
    "detection": {
      "id": "uuid",
      "status": "reviewed",
      "actionTaken": "false_positive",
      "reviewedBy": "userId",
      "reviewedAt": "2024-01-15T10:35:00Z"
    }
  }
}
```

#### 3. **GET /stats**
Get anomaly statistics by period

```bash
GET /api/anomalies/stats?categoryId=uuid&periodType=daily

Response:
{
  "success": true,
  "data": {
    "stats": {
      "transactionCount": 150,
      "anomalyCount": 12,
      "anomalyPercentage": 8.0,
      "severity": {
        "low": 4,
        "medium": 5,
        "high": 3,
        "critical": 0
      },
      "averageScore": 0.58,
      "confirmedRate": 41.67,
      "falsePositiveRate": 33.33
    }
  }
}
```

**Query Parameters**:
- `categoryId` (optional): Filter by category
- `periodType` (optional, default="daily"): "daily", "weekly", "monthly"

#### 4. **GET /rules**
List all active detection rules

```bash
GET /api/anomalies/rules

Response:
{
  "success": true,
  "data": {
    "rules": [
      {
        "id": "uuid",
        "ruleName": "Premium Electronics Alert",
        "description": "Alert if single purchase exceeds $500",
        "ruleType": "threshold",
        "condition": { field: "amount", operator: "gt", value: 500 },
        "severity": "high",
        "isActive": true,
        "timesTriggered": 12
      },
      ...
    ]
  }
}
```

#### 5. **POST /rules**
Create custom detection rule

```bash
POST /api/anomalies/rules

Body:
{
  "ruleName": "Grocery Spike Alert",
  "description": "Alert if grocery spending 3x normal",
  "ruleType": "ratio",
  "condition": {
    "field": "amountRatio",
    "operator": "gt",
    "value": 3
  },
  "action": "flag",
  "severity": "high"
}

Response:
{
  "success": true,
  "data": {
    "rule": {
      "id": "uuid",
      "ruleName": "Grocery Spike Alert",
      "isActive": true,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Rule Types** (ruleType):
- `threshold`: Single field exceeds value
- `pattern`: Temporal or categorical pattern
- `ratio`: Relative to category average

**Operators**: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`, `in`, `contains`

#### 6. **PATCH /rules/:ruleId**
Update rule configuration

```bash
PATCH /api/anomalies/rules/uuid

Body:
{
  "isActive": false,
  "priority": 20,
  "description": "Updated description"
}

Response:
{
  "success": true,
  "data": { "rule": { ... } }
}
```

#### 7. **DELETE /rules/:ruleId**
Soft delete rule (marks inactive)

```bash
DELETE /api/anomalies/rules/uuid

Response:
{
  "success": true,
  "message": "Rule deleted successfully"
}
```

---

## Integration Points

### Automated Calls

#### During Expense Creation
```javascript
// Called automatically in POST /api/expenses
const detection = await anomalyDetectionService.detectAnomaly(
  createdExpenseId,
  tenantId
);
// Non-blocking async call - doesn't delay response
```

#### Job: Model Retraining (Scheduled)
```javascript
// Runs periodically to retrain drifted models
// Identifies models flagged by check_retraining_trigger()
// Uses anomalyTrainingData for training set
```

#### Job: Outbox Dispatcher
```javascript
// Publishes anomaly detection events
// Triggers notifications, dashboards, integrations
```

### Manual Calls

#### In Frontend
```javascript
// Get anomalies dashboard
const anomalies = await fetch('/api/anomalies/unreviewed')

// Review anomaly
await fetch(`/api/anomalies/${detectionId}/review`, {
  method: 'POST',
  body: JSON.stringify({
    action: 'false_positive',
    notes: 'Legitimate purchase'
  })
})

// Create custom rule
await fetch('/api/anomalies/rules', {
  method: 'POST',
  body: JSON.stringify({
    ruleName: 'High Transfer Alert',
    ruleType: 'threshold',
    condition: { field: 'amount', operator: 'gt', value: 5000 }
  })
})
```

---

## Testing

**Test File**: `backend/__tests__/anomalyDetection.test.js`

Comprehensive test suite covering:

```javascript
describe('Anomaly Detection Service - Real-Time ML Detection', () => {
  // Basic Operations
  - Should detect high-value anomaly
  - Should not flag normal transactions
  - Should create anomaly model on first detection
  - Should extract correct features

  // Review Workflow
  - Should review anomaly as false positive
  - Should review anomaly as confirmed fraud
  - Should get unreviewed anomalies for user

  // Rule-Based Detection
  - Should create custom anomaly detection rule
  - Should trigger on rule condition match
  - Should update rule trigger count

  // Model Management
  - Should mark model for retraining
  - Should get models needing retraining

  // Statistics
  - Should get anomaly statistics for category

  // Edge Cases
  - Should handle missing categories
  - Should handle very small amounts
  - Should handle insufficient history
})
```

**Run Tests**:
```bash
npm test -- anomalyDetection.test.js
```

---

## Configuration

### Model Parameters

Per-model configuration stored in `anomalyModels.modelParams`:

```javascript
{
  "featureWeights": {
    "amount": 0.4,
    "frequency": 0.3,
    "temporal": 0.2,
    "category": 0.1
  },
  "thresholds": {
    "anomalyScore": 0.5,
    "retrainingThreshold": 0.15,  // 15% error rate triggers retraining
    "minimumHistory": 20  // Minimum transactions for model
  },
  "trainingWindow": 90,  // Days of historical data
  "modelVersion": "1.0"
}
```

### Global Settings (Environment)

```bash
# Anomaly Detection Configuration
ANOMALY_DETECTION_ENABLED=true
ANOMALY_SCORE_THRESHOLD=0.5
ANOMALY_RETRAINING_FREQUENCY=7  # Days between auto-retraining
MAX_ANOMALY_RETENTION=90  # Days to keep detection records
ANOMALY_NOTIFICATION_THRESHOLD=high  # Severity for notifications (low/medium/high/critical)
```

### Customization per User

Users can customize:
1. **Detection Sensitivity** (0.3-0.7 threshold)
2. **Custom Rules** (create domain-specific pattern rules)
3. **Category Models** (train separate models per category)
4. **Notification Preferences** (which severities to alert)

---

## Performance Considerations

### Optimization Techniques

1. **Model Caching**
   - 1-hour TTL on anomalyModels cache
   - Reduces database hits on repeated detections

2. **Feature Extraction Optimization**
   - Uses pre-aggregated category statistics
   - 90-day window avoids expensive full scans
   - Composite indexes on (categoryId, createdAt)

3. **Batch Rule Evaluation**
   - Rules evaluated in priority order
   - Short-circuit on first match
   - Index on (isActive, priority)

4. **Statistics Aggregation**
   - Automatic calculation via trigger
   - Pre-computed via periodically scheduled job
   - Minimal denormalization for dashboard queries

### Query Performance

**Expected Latencies**:
- `detectAnomaly()`: 50-150ms (for typical category with 300 transactions)
- `getUnreviewedAnomalies()`: 10-50ms (with pagination)
- `getAnomalyStats()`: 20-100ms (with aggregation)

**Indexes**:
```sql
-- Primary lookup paths
CREATE INDEX idx_anomaly_models_user_category 
  ON anomalyModels(tenantId, userId, categoryId);

CREATE INDEX idx_anomaly_detections_user_status 
  ON anomalyDetections(tenantId, userId, status, severity);

CREATE INDEX idx_anomaly_detections_expense 
  ON anomalyDetections(expenseId);

CREATE INDEX idx_anomaly_training_category 
  ON anomalyTrainingData(categoryId, createdAt DESC);
```

---

## Troubleshooting

### Common Issues

#### 1. **Too Many False Positives**

**Symptom**: Normal transactions flagged as anomalies

**Solutions**:
- Create custom rules to exclude known patterns:
  ```javascript
  {
    ruleName: "Exclude Known Merchants",
    condition: { field: "merchantId", operator: "in", value: [knownIds] }
  }
  ```
- Adjust global threshold: Increase from 0.5 to 0.6+
- Train category-specific models with more data (wait 90+ days)

#### 2. **Model Not Learning**

**Symptom**: Accuracy not improving, model marked for retraining repeatedly

**Solutions**:
- Check `anomalyTrainingData` - ensure users are reviewing anomalies
- Verify `modelParams.minimumHistory` setting (default 20 transactions)
- Review category stats - may have insufficient data
- Check `lastTrainedAt` - ensure retraining job is running

#### 3. **Performance Degradation**

**Symptom**: `detectAnomaly()` calls slow down over time

**Solutions**:
- Check cache hit rate on `anomalyModels`
- Verify indexes exist (especially composite indexes)
- Review query logs for slow category queries (90 days of history)
- Archive old anomaly records (> 365 days)

### Debug Logging

Enable detailed logging:

```javascript
// In anomalyDetectionService.js
const DEBUG = true;

if (DEBUG) {
  console.log('Feature extraction:', features);
  console.log('Statistical score:', statScore);
  console.log('Isolation score:', isolationScore);
  console.log('Final score:', finalScore);
  console.log('Rules evaluated:', rulesMatched);
}
```

---

## Future Enhancements

### Phase 2 Improvements

1. **Advanced ML Models**
   - Local Outlier Factor (LOF) for density-based detection
   - Seasonal ARIMA for time-series patterns
   - XGBoost ensemble with feature importance

2. **Explainability**
   - SHAP values showing which features contributed to anomaly
   - "Why flagged?" explanations in UI
   - Feature importance graphs per model

3. **Customization**
   - Per-user sensitivity slider (affects threshold)
   - Category-specific sensitivity (high for luxury, low for utilities)
   - Merchant whitelist/blacklist management

4. **Integration**
   - Webhook notifications for external systems
   - ML model export for offline analysis
   - Anomaly APIs for third-party apps

5. **Monitoring**
   - Alert if model accuracy drops below threshold
   - Drift detection metrics dashboard
   - Training job automated retraining with metrics

---

## References

### Files Created/Modified

**Created**:
- `backend/db/schema-anomaly-detection.js` - Schema with 5 tables
- `backend/drizzle/0014_expense_anomaly_detection.sql` - Migration
- `backend/services/anomalyDetectionService.js` - Core service
- `backend/routes/anomalies.js` - REST API routes
- `backend/__tests__/anomalyDetection.test.js` - Test suite
- `ANOMALY_DETECTION_IMPLEMENTATION.md` - This guide

**Modified**:
- `backend/server.js` - Added anomalyRoutes import and registration
- `backend/db/schema.js` - Added schema-anomaly-detection.js export
- `backend/routes/expenses.js` - Added anomaly detection call on creation

### Related Issues

- **#609**: Time-series forecasting with confidence intervals
- **#610**: Model drift detection monitoring
- **#611**: Goal sharing with RBAC
- **#612**: Expense anomaly detection (this issue)

---

## Summary

Issue #612 implements real-time ML anomaly detection for expense transactions using:
- **Hybrid ensemble** (statistical + isolation forest) scoring
- **Per-category models** for personalized baselines
- **Rule engine** for domain-specific patterns
- **Automatic training data** collection from user feedback
- **Complete API** for review workflow and rule management
- **Seamless integration** with expense creation
- **Comprehensive tests** and documentation

The system enables users to automatically flag suspicious spending patterns in real-time while learning from feedback to improve accuracy over time.
