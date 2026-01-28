# AI-Powered Financial Health Scoring & Predictive Budgeting

## Overview

This feature provides comprehensive AI-driven financial analysis, health scoring, and predictive budgeting capabilities for Wealth-Vault users.

## Features

### 1. Financial Health Scoring

A sophisticated scoring system (0-100) that evaluates financial well-being across multiple dimensions:

- **Debt-to-Income Ratio (20% weight)**: Measures debt burden relative to income
- **Savings Rate (25% weight)**: Percentage of income saved each month
- **Spending Volatility (15% weight)**: Consistency of spending patterns
- **Emergency Fund (15% weight)**: Adequacy of emergency savings
- **Budget Adherence (15% weight)**: How well actual spending matches budget
- **Goal Progress (10% weight)**: Progress toward financial goals

#### Health Score Ratings:
- **Excellent**: 80-100 - Outstanding financial health
- **Good**: 60-79 - Solid financial position
- **Fair**: 40-59 - Room for improvement
- **Needs Improvement**: 0-39 - Immediate attention required

### 2. Predictive Cash Flow Forecasting

Uses historical spending data and recurring expenses to predict:
- Next month's expenses
- Expected balance
- Budget overflow warnings
- Spending trends (increasing/decreasing/stable)
- Confidence levels based on volatility

### 3. AI-Powered Insights

Automated generation of personalized insights including:
- Critical financial issues requiring immediate attention
- High-priority warnings about potential problems
- Medium-priority suggestions for optimization
- Low-priority success acknowledgments

### 4. Gemini AI Integration

Enhanced AI capabilities for:
- **Personalized Financial Advice**: Context-aware recommendations based on complete financial profile
- **Spending Pattern Analysis**: AI-driven analysis of spending behaviors
- **Budget Optimization**: Detailed plans to optimize budget allocation

## API Endpoints

### Analytics Endpoints

#### GET `/api/analytics/financial-health`
Get comprehensive financial health score and analysis.

**Query Parameters:**
- `startDate` (optional): Start date for analysis (defaults to current month start)
- `endDate` (optional): End date for analysis (defaults to current date)
- `save` (optional, default: true): Whether to save score to history

**Response:**
```json
{
  "success": true,
  "data": {
    "overallScore": 75.5,
    "rating": "Good",
    "recommendation": "You're doing well! Focus on increasing...",
    "breakdown": {
      "dti": 85,
      "savingsRate": 70,
      "volatility": 80,
      "emergencyFund": 75,
      "budgetAdherence": 65,
      "goalProgress": 60
    },
    "metrics": {
      "dti": 28.5,
      "savingsRate": 15.2,
      "volatility": 22.1,
      "monthlyIncome": 5000,
      "monthlyExpenses": 4240,
      "emergencyFundMonths": 4.2,
      "budgetAdherence": -5.2,
      "goalProgress": 45.8
    },
    "insights": [...],
    "cashFlowPrediction": {
      "predictedExpenses": 4350,
      "predictedIncome": 5000,
      "predictedBalance": 650,
      "trend": "increasing",
      "confidence": "high",
      "warning": null
    },
    "comparison": {
      "current": {...},
      "previous": {...},
      "change": {...}
    }
  }
}
```

#### GET `/api/analytics/health-history`
Get historical financial health scores.

**Query Parameters:**
- `limit` (optional, default: 12): Number of historical scores to retrieve

**Response:**
```json
{
  "success": true,
  "data": {
    "history": [...],
    "trend": "improving",
    "count": 12
  }
}
```

#### GET `/api/analytics/predictions`
Get predictive financial analytics and forecasts.

**Response:**
```json
{
  "success": true,
  "data": {
    "cashFlowForecast": {...},
    "insights": [...],
    "spendingPatterns": {...},
    "recommendations": [...]
  }
}
```

#### GET `/api/analytics/insights`
Get AI-powered financial insights categorized by priority.

**Response:**
```json
{
  "success": true,
  "data": {
    "overallScore": 75.5,
    "rating": "Good",
    "mainRecommendation": "...",
    "insights": [...],
    "categorized": {
      "critical": [...],
      "high": [...],
      "medium": [...],
      "low": [...]
    },
    "summary": {
      "totalInsights": 8,
      "criticalIssues": 1,
      "warnings": 2,
      "opportunities": 3
    }
  }
}
```

### Gemini AI Endpoints

#### POST `/api/gemini/financial-advice`
Get personalized financial advice based on user's complete financial profile.

**Request Body:**
```json
{
  "question": "How can I save more money?",
  "context": "savings"
}
```

**Context Options:** `general`, `savings`, `debt`, `budget`, `goals`

**Response:**
```json
{
  "success": true,
  "data": {
    "advice": "Based on your financial profile...",
    "healthScore": 75.5,
    "rating": "Good",
    "context": "savings",
    "insights": [...]
  }
}
```

#### POST `/api/gemini/analyze-spending`
Get AI analysis of spending patterns with recommendations.

**Request Body:**
```json
{
  "category": "Food & Dining"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": "AI analysis text...",
    "patterns": {
      "dayOfWeek": {...},
      "concentration": {...},
      "volatility": 22.1
    }
  }
}
```

#### POST `/api/gemini/budget-optimization`
Get AI-powered budget optimization suggestions.

**Response:**
```json
{
  "success": true,
  "data": {
    "optimization": "Detailed budget optimization plan...",
    "currentMetrics": {...},
    "prediction": {...}
  }
}
```

## Files Modified/Created

### New Files:
1. `backend/utils/financialCalculations.js` - Core mathematical functions for financial calculations
2. `backend/services/predictionService.js` - Prediction and analysis service
3. `backend/drizzle/0003_add_financial_health_scores.sql` - Database migration

### Modified Files:
1. `backend/db/schema.js` - Added `financialHealthScores` table and relations
2. `backend/routes/analytics.js` - Added 4 new endpoints for health scoring and predictions
3. `backend/routes/gemini.js` - Enhanced with 4 AI-powered endpoints

## Database Schema

### financial_health_scores Table

```sql
CREATE TABLE financial_health_scores (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    overall_score DOUBLE PRECISION,
    rating TEXT,
    dti_score DOUBLE PRECISION,
    savings_rate_score DOUBLE PRECISION,
    volatility_score DOUBLE PRECISION,
    emergency_fund_score DOUBLE PRECISION,
    budget_adherence_score DOUBLE PRECISION,
    goal_progress_score DOUBLE PRECISION,
    metrics JSONB,
    recommendation TEXT,
    insights JSONB,
    cash_flow_prediction JSONB,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    calculated_at TIMESTAMP,
    created_at TIMESTAMP
);
```

## Usage Examples

### Frontend Integration Example

```javascript
// Get current financial health score
const getFinancialHealth = async () => {
  const response = await fetch('/api/analytics/financial-health', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  
  // Display score: data.data.overallScore
  // Display rating: data.data.rating
  // Show insights: data.data.insights
};

// Get AI financial advice
const getAIAdvice = async (question) => {
  const response = await fetch('/api/gemini/financial-advice', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      question,
      context: 'general'
    })
  });
  const data = await response.json();
  
  // Display advice: data.data.advice
};

// View health score history
const getHistory = async () => {
  const response = await fetch('/api/analytics/health-history?limit=12', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const data = await response.json();
  
  // Chart the trend: data.data.history
  // Show overall trend: data.data.trend
};
```

## Calculation Methodology

### Financial Health Score Calculation

The overall score is a weighted average of six components:

```
Overall Score = (DTI Score × 0.20) + 
                (Savings Rate Score × 0.25) + 
                (Volatility Score × 0.15) + 
                (Emergency Fund Score × 0.15) + 
                (Budget Adherence Score × 0.15) + 
                (Goal Progress Score × 0.10)
```

Each component is normalized to a 0-100 scale using industry-standard benchmarks.

### Cash Flow Prediction

Uses simple linear regression on historical monthly data:
1. Calculate average monthly expenses
2. Determine trend (slope) using least squares method
3. Add recurring expenses
4. Project next month's expenses
5. Calculate confidence based on spending volatility

## Future Enhancements

- Machine learning model for more accurate predictions
- Category-specific recommendations
- Peer comparison (anonymized)
- Goal-specific action plans
- Integration with external financial data sources
- Mobile app widgets for quick health score view
- Push notifications for critical insights

## Testing

To test the feature:

1. Ensure you have expenses data for at least 2-3 months
2. Set monthly income and budget in user profile
3. Create some financial goals
4. Call the `/api/analytics/financial-health` endpoint
5. Review the score, insights, and predictions

## Dependencies

- Gemini AI API (Google)
- Drizzle ORM
- PostgreSQL with JSONB support

## Performance Considerations

- Health score calculations involve multiple database queries
- Consider caching scores for 24 hours to reduce load
- Use database indexes on `user_id` and `calculated_at`
- Limit history queries to reasonable timeframes (e.g., 12 months)

## Security

- All endpoints require authentication
- Financial data is user-specific and isolated
- AI prompts don't include sensitive personal information
- JSONB fields validated on input

## Support

For issues or questions about this feature, contact the development team or open an issue on GitHub.
