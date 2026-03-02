# Issue #613 Implementation Guide

## Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting

Complete implementation guide for integrating the portfolio rebalancing engine into your application.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Installation & Setup](#installation--setup)
3. [Database Migration](#database-migration)
4. [Service Layer Integration](#service-layer-integration)
5. [API Integration](#api-integration)
6. [Frontend Integration](#frontend-integration)
7. [Configuration](#configuration)
8. [Usage Examples](#usage-examples)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The rebalancing engine consists of:

### Backend Services
1. **portfolioRebalancingService.js** - Core rebalancing logic
2. **taxLossHarvestingEngine.js** - Tax optimization
3. **multiCurrencyRebalancingService.js** - FX handling
4. **advancedRebalancingOptimizer.js** - Advanced optimization

### API Routes
- `/api/rebalancing/*` - All rebalancing endpoints
- `/api/portfolio/*` - Portfolio holdings and allocations

### Database Tables
- `portfolio_holdings` - Current asset positions
- `allocation_targets` - User-defined allocation strategies
- `rebalancing_recommendations` - Generated suggestions
- `rebalancing_transactions` - Executed trades
- `tax_lots` - Individual purchase lots for tax tracking
- `rebalancing_metrics` - Historical analytics

### Frontend Components
- `TaxLossHarvesting.tsx` - Tax harvesting UI
- `MultiCurrencyAnalysis.tsx` - Currency analysis dashboard
- `RebalancingOptimization.tsx` - Optimization scenarios

---

## Installation & Setup

### 1. Install Dependencies

```bash
npm install drizzle-orm postgres uuid express-validator
```

### 2. Create Service Files

All service files are already created in `/backend/services/`:
- ✅ `portfolioRebalancingService.js`
- ✅ `taxLossHarvestingEngine.js`
- ✅ `multiCurrencyRebalancingService.js`
- ✅ `advancedRebalancingOptimizer.js`

### 3. Create API Routes

Update/create `/backend/routes/rebalancing.js` with all endpoints:
- ✅ All endpoints implemented

### 4. Create Frontend Components

All components in `/frontend/src/components/Investments/`:
- ✅ `TaxLossHarvesting.tsx`
- ✅ `MultiCurrencyAnalysis.tsx`
- ✅ `RebalancingOptimization.tsx`

---

## Database Migration

### Run Migration

The migration file `0015_portfolio_rebalancing_tax_loss.sql` contains all necessary tables:

```bash
# Run using drizzle-kit
npm run db:migrate

# Or run directly with psql
psql -f backend/drizzle/0015_portfolio_rebalancing_tax_loss.sql
```

### Verify Tables Created

```sql
SELECT tablename FROM pg_catalog.pg_tables 
WHERE tablename IN (
  'portfolio_holdings',
  'allocation_targets', 
  'rebalancing_recommendations',
  'rebalancing_transactions',
  'tax_lots',
  'rebalancing_metrics'
);
```

### Add to Drizzle Schema

Update `backend/db/schema.js`:

```javascript
import {
  portfolioHoldings,
  allocationTargets,
  rebalancingRecommendations,
  rebalancingTransactions,
  taxLots,
  rebalancingMetrics,
} from './schema.js';

export {
  portfolioHoldings,
  allocationTargets,
  rebalancingRecommendations,
  rebalancingTransactions,
  taxLots,
  rebalancingMetrics,
};
```

---

## Service Layer Integration

### 1. Import Services

```javascript
// In your routes/middleware
import portfolioRebalancingService from '../services/portfolioRebalancingService.js';
import taxLossHarvestingEngine from '../services/taxLossHarvestingEngine.js';
import multiCurrencyRebalancingService from '../services/multiCurrencyRebalancingService.js';
import advancedRebalancingOptimizer from '../services/advancedRebalancingOptimizer.js';
```

### 2. Initialize Services

Services are singleton exports. No initialization required:

```javascript
// Services automatically connect to database via db.js
// Just import and use
```

### 3. Service Methods

Each service provides specific methods:

#### Portfolio Rebalancing Service
```javascript
// Analyze portfolio
const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
  userId, tenantId, allocationTargetId
);

// Get portfolio holdings
const holdings = await portfolioRebalancingService.getPortfolioHoldings(userId, tenantId);

// Execute rebalancing
const result = await portfolioRebalancingService.executeRebalancing(
  recommendationId, userId, tenantId
);
```

#### Tax-Loss Harvesting Engine
```javascript
// Find harvesting opportunities
const opportunities = await taxLossHarvestingEngine.findHarvestingOpportunities(
  userId, tenantId
);

// Check wash-sale compliance
const compliance = await taxLossHarvestingEngine.checkWashSaleCompliance(
  userId, tenantId, assetSymbol, saleDate
);

// Calculate year-end strategy
const strategy = await taxLossHarvestingEngine.calculateYearEndStrategy(
  userId, tenantId, taxBracket
);
```

#### Multi-Currency Rebalancing Service
```javascript
// Analyze multi-currency portfolio
const analysis = await multiCurrencyRebalancingService.analyzeMultiCurrencyPortfolio(
  userId, tenantId, baseCurrency
);

// Get currency exposure
const exposure = await multiCurrencyRebalancingService.getCurrencyExposure(
  userId, tenantId
);

// Optimize currency conversion
const optimization = await multiCurrencyRebalancingService.optimizeCurrencyConversion(
  fromCurrency, toCurrency, amount
);
```

#### Advanced Rebalancing Optimizer
```javascript
// Generate optimal moves
const result = await advancedRebalancingOptimizer.generateOptimalMoves(
  userId, tenantId, allocations, targets, constraints
);

// Calculate efficiency
const efficiency = advancedRebalancingOptimizer.calculateEfficiencyScore(
  currentAllocations, targetAllocations, moves, costs
);

// Generate scenarios
const scenarios = advancedRebalancingOptimizer.generateAlternativeScenarios(
  currentAllocations, targetAllocations, constraints
);
```

---

## API Integration

### 1. Register Routes

In `backend/server.js`:

```javascript
import rebalancingRoutes from './routes/rebalancing.js';

// Add route
app.use('/api/rebalancing', userLimiter, rebalancingRoutes);
app.use('/api/portfolio', userLimiter, rebalancingRoutes);
```

### 2. Test Endpoints

```bash
# Create allocation target
curl -X POST http://localhost:3000/api/rebalancing/allocations \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "targetName": "Balanced",
    "strategy": "balanced",
    "riskProfile": "medium",
    "allocations": {
      "BTC": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
      "ETH": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
      "USDC": { "target": 0.40, "minBound": 0.35, "maxBound": 0.45 }
    }
  }'

# Analyze portfolio
curl -X GET http://localhost:3000/api/rebalancing/allocations/{id}/analyze \
  -H "Authorization: Bearer {token}"

# Get harvesting opportunities
curl -X GET http://localhost:3000/api/rebalancing/harvesting/opportunities \
  -H "Authorization: Bearer {token}"
```

---

## Frontend Integration

### 1. Add Components to Investment Page

```tsx
import TaxLossHarvesting from '../components/Investments/TaxLossHarvesting';
import MultiCurrencyAnalysis from '../components/Investments/MultiCurrencyAnalysis';
import RebalancingOptimization from '../components/Investments/RebalancingOptimization';

export function InvestmentsDashboard() {
  return (
    <div className="space-y-6">
      {/* Existing components */}

      {/* Add new rebalancing components */}
      <RebalancingOptimization allocationId={allocationId} userId={userId} />
      
      <TaxLossHarvesting userId={userId} />
      
      <MultiCurrencyAnalysis userId={userId} />
    </div>
  );
}
```

### 2. Update API Service

Add to `frontend/src/services/api.ts`:

```typescript
// Portfolio endpoints
export const portfolioAPI = {
  getHoldings: () => client.get('/rebalancing/holdings'),
  getAllocations: () => client.get('/rebalancing/allocations'),
  createAllocation: (data) => client.post('/rebalancing/allocations', data),
  analyzePortfolio: (allocationId) => 
    client.get(`/rebalancing/allocations/${allocationId}/analyze`),
  
  // Harvesting endpoints
  getHarvestingOpportunities: () => 
    client.get('/rebalancing/harvesting/opportunities'),
  getYearEndStrategy: () => 
    client.get('/rebalancing/harvesting/year-end-strategy'),
  
  // Multi-currency endpoints
  analyzeMultiCurrency: (baseCurrency = 'USD') =>
    client.get('/rebalancing/multi-currency/analysis', { baseCurrency }),
  
  // Optimization endpoints
  getOptimizationScenarios: (allocationId) =>
    client.post('/rebalancing/optimization/scenarios', { allocationId }),
};
```

### 3. Add Navigation

Update navigation to include portfolio rebalancing:

```tsx
<nav>
  <Link to="/investments/rebalancing">Portfolio Rebalancing</Link>
  <Link to="/investments/tax-harvesting">Tax-Loss Harvesting</Link>
  <Link to="/investments/multi-currency">Multi-Currency Analysis</Link>
</nav>
```

---

## Configuration

### Backend Configuration

Environment variables (`.env`):

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/wealth_vault

# Rebalancing Engine
REBALANCING_DRIFT_THRESHOLD=0.05  # 5% default drift threshold
REBALANCING_MAX_SLIPPAGE=0.005    # 0.5% max slippage
REBALANCING_MIN_POSITION=100      # $100 minimum position size

# Tax Optimization
TAX_BRACKET=0.35                   # Default combined tax rate
TAX_HARVEST_ENABLED=true
ANNUAL_HARVEST_LIMIT=3000          # IRS limit for deductible losses

# Multi-Currency
CURRENCY_UPDATE_FREQUENCY=3600     # Update FX rates every hour
HEDGE_THRESHOLD=0.40               # Hedge if exposure > 40%

# Performance
CACHE_TTL=3600                     # Cache results for 1 hour
MAX_PORTFOLIO_SIZE=1000            # Max holdings per portfolio
```

### Frontend Configuration

Add to environment:

```env
VITE_API_REBALANCING_ENABLED=true
VITE_TAX_HARVESTING_ENABLED=true
VITE_MULTI_CURRENCY_ENABLED=true
```

### Feature Flags

Add to app configuration:

```typescript
const featureFlags = {
  portfolioRebalancing: true,
  taxLossHarvesting: true,
  multiCurrencySupport: true,
  advancedOptimization: true,
  autoRebalancing: true,
};
```

---

## Usage Examples

### Example 1: Create Allocation Target

```javascript
const allocation = await fetch('/api/rebalancing/allocations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    targetName: 'Conservative Balanced',
    strategy: 'balanced',
    riskProfile: 'low',
    allocations: {
      'BTC': { target: 0.15, minBound: 0.10, maxBound: 0.20 },
      'ETH': { target: 0.15, minBound: 0.10, maxBound: 0.20 },
      'Stocks': { target: 0.40, minBound: 0.35, maxBound: 0.45 },
      'Bonds': { target: 0.30, minBound: 0.25, maxBound: 0.35 },
    },
    rebalancingThreshold: 0.05,
    autoRebalance: true,
    rebalanceFrequency: 'quarterly',
  }),
});

const result = await allocation.json();
console.log('Allocation created:', result.data.target);
```

### Example 2: Analyze Portfolio & Get Recommendations

```javascript
// Get current portfolio status
const analysis = await fetch('/api/rebalancing/allocations/{allocationId}/analyze', {
  headers: { 'Authorization': `Bearer ${token}` },
});

const { data: { recommendation } } = await analysis.json();

console.log('Current Drift:', recommendation.deviations);
console.log('Estimated Cost:', recommendation.estimatedCost);
console.log('Tax Impact:', recommendation.taxImpact);
console.log('Moves Needed:', recommendation.moves);

// User reviews and approves
const execution = await fetch(
  `/api/rebalancing/recommendations/${recommendation.id}/execute`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      approvalNotes: 'Approved for execution',
    }),
  }
);
```

### Example 3: Get Tax-Loss Harvesting Opportunities

```javascript
// Get year-end strategy
const strategyRes = await fetch(
  '/api/rebalancing/harvesting/year-end-strategy?taxBracket=0.37',
  {
    headers: { 'Authorization': `Bearer ${token}` },
  }
);

const { data: { strategy } } = await strategyRes.json();

console.log('Current Year Net Gains:', strategy.currentYearSummary.netGains);
console.log('Recommended Harvest:', strategy.harvestingStrategy.recommendedHarvest);
console.log('Estimated Tax Savings:', strategy.harvestingStrategy.estimatedTaxSavings);

// Get specific opportunities
const oppsRes = await fetch('/api/rebalancing/harvesting/opportunities', {
  headers: { 'Authorization': `Bearer ${token}` },
});

const { data: { opportunities } } = await oppsRes.json();

// Filter opportunities that meet criteria
const harvestCandidates = opportunities.filter(
  opp => opp.harvestValue > 100 && !opp.washSaleRestricted
);
```

### Example 4: Multi-Currency Analysis

```javascript
// Analyze portfolio in multiple currencies
const analysisRes = await fetch(
  '/api/rebalancing/multi-currency/analysis?baseCurrency=USD',
  {
    headers: { 'Authorization': `Bearer ${token}` },
  }
);

const { data: { analysis } } = await analysisRes.json();

console.log('Total Portfolio Value:', analysis.totalPortfolioValue);
console.log('Currency Breakdown:', analysis.currencyAllocations);

// Check if hedging is recommended
const exposureRes = await fetch('/api/rebalancing/multi-currency/exposure', {
  headers: { 'Authorization': `Bearer ${token}` },
});

const { data: { exposure } } = await exposureRes.json();

if (exposure.hedgingNeeded) {
  console.log('Consider hedging high FX exposure');
}

// Get hedging strategy
const hedgeRes = await fetch(
  '/api/rebalancing/multi-currency/hedging-strategy?baseCurrency=USD',
  {
    headers: { 'Authorization': `Bearer ${token}` },
  }
);

const { data: { strategy } } = await hedgeRes.json();
console.log('Hedging Recommendations:', strategy.recommendations);
```

### Example 5: Optimization Scenarios

```javascript
// Get alternative rebalancing scenarios
const scenariosRes = await fetch('/api/rebalancing/optimization/scenarios', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ allocationId }),
});

const { data: { scenarios } } = await scenariosRes.json();

// Display scenarios to user
scenarios.forEach(scenario => {
  console.log(`\n${scenario.name}:`);
  console.log(`  Threshold: ${(scenario.threshold * 100).toFixed(1)}%`);
  console.log(`  Max Slippage: ${(scenario.maxSlippage * 100).toFixed(2)}%`);
  console.log(`  Tax Loss Priority: ${scenario.prioritizeTaxLoss}`);
  console.log(`  Description: ${scenario.description}`);
});

// User selects preferred scenario
const selected = scenarios[1]; // Moderate

// Validate moves for selected scenario
const validationRes = await fetch('/api/rebalancing/optimization/validate-moves', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    moves: recommendation.moves,
    constraints: {
      minPositionSize: 100,
      maxTransactionCost: 1000,
      maxSlippage: selected.maxSlippage,
    },
  }),
});

const { data: { validation } } = await validationRes.json();
console.log('Moves Valid:', validation.valid);
console.log('Issues:', validation.issues);
```

---

## Troubleshooting

### Issue: "Allocation target not found"

**Solution:** 
- Verify allocation ID is correct
- Ensure user has access to allocation
- Check tenant isolation

```javascript
// Debug: List all allocations
const allocations = await fetch('/api/rebalancing/allocations', {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

### Issue: "No rebalancing needed"

**Solution:**
- Portfolio is within acceptable variance
- Try lowering `rebalancingThreshold`
- Wait for portfolio drift to exceed threshold

```javascript
// Adjust threshold
await fetch(`/api/rebalancing/allocations/${id}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ rebalancingThreshold: 0.03 }), // 3% instead of 5%
});
```

### Issue: Tax impact calculations seem off

**Solution:**
- Verify tax lots are recorded correctly
- Check `unrealizedGain` calculations
- Ensure cost basis is accurate

```javascript
// Review tax lots
const lotsRes = await fetch('/api/rebalancing/tax-lots', {
  headers: { 'Authorization': `Bearer ${token}` },
});

const { data: { lots } } = await lotsRes.json();
lots.forEach(lot => {
  console.log(`${lot.assetSymbol}:`, {
    costBasis: lot.costBasis,
    currentValue: lot.currentValue,
    gain: lot.unrealizedGain,
  });
});
```

### Issue: Wash-sale violations not detected

**Solution:**
- Ensure trading history is logged in `rebalancing_transactions`
- Check 30-day window calculation
- Verify asset symbols match exactly

```javascript
// Test wash-sale check
const checkRes = await fetch('/api/rebalancing/harvesting/wash-sale-check', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    assetSymbol: 'AAPL',
    saleDate: new Date().toISOString(),
  }),
});

const { data: { compliance } } = await checkRes.json();
console.log('Wash-sale Status:', compliance.message);
```

### Issue: Multi-currency conversion rates not updating

**Solution:**
- Check `fx_rates` table is populated
- Verify exchange rate API is connected
- Fallback to cached rates if API unavailable

```javascript
// Test currency conversion
const optRes = await fetch('/api/rebalancing/multi-currency/optimize-conversion', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    amount: 1000,
  }),
});

const { data: { optimization } } = await optRes.json();
console.log('Conversion Rate:', optimization.rate);
console.log('Result Amount:', optimization.resultingAmount);
```

---

## Performance Optimization

### Caching Strategies

```javascript
// Cache allocation targets (low-change data)
const cacheKey = `allocations:${userId}`;
const cached = await cacheService.get(cacheKey);
if (cached) return cached;

// Get from DB and cache
const allocations = await db.select().from(allocationTargets);
await cacheService.set(cacheKey, allocations, 3600); // 1 hour
```

### Database Query Optimization

Indexes are created on:
- `(user_id, asset_symbol)` - Portfolio lookup
- `(status)` - Recommendation filtering
- `(created_at DESC)` - Historical queries

### Batch Operations

For large portfolios:

```javascript
// Process in batches
const batchSize = 100;
for (let i = 0; i < holdings.length; i += batchSize) {
  const batch = holdings.slice(i, i + batchSize);
  await processHoldingsBatch(batch);
}
```

---

## Testing

Run test suite:

```bash
npm test -- backend/__tests__/portfolioRebalancing.test.js
```

Tests cover:
- Portfolio analysis calculations
- Rebalancing move generation
- Tax impact calculations
- Tax-loss harvesting identification
- Multi-currency analysis
- Optimization scenarios

---

## Support & Maintenance

For issues or questions:
1. Check API documentation: `ISSUE_613_API_DOCUMENTATION.md`
2. Review test cases: `backend/__tests__/portfolioRebalancing.test.js`
3. Check service implementations for detailed comments
4. Review issue #613 for additional context

---

## Future Enhancements

Potential future improvements:
- Real-time crypto/stock price feeds (WebSocket)
- Advanced machine learning for drift prediction
- Options strategy optimization
- Alternative asset class support (real estate, commodities)
- Portfolio risk metrics (Value at Risk, Sharpe Ratio)
- Collaborative portfolio management
- Mobile app optimization
