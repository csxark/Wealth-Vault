# Smart Budget Auto-Adjuster with ML-Based Spending Predictions

## Overview

The Smart Budget Auto-Adjuster uses machine learning algorithms to analyze historical spending patterns, predict future expenses, and automatically adjust budgets to optimize financial planning. It provides AI-powered insights, anomaly detection, and intelligent budget recommendations.

## Features

### 1. **ML-Based Spending Predictions** 🤖
- **ARIMA Model**: Time series forecasting with trend and seasonality
- **Moving Average**: Simple yet effective short-term predictions
- **Prophet**: Facebook's forecasting model for complex patterns
- **LSTM**: Deep learning for advanced pattern recognition

### 2. **Auto-Budget Adjustment** 📊
- **Conservative Mode**: Max 10% adjustment, requires 6+ months data
- **Moderate Mode**: Max 20% adjustment, requires 4+ months data
- **Aggressive Mode**: Max 40% adjustment, requires 3+ months data

### 3. **Pattern Recognition** 🔍
- **Seasonal Patterns**: Detect recurring monthly/quarterly trends
- **Trending Patterns**: Identify increasing/decreasing spending
- **Cyclical Patterns**: Recognize regular spending cycles
- **Irregular Patterns**: Flag unpredictable spending behavior

### 4. **Anomaly Detection** ⚠️
- Real-time spending anomaly alerts
- Statistical outlier detection (2σ threshold)
- Severity classification (low, medium, high, critical)
- Actionable recommendations

### 5. **AI-Generated Insights** 💡
- Overspending alerts
- Saving opportunities
- Budget optimization suggestions
- Trend analysis and forecasts

## Database Schema

### Budget Predictions Table
```sql
CREATE TABLE budget_predictions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  prediction_month TIMESTAMP NOT NULL,
  predicted_amount NUMERIC(12,2) NOT NULL,
  actual_amount NUMERIC(12,2),
  confidence_score DOUBLE PRECISION DEFAULT 0.85,
  model_type TEXT DEFAULT 'arima',
  seasonal_factor DOUBLE PRECISION DEFAULT 1.0,
  trend_factor DOUBLE PRECISION DEFAULT 1.0,
  variance DOUBLE PRECISION,
  upper_bound NUMERIC(12,2),
  lower_bound NUMERIC(12,2),
  accuracy DOUBLE PRECISION,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Spending Patterns Table
```sql
CREATE TABLE spending_patterns (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  pattern_type TEXT NOT NULL,
  frequency TEXT,
  average_amount NUMERIC(12,2) NOT NULL,
  median_amount NUMERIC(12,2),
  standard_deviation DOUBLE PRECISION,
  min_amount NUMERIC(12,2),
  max_amount NUMERIC(12,2),
  growth_rate DOUBLE PRECISION,
  seasonality_index JSONB DEFAULT '{}',
  anomaly_count INTEGER DEFAULT 0,
  last_anomaly TIMESTAMP,
  data_points INTEGER DEFAULT 0,
  analysis_start_date TIMESTAMP NOT NULL,
  analysis_end_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Budget Adjustments Table
```sql
CREATE TABLE budget_adjustments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  adjustment_type TEXT NOT NULL,
  previous_amount NUMERIC(12,2) NOT NULL,
  new_amount NUMERIC(12,2) NOT NULL,
  adjustment_percentage DOUBLE PRECISION,
  reason TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 0.8,
  applied_at TIMESTAMP,
  status TEXT DEFAULT 'pending',
  triggered_by TEXT DEFAULT 'system',
  effective_month TIMESTAMP NOT NULL,
  recommendations JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Category Insights Table
```sql
CREATE TABLE category_insights (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  category_id UUID REFERENCES categories(id),
  insight_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  current_value NUMERIC(12,2),
  expected_value NUMERIC(12,2),
  deviation DOUBLE PRECISION,
  actionable BOOLEAN DEFAULT true,
  suggested_actions JSONB DEFAULT '[]',
  potential_savings NUMERIC(12,2),
  timeframe TEXT,
  is_read BOOLEAN DEFAULT false,
  is_dismissed BOOLEAN DEFAULT false,
  expires_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## API Endpoints

### Train ML Model
```http
POST /api/smart-budget/train
Authorization: Bearer <token>

{
  "categoryId": "uuid",
  "modelType": "arima",
  "lookbackMonths": 12
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "modelType": "arima",
    "patternsDetected": {
      "type": "seasonal",
      "frequency": "monthly",
      "average": 1250.50,
      "growthRate": 5.2
    },
    "predictions": [
      {
        "predictionMonth": "2026-03-01",
        "predictedAmount": "1312.50",
        "confidenceScore": 0.87
      }
    ],
    "dataPoints": 12
  }
}
```

### Get Predictions
```http
GET /api/smart-budget/predictions?categoryId=uuid&monthsAhead=3
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "predictionMonth": "2026-05-01",
    "predictedAmount": "1350.00",
    "confidenceScore": 0.85,
    "upperBound": "1500.00",
    "lowerBound": "1200.00",
    "modelType": "arima"
  }
}
```

### Auto-Adjust Budgets
```http
POST /api/smart-budget/auto-adjust
Authorization: Bearer <token>

{
  "adjustmentRule": "MODERATE"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "adjustmentsCreated": 5,
    "adjustments": [
      {
        "categoryId": "uuid",
        "previousAmount": "1000.00",
        "newAmount": "1200.00",
        "adjustmentPercentage": 20,
        "reason": "overspending",
        "confidence": 0.85,
        "status": "pending"
      }
    ],
    "rule": "MODERATE"
  }
}
```

### Get Recommendations
```http
GET /api/smart-budget/recommendations
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "categoryId": "uuid",
      "categoryName": "Groceries",
      "currentBudget": 500,
      "predictedSpending": 625,
      "recommendedBudget": 625,
      "change": 125,
      "percentageChange": 25,
      "type": "increase",
      "reason": "Predicted spending ($625) exceeds budget by 25%",
      "confidence": 0.87
    }
  ],
  "count": 1
}
```

### Simulate Budget Scenarios
```http
POST /api/smart-budget/simulate
Authorization: Bearer <token>

{
  "categoryId": "uuid",
  "budgetAmount": 1000,
  "months": 3
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "budgetAmount": 1000,
    "months": 3,
    "predictions": [...],
    "totalPredicted": 3150.00,
    "totalBudget": 3000,
    "surplus": -150.00,
    "status": "over_budget"
  }
}
```

### Apply Adjustments
```http
POST /api/smart-budget/apply-adjustments
Authorization: Bearer <token>

{
  "adjustmentIds": ["uuid1", "uuid2"]
}
```

### Detect Anomalies
```http
GET /api/smart-budget/anomalies?categoryId=uuid
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "expenseId": "uuid",
      "categoryId": "uuid",
      "amount": 500,
      "expected": 250,
      "deviation": 100,
      "severity": "high"
    }
  ],
  "count": 1
}
```

### Get Spending Trends
```http
GET /api/smart-budget/trends?categoryId=uuid
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "direction": "increasing",
    "growthRate": 12.5,
    "type": "trending",
    "confidence": 0.82,
    "insights": [
      {
        "type": "trend",
        "message": "Spending is increasing at 12.5% per year",
        "severity": "medium"
      }
    ]
  }
}
```

### Get Seasonal Factors
```http
GET /api/smart-budget/seasonal-factors?categoryId=uuid
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "1": 0.95,
    "2": 0.90,
    "3": 1.05,
    "12": 1.30
  }
}
```

## ML Models

### 1. ARIMA (AutoRegressive Integrated Moving Average)
**Best for:** Time series with trends and seasonality

**Formula:**
```
Prediction = Trend × Seasonal Factor × Base Amount
```

**Confidence Calculation:**
- Data points ≥ 12: +0.2
- Low variance (CV < 15%): +0.2
- Seasonal/Cyclical pattern: +0.1

### 2. Moving Average
**Best for:** Short-term predictions with recent data

**Formula:**
```
Prediction = Average(Last 3 Months) × Seasonal Factor
```

### 3. Prophet
**Best for:** Complex patterns with multiple seasonalities

**Formula:**
```
Prediction = Trend + Seasonal Component
```

### 4. LSTM (Long Short-Term Memory)
**Best for:** Complex non-linear patterns

*Note: Currently uses enhanced ARIMA. Full LSTM implementation requires TensorFlow.js*

## Adjustment Rules

### Conservative
- **Max Adjustment**: 10%
- **Min Data Points**: 6 months
- **Use Case**: Risk-averse budgeting

### Moderate (Recommended)
- **Max Adjustment**: 20%
- **Min Data Points**: 4 months
- **Use Case**: Balanced approach

### Aggressive
- **Max Adjustment**: 40%
- **Min Data Points**: 3 months
- **Use Case**: Rapid adaptation to changes

## Pattern Types

### Seasonal
- Regular monthly/quarterly variations
- Example: Higher utility bills in winter

### Trending
- Consistent increase or decrease
- Example: Gradually increasing grocery costs

### Cyclical
- Regular repeating patterns
- Example: Quarterly insurance payments

### Irregular
- No clear pattern
- Example: One-time purchases

## Background Job

### Budget Optimizer Job
- **Schedule**: Daily at midnight
- **Functions**:
  - Generate predictions for all users
  - Create budget adjustment suggestions
  - Update prediction accuracy
  - Generate AI insights
  - Clean up old predictions (6+ months)

## Usage Examples

### Training a Model
```javascript
// Train ARIMA model with 12 months of data
const result = await budgetAI.trainSpendingModel(userId, {
  categoryId: 'groceries-uuid',
  modelType: 'arima',
  lookbackMonths: 12
});

console.log(`Model trained with ${result.dataPoints} data points`);
console.log(`Generated ${result.predictions.length} predictions`);
```

### Getting Predictions
```javascript
// Predict spending for next 3 months
const prediction = await budgetAI.predictMonthlySpending(
  userId,
  categoryId,
  3 // months ahead
);

console.log(`Predicted: $${prediction.predictedAmount}`);
console.log(`Confidence: ${(prediction.confidenceScore * 100).toFixed(1)}%`);
```

### Auto-Adjusting Budgets
```javascript
// Create moderate adjustments
const result = await budgetAI.autoAdjustBudget(userId, 'MODERATE');

console.log(`Created ${result.adjustmentsCreated} adjustments`);

// Apply adjustments
await budgetAI.applyAdjustments(userId, adjustmentIds);
```

### Detecting Anomalies
```javascript
// Detect unusual spending
const anomalies = await budgetAI.detectAnomalies(userId);

anomalies.forEach(anomaly => {
  console.log(`Anomaly: $${anomaly.amount} (${anomaly.deviation.toFixed(1)}% above average)`);
});
```

## Insights & Recommendations

### Insight Types
- **Overspending**: Budget exceeded by predictions
- **Saving Opportunity**: Spending below budget
- **Anomaly**: Unusual transaction detected
- **Trend**: Significant spending trend identified

### Severity Levels
- **Low**: Minor deviation (<15%)
- **Medium**: Moderate deviation (15-30%)
- **High**: Significant deviation (30-50%)
- **Critical**: Severe deviation (>50%)

## Performance Metrics

### Prediction Accuracy
```
Accuracy = 1 - (|Predicted - Actual| / Actual)
```

### Confidence Score
Based on:
- Data quantity (more = better)
- Data consistency (lower variance = better)
- Pattern clarity (seasonal/cyclical = better)

## Best Practices

1. **Minimum Data**: Wait for at least 3 months of transaction history
2. **Regular Training**: Retrain models monthly for best accuracy
3. **Review Adjustments**: Always review auto-adjustments before applying
4. **Monitor Insights**: Check AI insights weekly
5. **Seasonal Awareness**: Account for seasonal variations in budgets

## Future Enhancements

1. **Deep Learning Models**
   - Full LSTM implementation with TensorFlow.js
   - Neural network ensemble predictions

2. **Advanced Features**
   - Multi-category optimization
   - Goal-based budget allocation
   - Predictive alerts before overspending

3. **Integration**
   - Bank account sync for real-time data
   - Receipt OCR for automatic categorization
   - Voice-activated budget queries

4. **Visualization**
   - Interactive prediction charts
   - Spending heatmaps
   - Trend visualizations

## Support

For issues or questions, please contact the development team or create an issue in the repository.

---

**Version**: 1.0.0  
**Last Updated**: February 9, 2026  
**Issue**: #289
