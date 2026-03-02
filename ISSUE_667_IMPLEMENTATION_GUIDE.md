# Financial Health Scoring & Insights - Implementation Guide

**Issue #667: Financial Health Scoring & Insights**

## 📋 Overview

This document provides a complete guide to the Financial Health Scoring & Insights feature implemented for the WEALTH-VALUT platform. This feature addresses the user need for a holistic view of financial health with actionable insights and peer benchmarking.

## 🎯 Problem Statement

**User Pain Points:**
- Users lack a holistic view of their financial health
- Can't benchmark spending against peers or norms
- Miss opportunities for financial improvement
- Don't understand their financial health trends over time

## ✅ Solution Delivered

**Financial Health Scoring System** with:
1. **Wealth Score (0-850)** - Credit score-style financial health metric
2. **Component Scores** - Granular scoring across 5 financial dimensions
3. **Financial Health Dashboard** - Comprehensive overview with insights
4. **Spending Heatmaps** - Visual spending pattern analysis
5. **Peer Benchmarking** - Compare against similar demographics
6. **Personalized Recommendations** - AI-driven actionable advice
7. **Wellness Trends** - Historical tracking with stress indicators

## 📊 Scoring Algorithm

### Overall Wealth Score (0-850)

The wealth score uses a weighted composite calculation similar to credit scoring:

```javascript
Wealth Score = (
    Savings Score × 0.25 +      // 25% weight
    Debt Score × 0.25 +          // 25% weight
    Spending Score × 0.20 +      // 20% weight
    Investment Score × 0.20 +    // 20% weight
    Income Score × 0.10          // 10% weight
) × 8.5
```

### Score Ranges & Health Status

| Score Range | Status | Description |
|------------|--------|-------------|
| 750-850 | Excellent | Outstanding financial health |
| 650-749 | Good | Strong financial position |
| 550-649 | Fair | Adequate but needs improvement |
| 450-549 | Poor | Significant financial challenges |
| 0-449 | Critical | Urgent intervention required |

### Component Scores (0-100 each)

#### 1. Savings Score (25% of overall)
- **Emergency Fund Coverage (60 points)**
  - 0 months: 0 points
  - 1-2 months: 20 points
  - 3-5 months: 40 points
  - 6+ months: 60 points

- **Savings Rate (40 points)**
  - <5%: 0-10 points
  - 5-10%: 10-20 points
  - 10-15%: 20-30 points
  - 15-20%: 30-35 points
  - >20%: 35-40 points

#### 2. Debt Score (25% of overall)
- **Debt-to-Income Ratio (70 points)**
  - <20%: 60-70 points (excellent)
  - 20-35%: 40-60 points (good)
  - 35-50%: 20-40 points (fair)
  - >50%: 0-20 points (poor)

- **Debt Burden (30 points)**
  - Total debt relative to assets and income
  - Lower burden = higher score

#### 3. Spending Score (20% of overall)
- **Budget Adherence (60 points)**
  - 100% adherence: 60 points
  - 90-100%: 45-60 points
  - 75-90%: 30-45 points
  - <75%: 0-30 points

- **Spending Consistency (40 points)**
  - Low volatility: 30-40 points
  - Predictable patterns rewarded

#### 4. Investment Score (20% of overall)
- **Portfolio Size (40 points)**
  - Based on net worth percentage invested
  - Higher allocation = higher score

- **Diversification (30 points)**
  - Multiple asset classes: bonus points
  - Concentrated risk: penalty

- **Returns (30 points)**
  - Risk-adjusted returns vs benchmarks
  - Positive returns rewarded

#### 5. Income Score (10% of overall)
- **Income Level (40 points)**
  - Relative to cost of living
  - Above-median income rewarded

- **Stability (30 points)**
  - Consistent income: higher score
  - Volatile income: lower score

- **Income Streams (20 points)**
  - Multiple streams: bonus points
  - Single source: penalty

- **Growth Rate (10 points)**
  - Year-over-year income growth

## 🏗️ Architecture

### Database Schema

**6 New Tables:**

1. **financial_health_scores** - Current wealth score and components
2. **health_score_history** - Historical score tracking
3. **spending_heatmaps** - Spending pattern analysis
4. **peer_benchmarks** - Demographic comparison data
5. **health_recommendations** - AI-generated improvement suggestions
6. **wellness_trends** - Financial wellness over time

### Backend Services

**3 Core Services:**

1. **healthScoringService.js** (752 lines)
   - `calculateHealthScore()` - Main scoring engine
   - Component score calculations (5 functions)
   - Recommendation generation
   - Score retrieval and history

2. **spendingHeatmapService.js** (411 lines)
   - `generateHeatmap()` - Creates time-based heatmaps
   - Category heatmaps
   - Time-of-day analysis
   - Day-of-week patterns
   - Merchant analysis
   - Pattern identification

3. **wellnessTrendsService.js** (474 lines)
   - `recordTrend()` - Captures wellness snapshots
   - Net worth calculation
   - Financial stress scoring
   - Trend analysis with insights

### API Routes

**11 New Endpoints in `/api/financial-health`:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/score/detailed` | Complete wealth score breakdown |
| GET | `/recommendations` | Filtered list of recommendations |
| PATCH | `/recommendations/:id/status` | Update recommendation progress |
| GET | `/heatmap` | Current period heatmap |
| POST | `/heatmap/generate` | Generate custom heatmap |
| GET | `/wellness` | Historical wellness data |
| GET | `/wellness/summary` | Wellness insights |
| POST | `/wellness/record` | Record new wellness point |
| GET | `/dashboard` | Complete dashboard view |
| GET | `/benchmarks` | Peer comparison data |

## 📝 API Documentation

### GET /api/financial-health/dashboard

**Complete dashboard aggregating all financial health data.**

**Response:**
```json
{
  "success": true,
  "data": {
    "score": {
      "wealthScore": 685,
      "previousScore": 670,
      "scoreChange": 15,
      "healthStatus": "good",
      "components": {
        "savings": 75,
        "debt": 82,
        "spending": 68,
        "investment": 70,
        "income": 65
      },
      "metrics": {
        "emergencyFundMonths": 4.2,
        "debtToIncomeRatio": 0.28,
        "budgetAdherence": 0.85,
        "portfolioValue": 125000,
        "monthlyIncome": 7500
      },
      "peerComparison": {
        "percentile": 72,
        "ageGroupAverage": 650,
        "incomeGroupAverage": 670
      }
    },
    "recommendations": [
      {
        "id": "uuid",
        "title": "Increase Emergency Fund",
        "description": "Build emergency fund to 6 months of expenses",
        "priority": "high",
        "category": "savings",
        "impact": "12-point score increase",
        "actionItems": [
          "Automate $500 monthly transfer to savings",
          "Cut discretionary spending by 15%"
        ]
      }
    ],
    "heatmap": {
      "categoryHeatmap": {...},
      "peakSpendingTimes": [...],
      "patterns": [...]
    },
    "wellnessSummary": {
      "currentStress": 35,
      "trendDirection": "improving",
      "netWorthChange": 8.5
    }
  }
}
```

### GET /api/financial-health/score/detailed

**Detailed wealth score with all components.**

**Response:**
```json
{
  "success": true,
  "data": {
    "wealthScore": 685,
    "previousScore": 670,
    "scoreChange": 15,
    "healthStatus": "good",
    "components": {
      "savings": {
        "score": 75,
        "weight": 0.25,
        "contribution": 18.75,
        "breakdown": {
          "emergencyFund": 60,
          "savingsRate": 15
        }
      },
      "debt": {
        "score": 82,
        "weight": 0.25,
        "contribution": 20.5,
        "breakdown": {
          "dtiRatio": 70,
          "debtBurden": 12
        }
      }
      // ... other components
    },
    "metrics": {...},
    "peerComparison": {...},
    "calculatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/financial-health/recommendations

**Personalized financial improvement recommendations.**

**Query Parameters:**
- `priority` (optional): Filter by priority (critical, high, medium, low)
- `category` (optional): Filter by category (savings, debt, spending, investment, income)
- `status` (optional): Filter by status (pending, in_progress, completed, dismissed)
- `limit` (optional): Number of results (default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Build Emergency Fund",
      "description": "Your emergency fund covers only 2.5 months of expenses. Aim for 6 months.",
      "priority": "high",
      "category": "savings",
      "potentialImpact": "12-point score increase",
      "actionItems": [
        "Set up automatic transfer of $500/month to savings",
        "Reduce dining out expenses by 20%",
        "Apply bonus income to emergency fund"
      ],
      "estimatedTimeMonths": 8,
      "status": "pending",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 8,
    "page": 1,
    "limit": 10
  }
}
```

### PATCH /api/financial-health/recommendations/:id/status

**Update recommendation status.**

**Request Body:**
```json
{
  "status": "in_progress",
  "notes": "Started automatic savings transfer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "in_progress",
    "updatedAt": "2024-01-15T14:20:00Z"
  }
}
```

### GET /api/financial-health/heatmap

**Current period spending heatmap.**

**Query Parameters:**
- `period` (optional): 'week' | 'month' | 'quarter' (default: 'month')
- `type` (optional): 'category' | 'time_of_day' | 'day_of_week' | 'merchant' (default: 'category')

**Response:**
```json
{
  "success": true,
  "data": {
    "type": "category",
    "period": "month",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-01-31",
    "heatmap": {
      "Groceries": {
        "Mon": 45.50,
        "Tue": 0,
        "Wed": 78.20,
        // ... other days
      },
      "Dining": {
        "Mon": 25.00,
        // ...
      }
    },
    "peakSpendingTimes": [
      {
        "category": "Groceries",
        "peakDay": "Saturday",
        "peakTime": "10:00-12:00",
        "averageAmount": 125.50
      }
    ],
    "patterns": [
      "Weekend Spender: 65% of spending occurs on weekends",
      "Morning Shopper: Peak spending 10am-12pm",
      "Consistent Grocery Pattern: Every Saturday morning"
    ]
  }
}
```

### POST /api/financial-health/heatmap/generate

**Generate custom heatmap with specific parameters.**

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "type": "category",
  "categories": ["Groceries", "Dining", "Transportation"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "heatmapId": "uuid",
    "heatmap": {...},
    "generatedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/financial-health/wellness

**Historical wellness trends.**

**Query Parameters:**
- `startDate` (required): Start date (ISO format)
- `endDate` (required): End date (ISO format)
- `granularity` (optional): 'daily' | 'weekly' | 'monthly' (default: 'monthly')

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "netWorth": 125000,
      "financialStress": 35,
      "savingsRate": 0.18,
      "debtToIncome": 0.28,
      "budgetAdherence": 0.85,
      "wealthScore": 685
    }
    // ... more data points
  ]
}
```

### GET /api/financial-health/wellness/summary

**Wellness insights and trends.**

**Query Parameters:**
- `period` (optional): 'month' | 'quarter' | 'year' (default: 'month')

**Response:**
```json
{
  "success": true,
  "data": {
    "currentStress": 35,
    "averageStress": 42,
    "stressTrend": "improving",
    "netWorthChange": 8.5,
    "netWorthChangePercent": 7.3,
    "scoreChange": 15,
    "keyInsights": [
      "Financial stress decreased by 15% this month",
      "Net worth growing consistently (+7.3%)",
      "Debt-to-income ratio improved significantly"
    ],
    "concernAreas": [
      "Emergency fund still below recommended 6 months",
      "Investment diversification needs improvement"
    ]
  }
}
```

### POST /api/financial-health/wellness/record

**Record a new wellness data point.**

**Request Body:**
```json
{
  "date": "2024-01-15",
  "notes": "End of month snapshot"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "date": "2024-01-15",
    "netWorth": 125500,
    "financialStress": 33,
    "wealthScore": 690,
    "recordedAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /api/financial-health/benchmarks

**Peer comparison benchmarking data.**

**Response:**
```json
{
  "success": true,
  "data": {
    "userScore": 685,
    "percentile": 72,
    "benchmarks": {
      "overall": {
        "average": 650,
        "median": 660,
        "p25": 580,
        "p75": 740
      },
      "ageGroup": {
        "group": "30-39",
        "average": 665,
        "userRank": "Above Average"
      },
      "incomeGroup": {
        "range": "$75k-$100k",
        "average": 670,
        "userRank": "Above Average"
      },
      "region": {
        "name": "Northeast US",
        "average": 680,
        "userRank": "Average"
      }
    },
    "insights": [
      "You're in the top 28% of all users",
      "Above average for your age group",
      "Slightly below regional average - focus on investment score"
    ]
  }
}
```

## 🚀 Setup Instructions

### 1. Database Migration

Run the migration to create all necessary tables:

```bash
cd backend
node -e "const { db } = require('./db'); const fs = require('fs'); const sql = fs.readFileSync('./drizzle/0029_financial_health_scoring.sql', 'utf8'); db.execute(sql);"
```

Or use your preferred migration tool:

```bash
# Using Drizzle Kit
npx drizzle-kit push:pg

# Or raw SQL
psql -U your_user -d wealth_vault -f backend/drizzle/0029_financial_health_scoring.sql
```

### 2. Verify Schema

```sql
-- Check tables were created
SELECT tablename FROM pg_tables WHERE 
  tablename IN (
    'financial_health_scores',
    'health_score_history',
    'spending_heatmaps',
    'peer_benchmarks',
    'health_recommendations',
    'wellness_trends'
  );

-- Check indexes
SELECT indexname FROM pg_indexes WHERE 
  tablename LIKE '%financial_health%' OR
  tablename LIKE '%health_score%' OR
  tablename LIKE '%spending_heatmap%';
```

### 3. Test API Endpoints

```bash
# Test score calculation (requires authentication)
curl -X GET http://localhost:5000/api/financial-health/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test heatmap generation
curl -X GET "http://localhost:5000/api/financial-health/heatmap?period=month&type=category" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test recommendations
curl -X GET "http://localhost:5000/api/financial-health/recommendations?priority=high" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. Initialize Peer Benchmarks (Optional)

Seed initial peer benchmark data:

```sql
-- Example benchmark data
INSERT INTO peer_benchmarks (age_group, income_range, region, category, metric_name, p25, median, p75, sample_size)
VALUES
  ('25-34', '50k-75k', 'US', 'savings', 'emergency_fund_months', 2.0, 3.5, 5.0, 1000),
  ('25-34', '50k-75k', 'US', 'debt', 'dti_ratio', 0.20, 0.35, 0.50, 1000),
  ('35-44', '75k-100k', 'US', 'investment', 'portfolio_value', 25000, 50000, 100000, 800);
```

## 🧪 Testing

### Unit Tests

```bash
cd backend
npm test -- services/healthScoringService.test.js
npm test -- services/spendingHeatmapService.test.js
npm test -- services/wellnessTrendsService.test.js
```

### Integration Tests

```bash
npm test -- routes/financialHealth.test.js
```

### Test Scenarios

**1. New User with Minimal Data:**
- Expected wealth score: ~450-550 (Fair)
- Should generate high-priority recommendations
- Minimal peer comparison data

**2. Established User with Good Finances:**
- Expected wealth score: 650-750 (Good to Excellent)
- Balanced component scores
- Trend analysis shows improving health

**3. User with High Debt Load:**
- Expected debt score: <40
- Critical recommendations for debt reduction
- Financial stress score >60

**4. User with Strong Investment Portfolio:**
- Expected investment score: >80
- Positive wellness trend
- Recommendation focus on other areas

## 📊 Monitoring & Maintenance

### Key Metrics to Monitor

1. **Score Calculation Performance:**
   - Average calculation time: <2 seconds
   - 99th percentile: <5 seconds

2. **Data Quality:**
   - Average data_quality score: >80
   - Users with complete data: >70%

3. **Recommendation Effectiveness:**
   - Recommendations accepted: >30%
   - Score improvement after following recommendations: track delta

4. **Heatmap Generation:**
   - Average generation time: <1 second
   - Cache hit rate: >60%

### Database Queries for Monitoring

```sql
-- Average wealth score by cohort
SELECT 
  DATE_TRUNC('month', calculated_at) as month,
  AVG(wealth_score) as avg_score,
  COUNT(*) as user_count
FROM财financial_health_scores
GROUP BY month
ORDER BY month DESC;

-- Component score distribution
SELECT 
  health_status,
  COUNT(*) as count,
  AVG(savings_score) as avg_savings,
  AVG(debt_score) as avg_debt,
  AVG(spending_score) as avg_spending
FROM financial_health_scores
WHERE calculated_at > NOW() - INTERVAL '30 days'
GROUP BY health_status;

-- Recommendation acceptance rate
SELECT 
  category,
  COUNT(*) as total,
  SUM(CASE WHEN status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) as accepted,
  ROUND(100.0 * SUM(CASE WHEN status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) / COUNT(*), 2) as acceptance_rate
FROM health_recommendations
GROUP BY category;

-- Users with improving scores
SELECT 
  COUNT(*) as improving_count,
  AVG(score_change) as avg_improvement
FROM financial_health_scores
WHERE score_change > 0
  AND calculated_at > NOW() - INTERVAL '30 days';
```

### Scheduled Jobs

**Daily:**
- Recalculate health scores for all active users
- Update peer benchmarks with anonymized data
- Generate wellness trend snapshots
- Clean up expired recommendations

**Weekly:**
- Generate spending heatmaps for all users
- Send weekly health score summaries
- Analyze recommendation effectiveness

**Monthly:**
- Archive old health score history (keep 24 months)
- Update peer comparison percentiles
- Generate performance reports

## 🔐 Security & Privacy

### Data Privacy

1. **Peer Benchmarks:**
   - All peer data is anonymized
   - No individual user data exposed
   - Minimum sample size of 30 for benchmark categories

2. **Sharing Controls:**
   - Users control what data is shared for benchmarking
   - Opt-in for peer comparison features
   - Data deletion removes from all aggregates

3. **Sensitive Data:**
   - Financial metrics encrypted at rest
   - API endpoints require authentication
   - Rate limiting on calculation endpoints

### Compliance

- GDPR: Right to erasure implemented
- CCPA: Data access and deletion APIs available
- SOC 2: Audit logging for all score calculations

## 🎨 Frontend Integration Guide

### Dashboard Component

```jsx
import { useState, useEffect } from 'react';
import { financialHealthApi } from '@/services/api';

function FinancialHealthDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await financialHealthApi.getDashboard();
        setDashboard(data);
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!dashboard) return <ErrorMessage />;

  return (
    <div className="financial-health-dashboard">
      {/* Wealth Score Display */}
      <WealthScoreCard score={dashboard.score} />
      
      {/* Component Scores */}
      <ComponentScoresGrid components={dashboard.score.components} />
      
      {/* Recommendations */}
      <RecommendationsList recommendations={dashboard.recommendations} />
      
      {/* Spending Heatmap */}
      <SpendingHeatmap data={dashboard.heatmap} />
      
      {/* Wellness Trends */}
      <WellnessTrendChart data={dashboard.wellnessSummary} />
    </div>
  );
}
```

### Wealth Score Gauge Component

```jsx
function WealthScoreGauge({ score, previousScore}) {
  const change = score - previousScore;
  const status = getHealthStatus(score);
  
  return (
    <div className="wealth-score-gauge">
      <CircularProgress
        value={score}
        max={850}
        size="large"
        color={statusColors[status]}
      />
      <div className="score-details">
        <h2>{score}</h2>
        <span className={change >= 0 ? 'positive' : 'negative'}>
          {change >= 0 ? '+' : ''}{change} points
        </span>
        <Badge color={statusColors[status]}>{status}</Badge>
      </div>
    </div>
  );
}
```

### Spending Heatmap Visualization

```jsx
import { HeatMapGrid } from 'react-grid-heatmap';

function SpendingHeatmap({ data }) {
  const xLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const yLabels = Object.keys(data.heatmap);
  
  const heatmapData = yLabels.map(category => 
    xLabels.map(day => data.heatmap[category][day] || 0)
  );

  return (
    <div className="spending-heatmap">
      <h3>Spending Patterns</h3>
      <HeatMapGrid
        data={heatmapData}
        xLabels={xLabels}
        yLabels={yLabels}
        cellHeight="50px"
        xLabelsStyle={() => ({ fontSize: '12px' })}
        yLabelsStyle={() => ({ fontSize: '12px' })}
        cellStyle={(x, y, value) => ({
          background: getColorForValue(value),
          fontSize: '11px',
        })}
        cellRender={(x, y, value) => value > 0 ? `$${value.toFixed(0)}` : ''}
      />
      <PatternInsights patterns={data.patterns} />
    </div>
  );
}
```

## 🐛 Troubleshooting

### Common Issues

**1. Score Always Returns 0:**
- Check if user has sufficient financial data (expenses, debts, income)
- Verify data_quality field - should be >30 for valid calculation
- Review calculation_version in database

**2. Recommendations Not Generated:**
- Ensure score calculation completed successfully
- Check if user has opted into recommendations
- Verify recommendation rules are configured

**3. Heatmap Shows No Data:**
- Confirm user has expenses in the selected period
- Check date range parameters
- Verify category assignments on expenses

**4. Peer Comparisons Missing:**
- Insufficient peer data in benchmarks table
- User hasn't opted into peer comparison
- Check age_group, income_range are set on user profile

### Debug Queries

```sql
-- Check score calculation history
SELECT 
  calculated_at,
  wealth_score,
  health_status,
  data_quality,
  metrics->>'emergencyFundMonths' as emergency_fund,
  metrics->>'debtToIncomeRatio' as dti
FROM financial_health_scores
WHERE user_id = 'USER_UUID'
ORDER BY calculated_at DESC
LIMIT 10;

-- Check if user has data for scoring
SELECT 
  (SELECT COUNT(*) FROM expenses WHERE user_id = 'USER_UUID') as expense_count,
  (SELECT COUNT(*) FROM debts WHERE user_id = 'USER_UUID') as debt_count,
  (SELECT COUNT(*) FROM goals WHERE user_id = 'USER_UUID') as goal_count,
  (SELECT COUNT(*) FROM portfolio_holdings WHERE user_id = 'USER_UUID') as investment_count;

-- View recommendation generation
SELECT 
  title,
  priority,
  category,
  status,
  created_at
FROM health_recommendations
WHERE user_id = 'USER_UUID'
ORDER BY created_at DESC;
```

## 📈 Future Enhancements

### Planned Features

1. **Machine Learning Improvements:**
   - Train ML model on historical improvement data
   - Predict score changes based on user actions
   - Personalized weighting of component scores

2. **Advanced Analytics:**
   - Cohort analysis (compare with similar users)
   - Goal-specific score projections
   - "What-if" scenario modeling

3. **Social Features:**
   - Anonymous community challenges
   - Achievement badges for milestones
   - Shared family financial health dashboard

4. **Integration Enhancements:**
   - Real-time score updates on transactions
   - Push notifications for score changes
   - Email weekly health reports

5. **AI-Powered Insights:**
   - Natural language explanations of score changes
   - Conversational financial advisor chatbot
   - Predictive alerts for potential issues

## 📞 Support

For questions or issues with this feature:

1. Check this documentation
2. Review API logs: `backend/logs/financial-health.log`
3. Run diagnostic script: `npm run diagnose:health-scoring`
4. Contact: dev-team@wealth-vault.com

## 📄 License

Internal use only. See main project LICENSE file.

---

**Last Updated:** January 2024
**Version:** 1.0.0
**Author:** Development Team
**Issue:** #667
