# Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting - Implementation Guide

## Overview

Intelligent portfolio rebalancing engine for multi-currency/multi-asset portfolios that:
- **Automatically detects allocation drift** from user-defined targets
- **Minimizes transaction costs** (fees, slippage, currency conversion)
- **Optimizes for taxes** using loss harvesting and holding period awareness
- **Respects user constraints** on slippage, fees, and preferred exchanges
- **Provides actionable recommendations** with full tax impact analysis
- **Supports auto-rebalancing** based on schedule or drift thresholds

**Status**: ✅ COMPLETED (Schema, Migration, Service, Routes, Tests, Server Integration)

---

## Architecture Overview

### Core Concepts

#### 1. **Portfolio Holdings**
Asset positions tracked with:
- Current quantity and market value
- Cost basis history (for tax calculation)
- Unrealized gains/losses
- Holding period (affects tax treatment)

#### 2. **Allocation Targets**
User-defined allocation strategy with:
- Target percentages per asset class
- Min/max bounds to define acceptable variance (e.g., ±5% around target)
- Rebalancing threshold (e.g., trigger when any asset drifts >5%)
- Tax optimization preferences

#### 3. **Rebalancing Recommendations**
Generated suggestions including:
- Specific moves needed (sell X of A, buy Y of B)
- Estimated costs (fees, slippage)
- Tax impact analysis (realized gains/losses)
- Tax-loss harvesting opportunities
- Priority level based on drift severity

#### 4. **Tax-Loss Harvesting**
Automated identification of:
- Positions with unrealized losses available for harvest
- Wash-sale rule compliance (30-day restriction on repurchase)
- Similar asset substitutes to avoid wash sales
- Tax benefit calculation

### Workflow

```
User Creates Allocation Target
    (e.g., "Balanced: 30% BTC, 20% ETH, 30% Stocks, 20% Bonds")
    ↓
Portfolio Analyzed Periodically
    (Or on demand, or when scheduled rebalance date arrives)
    ↓
Allocation Drift Calculated
    (Current allocation vs. target allocation)
    ↓
Is drift > threshold (e.g., 5%)?
    ├─ No → No action needed
    └─ Yes → Generate Recommendation
        ↓
        Calculate Rebalancing Moves
        (Greedy algorithm: match overweight with underweight assets)
        ↓
        Estimate Transaction Costs
        (Fees, slippage, currency conversion)
        ↓
        Identify Tax-Loss Harvesting
        (Unlocalized losses + wash-sale rules)
        ↓
        Calculate Total Tax Impact
        (Realized gains, offset by harvested losses)
        ↓
        Set Priority
        (Based on drift severity: drift>20%=urgent, >10%=high, <5%=medium)
        ↓
        Return Recommendation to User
        ↓
        User Reviews & Approves/Rejects
        ↓
        If Approved → Execute Rebalancing
            ├─ Create swap/trade transactions
            ├─ Record realized gains/losses
            ├─ Apply wash-sale restrictions
            └─ Update holdings
```

---

## Database Schema

### Tables

#### **portfolio_holdings**
Current asset positions with valuations

```sql
Columns:
- id, tenant_id, user_id
- asset_symbol (e.g., "BTC", "AAPL")
- asset_type (cryptocurrency, stock, bond, commodity, fiat)
- quantity, acquisition_cost, current_value
- cost_basis_history (JSON array of purchases)
- average_cost_per_unit (for tax reporting)
- unrealized_gain, unrealized_gain_percent
- realized_gain (from completed sales)
- tax_lot_ids (references specific purchases for wash-sale tracking)
- holding_period ("short-term" or "long-term"), is_long_term
- last_price_update, created_at, updated_at

Indexes:
- (user_id, asset_symbol) - Find user's position in asset
- (tenant_id) - Tenant isolation
- Composite on unrealized gains (for harvesting identification)
```

#### **allocation_targets**
User-defined portfolio allocation strategies

```sql
Columns:
- id, tenant_id, user_id
- target_name (e.g., "Conservative", "Growth")
- strategy (conservative, balanced, aggressive, crypto, index-following)
- risk_profile (low, medium, high)
- allocations (JSON: {asset: {target: 0.30, minBound: 0.25, maxBound: 0.35}})
- rebalancing_threshold (e.g., 0.05 = 5% drift tolerance)
- auto_rebalance (enable automatic periodic rebalancing)
- rebalance_frequency (daily, weekly, monthly, quarterly)
- rebalance_day (day of month or day of week)
- next_rebalance_date
- tax_optimization (enable tax-aware rebalancing)
- prefer_tax_loss (prioritize harvesting opportunities)
- min_gain_for_realization (only harvest gains > $X)
- max_transaction_cost, max_slippage
- preferred_exchanges (list of approved exchanges)
- is_active
- created_at, updated_at

Indexes:
- UNIQUE (user_id, strategy) WHERE is_active - One active per strategy
- (user_id, next_rebalance_date) - Auto-rebalance scheduling
```

#### **rebalancing_recommendations**
Generated rebalancing suggestions

```sql
Columns:
- id, tenant_id, user_id, allocation_target_id
- portfolio_value
- current_allocations (JSON: {BTC: {value: 10000, percent: 0.25}})
- target_allocations (JSON: same structure with target %s)
- deviations (JSON: {BTC: {deviation: 0.05, direction: "overweight"}})
- moves (JSON array: [{from: "BTC", to: "ETH", amount: 5000, reason: "rebalance"}])
- estimated_cost (total fees)
- estimated_slippage (price impact estimate)
- tax_impact (JSON: {realizedGains: 500, realizedLosses: 200, netTaxCost: -150})
- tax_harvesting_moves (JSON: [{sell: "AAPL", buy: "VTI", loss: 250}])
- harvestable_losses (total loss available to harvest)
- status (pending, approved, accepted, executed, expired, rejected)
- priority (low, medium, high, urgent)
- created_at, expires_at (24 hour validity), actioned_at
- rejection_reason

Indexes:
- (user_id, status, created_at) - User dashboard, pending recommendations
- (status) - Expiration monitoring
- (expires_at) - Cleanup of old recommendations
```

#### **rebalancing_transactions**
Executed rebalancing trades

```sql
Columns:
- id, tenant_id, user_id, recommendation_id
- transaction_type (swap, sell-buy, harvest, rebalance)
- from_asset, to_asset, from_quantity, to_quantity, execution_price
- base_currency, transaction_fee, fee_type, exchange_rate, slippage
- realized_gain, realized_loss, gain_type (short-term, long-term)
- is_tax_harvest (true if part of tax harvesting)
- status (pending, submitted, filled, failed, cancelled)
- executed_at, confirmation_hash
- exchange_name, notes
- created_at, updated_at

Indexes:
- (user_id, executed_at DESC) - User transaction history
- (status) - Filter by execution status
- (from_asset, to_asset) - Track flows between assets
- (is_tax_harvest) WHERE is_tax_harvest = true - Tax reporting
```

#### **tax_lots**
Individual asset purchase lots for tax tracking (FIFO/LIFO)

```sql
Columns:
- id, tenant_id, user_id, holding_id
- asset_symbol, quantity, cost_basis, cost_per_unit
- acquisition_date, purchase_date, is_long_term, days_held
- current_value, unrealized_gain, gain_percent
- can_be_harvested (true if loss-harvesting eligible)
- harvest_priority (lower = harvest first)
- last_harvested_at, wash_sale_exclude_until (IRS 30-day rule)
- status (open, partial-sold, fully-sold, harvested)
- sell_date, realized_gain, realized_loss
- created_at, updated_at

Indexes:
- (user_id, asset_symbol, status) - Find open lots in asset
- (can_be_harvested, unrealized_gain) - Identify harvestable losses
- (wash_sale_exclude_until) - Wash sale compliance
```

#### **rebalancing_metrics**
Period analytics for portfolio performance

```sql
Columns:
- id, tenant_id, user_id, allocation_target_id
- period_type (daily, weekly, monthly, quarterly, yearly)
- period_start, period_end
- portfolio_value, previous_value, total_return
- max_allocation_drift, average_allocation_drift, drift_trend
- rebalancing_count, total_rebalancing_cost, average_cost_per_rebalance
- realized_gains, realized_losses, harvested_losses, estimated_tax_cost
- target_alignment_score, efficiency_score
- created_at, updated_at

UNIQUE: (user_id, allocation_target_id, period_start, period_type)
Indexes:
- (user_id, period_start DESC) - Period queries
- (max_allocation_drift DESC) - Drift monitoring
```

### Views

#### **v_portfolio_summary**
Quick overview of portfolio state
```sql
SELECT 
  user_id, holding_count, total_value, unrealized_gains, overall_gain_percent
FROM portfolio_holdings
GROUP BY user_id
```

#### **v_rebalancing_opportunities**
Active recommendations ready for execution
```sql
SELECT 
  id, priority, status, estimated_cost, tax_impact, harvestable_losses,
  CASE WHEN expires_at < NOW() THEN 'expired' ELSE 'active' END
FROM rebalancing_recommendations
WHERE status IN ('pending', 'approved')
```

#### **v_tax_harvesting_calendar**
Tax-loss harvesting candidates with wash-sale status
```sql
SELECT 
  asset_symbol, unrealized_gain, harvest_priority,
  CASE WHEN wash_sale_exclude_until > NOW() THEN 'restricted' ELSE 'available' END
FROM tax_lots
WHERE can_be_harvested AND unrealized_gain < 0
ORDER BY harvest_priority
```

#### **v_rebalancing_performance**
Historical performance metrics
```sql
SELECT 
  period, total_return, alignment_score, efficiency_score,
  rebalancing_cost, net_gains, tax_benefit
FROM rebalancing_metrics
ORDER BY period_start DESC
```

---

## Service Layer

### portfolioRebalancingService.js

#### **analyzePortfolioAndRecommend(userId, tenantId, allocationTargetId)**
Main entry point - analyzes portfolio against target allocation

**Returns**: `rebalancingRecommendation` object or `null`

**Process**:
1. Fetch allocation target and current holdings
2. Calculate portfolio total value
3. Compute current allocation percentages
4. Parse target allocations from strategy
5. Calculate deviation from target for each asset
6. Check if max deviation exceeds threshold
7. Calculate optimal rebalancing moves
8. Estimate transaction costs (fees, slippage)
9. Identify tax-loss harvesting opportunities
10. Calculate total tax impact
11. Determine priority (urgent/high/medium based on drift)
12. Create recommendation record
13. Cache result, publish outbox event
14. Return recommendation

**Tax Optimization Logic**:
```javascript
// If tax_optimization enabled:
// 1. Identify unrealized losses available to harvest
// 2. Check wash-sale rules (exclude if sold<30 days ago, need substitute)
// 3. Find similar asset substitutes to avoid wash-sale issues
// 4. Calculate tax savings from loss harvesting
// 5. Offset realized gains from rebalancing with harvested losses
// 6. Estimate net tax cost/benefit
```

#### **getPortfolioHoldings(userId, tenantId)**
Retrieve all holdings for a user
**Returns**: Array of `portfolioHoldings`

#### **calculatePortfolioValue(holdings)**
Sum current value of all holdings
**Returns**: Numeric total value

#### **calculateAllocations(holdings, totalValue)**
Calculate percentage allocation of each asset
**Returns**: `{assetSymbol: {value, quantity, percent}}`

**Example**:
```javascript
{
  BTC: { value: 52500, quantity: 1.5, percent: 41.02 },
  ETH: { value: 24000, quantity: 20, percent: 18.75 },
  SPY: { value: 31500, quantity: 50, percent: 24.61 }
}
```

#### **calculateDeviations(current, target)**
Compute variance from target allocation
**Returns**: `{assetSymbol: {current, target, deviation, direction, withinBounds}}`

**Logic**:
```javascript
deviation = (currentPercent - targetPercent) / 100  // Decimal form
direction = deviation > 0 ? 'overweight' : 'underweight'
withinBounds = currentPercent >= minBound && currentPercent <= maxBound
```

#### **calculateRebalancingMoves(userId, tenantId, current, target, strategy)**
Determine optimal sell/buy orders using greedy matching
**Returns**: Array of moves `{from, to, amount, reason}`

**Algorithm**:
1. Classify assets as overweight or underweight
2. For each overweight asset, find underweight counterpart
3. Calculate transfer amount (limited to 90% of position to avoid over-trading)
4. Match overweight with underweight iteratively

#### **estimateTransactionCosts(moves, preferredExchanges, maxSlippage)**
Calculate fees and price impact
**Returns**: `{totalCost, totalSlippage, averageCostPerMove}`

**Estimation**:
```javascript
// Per move:
feePercent = 0.001  // 0.1% standard exchange fee
fee = move.amount * feePercent

slippagePercent = Math.min(move.amount / 100000, maxSlippage)
slippage = move.amount * slippagePercent

// Total costs sum across all moves
```

#### **identifyTaxHarvestingOpportunities(userId, tenantId, moves)**
Find unrealized losses ready to harvest
**Returns**: Array of `{sell, buy, loss, purpose}`

**Filtering**:
- Only losses (unrealizedGain < 0)
- Can be harvested (canBeHarvested = true)
- Not in wash-sale restriction period
- Find similar substitute asset

#### **findSimilarAsset(assetSymbol)**
Get equivalent asset for wash-sale avoidance
**Returns**: String (substitute ticker)

**Mappings**:
```javascript
BTC ↔ ETH, AAPL ↔ MSFT, SPY ↔ VOO, EUR ↔ GBP
```

#### **calculateTaxImpact(userId, tenantId, moves, harvestingMoves)**
Compute realized gains/losses and tax cost
**Returns**: `{realizedGains, realizedLosses, netGains, estimatedTaxCost}`

**Calculation**:
```javascript
// Realized gains from rebalancing moves
for each move: realizedGains += min(unrealizedGain, moveAmount)

// Realized losses from harvesting
for each harvest: realizedLosses += loss

// Net effect
netGains = realizedGains - realizedLosses
netTaxCost = netGains > 0 ? netGains * 0.35 : -realizedLosses * 0.35
// (35% = blended federal + state rate, configurable)
```

#### **executeRebalancing(recommendationId, userId, tenantId, approvalNotes)**
Convert approved recommendation into actual transactions
**Returns**: `{recommendation, transactions}`

**Process**:
1. Fetch recommendation
2. Update status to 'approved'
3. For each move in recommendation:
   - Create `rebalancingTransaction` record
   - Set status to 'pending' (awaiting actual execution)
4. Publish outbox event for async processing
5. Return transactions for user confirmation

#### **getRebalancingHistory(userId, tenantId, limit)**
Retrieve past transactions
**Returns**: Array of `rebalancingTransactions`

#### **getPortfolioAnalytics(userId, tenantId, allocationTargetId, periodType)**
Get historical metrics
**Returns**: Array of `rebalancingMetrics`

#### **getTaxOptimizationSummary(userId, tenantId)**
Summary of tax situation
**Returns**: 
```javascript
{
  totalHoldings,
  unrealizedGains,
  unrealizedLosses,
  harvestablelosses,
  longTermGains,
  shortTermGains,
  daysUntilLongTerm
}
```

---

## API Endpoints

Base URL: `/api/portfolio`

All endpoints require authentication (`protect` middleware) and respect tenant isolation.

### Portfolio Holdings

#### **GET /holdings**
Get current holdings with valuations

```bash
GET /api/portfolio/holdings

Response:
{
  "success": true,
  "data": {
    "holdings": [
      {
        "id": "uuid",
        "assetSymbol": "BTC",
        "quantity": "1.5",
        "acquisitionCost": "45000",
        "currentValue": "52500",
        "unrealizedGain": "7500",
        "unrealizedGainPercent": "16.67"
      }
    ],
    "summary": {
      "totalValue": 128000,
      "holdingCount": 4,
      "allocations": {
        "BTC": { "value": 52500, "percent": 41.02 },
        "ETH": { "value": 24000, "percent": 18.75 }
      }
    }
  }
}
```

### Allocation Targets

#### **GET /allocations**
List all allocation strategies

```bash
GET /api/portfolio/allocations

Response:
{
  "success": true,
  "data": {
    "targets": [
      {
        "id": "uuid",
        "targetName": "Balanced Portfolio",
        "strategy": "balanced",
        "riskProfile": "medium",
        "allocations": {
          "BTC": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
          "ETH": { "target": 0.20 }
        }
      }
    ]
  }
}
```

#### **POST /allocations**
Create new allocation target

```bash
POST /api/portfolio/allocations

Body:
{
  "targetName": "Growth Portfolio",
  "strategy": "aggressive",
  "riskProfile": "high",
  "allocations": {
    "BTC": { "target": 0.40, "minBound": 0.35, "maxBound": 0.45 },
    "ETH": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
    "SPY": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 }
  },
  "rebalancingThreshold": 0.05,
  "autoRebalance": true,
  "rebalanceFrequency": "monthly"
}

Response: 201 Created with target object
```

#### **GET /allocations/:allocationId**
Get specific allocation target

#### **PATCH /allocations/:allocationId**
Update allocation configuration

```bash
PATCH /api/portfolio/allocations/uuid

Body:
{
  "allocations": {
    "BTC": { "target": 0.35 }
  },
  "rebalancingThreshold": 0.07
}
```

#### **DELETE /allocations/:allocationId**
Deactivate allocation (soft delete)

### Rebalancing Analysis & Recommendations

#### **GET /allocations/:allocationId/analyze**
Analyze portfolio against target allocation

```bash
GET /api/portfolio/allocations/uuid/analyze

Response:
{
  "success": true,
  "data": {
    "recommendation": {
      "id": "uuid",
      "status": "pending",
      "priority": "high",
      "portfolioValue": 128000,
      "currentAllocations": {
        "BTC": { "value": 52500, "percent": 41.02 },
        "ETH": { "value": 24000, "percent": 18.75 }
      },
      "targetAllocations": {
        "BTC": { "value": 38400, "percent": 30 },
        "ETH": { "value": 25600, "percent": 20 }
      },
      "deviations": {
        "BTC": { "deviation": 0.1102, "direction": "overweight" },
        "ETH": { "deviation": -0.0125, "direction": "underweight" }
      },
      "moves": [
        { "from": "BTC", "to": "ETH", "amount": 5000, "reason": "rebalance" },
        { "from": "BTC", "to": "BOND", "amount": 3000, "reason": "rebalance" }
      ],
      "estimatedCost": 12.50,
      "estimatedSlippage": 25.00,
      "taxImpact": {
        "realizedGains": 2000,
        "realizedLosses": 1000,
        "netGains": 1000,
        "estimatedTaxCost": 350
      },
      "taxHarvestingMoves": [
        { "sell": "ETH", "buy": "BTC", "loss": 1000, "purpose": "harvest" }
      ],
      "harvestablelosses": 1000,
      "createdAt": "2024-01-15T10:00:00Z",
      "expiresAt": "2024-01-16T10:00:00Z"
    }
  }
}
```

#### **GET /recommendations**
List all recommendations (pending, approved, executed)

```bash
GET /api/portfolio/recommendations?status=pending&limit=20

Query Parameters:
- status (optional): pending, approved, accepted, executed, expired, rejected
- limit (optional, default=20): Results to return
```

#### **POST /recommendations/:recommendationId/execute**
Execute an approved recommendation

```bash
POST /api/portfolio/recommendations/uuid/execute

Body:
{
  "approvalNotes": "Proceed with rebalancing"  // Optional
}

Response:
{
  "success": true,
  "message": "Rebalancing executed successfully",
  "data": {
    "recommendation": { ... },
    "transactions": [
      {
        "id": "uuid",
        "status": "pending",
        "fromAsset": "BTC",
        "toAsset": "ETH",
        "transactionFee": 6.25
      }
    ]
  }
}
```

### Tax Management

#### **GET /tax-summary**
Get tax optimization overview

```bash
GET /api/portfolio/tax-summary

Response:
{
  "success": true,
  "data": {
    "summary": {
      "totalHoldings": 4,
      "unrealizedGains": 8500,
      "unrealizedLosses": 1000,
      "harvestablelosses": 1000,
      "longTermGains": 8500,
      "shortTermGains": 0,
      "daysUntilLongTerm": 265  // For short-term positions
    }
  }
}
```

#### **GET /tax-lots**
Get individual tax lots (asset purchases)

```bash
GET /api/portfolio/tax-lots?assetSymbol=ETH&harvestable=true

Query Parameters:
- assetSymbol (optional): Filter by asset
- harvestable (optional): true = only harvestable losses

Response:
{
  "success": true,
  "data": {
    "lots": [
      {
        "id": "uuid",
        "assetSymbol": "ETH",
        "quantity": "20",
        "costBasis": "25000",
        "currentValue": "24000",
        "unrealizedGain": "-1000",
        "acquisitionDate": "2024-01-10T00:00:00Z",
        "isLongTerm": false,
        "daysHeld": 5,
        "canBeHarvested": true,
        "washSaleExcludeUntil": null,
        "status": "open"
      }
    ]
  }
}
```

### History & Analytics

#### **GET /history**
Rebalancing transaction history

```bash
GET /api/portfolio/history?limit=20

Response:
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "uuid",
        "transactionType": "swap",
        "fromAsset": "BTC",
        "toAsset": "ETH",
        "fromQuantity": "0.5",
        "toQuantity": "8",
        "executedAt": "2024-01-15T11:30:00Z",
        "transactionFee": 6.25,
        "status": "filled",
        "realizedGain": 500,
        "isTaxHarvest": false
      }
    ]
  }
}
```

#### **GET /analytics**
Portfolio performance metrics by period

```bash
GET /api/portfolio/analytics?allocationId=uuid&periodType=monthly

Query Parameters:
- allocationId (required): Allocation target ID
- periodType (optional, default=monthly): daily, weekly, monthly, quarterly, yearly

Response:
{
  "success": true,
  "data": {
    "analytics": [
      {
        "periodStart": "2024-01-01T00:00:00Z",
        "periodEnd": "2024-02-01T00:00:00Z",
        "portfolioValue": 128000,
        "totalReturn": 2.5,
        "maxAllocationDrift": 0.12,
        "rebalancingCount": 1,
        "totalRebalancingCost": 12.50,
        "realizedGains": 2000,
        "realizedLosses": 1000,
        "harvestedLosses": 1000,
        "estimatedTaxCost": 350,
        "targetAlignmentScore": 92,
        "efficiencyScore": 88
      }
    ]
  }
}
```

---

##  Feature Configuration

### Allocation Target Strategy Types

#### **Conservative**
- Bonds/Cash: 60%
- Stocks: 35%
- Crypto: 5%
- Purpose: Capital preservation

#### **Balanced**
- Crypto: 25%
- Stocks: 50%
- Bonds/Cash: 25%
- Purpose: Balanced growth and stability

#### **Aggressive**
- Crypto: 50%
- High-growth stocks: 40%
- Bonds/Cash: 10%
- Purpose: Maximum growth

#### **Crypto-Heavy**
- BTC: 40%
- ETH: 30%
- Altcoins: 20%
- Stables: 10%
- Purpose: Crypto portfolio optimization

#### **Index-Following**
- SPY (S&P 500): 40%
- VTI (Total Market): 30%
- VXUS (International): 20%
- Bonds: 10%
- Purpose: Passive index tracking

### Tax Optimization Settings

**Enable Tax Optimization** (default: true)
- Automatically identifies losses to harvest
- Offset gains with harvested losses
- Prioritize long-term vs short-term treatment

**Prefer Tax Loss Harvesting** (default: true)
- Actively suggest loss-harvesting rebalancing
- Use tax-loss harvesting as reason for move

**Minimum Gain for Realization** (default: $100)
- Only harvest losses if severity threshold met
- Avoids excessive trading for minimal tax benefit

**Tax Rate Assumption** (default: 35%)
- Used to estimate tax cost/benefit
- Blended federal + state rate
- Configurable per user

### Cost Control Settings

**Max Transaction Cost** (optional)
- Reject rebalancing if fees exceed amount
- Ensures cost-effective rebalancing

**Max Slippage** (default: 0.5%)
- Limit price impact tolerance
- Influences rebalancing decision

**Preferred Exchanges** (optional)
- List of approved exchanges/brokers
- Use lowest-fee options

### Auto-Rebalancing Settings

**Auto Rebalance** (boolean)
- Enable automatic periodic rebalancing
- User doesn't need to approve each time

**Rebalance Frequency**
- daily: Every calendar day
- weekly: Same day each week
- monthly: Same date each month
- quarterly: Quarter-end

**Rebalance Day**
- For weekly: 1-7 (Sunday-Saturday)
- For monthly: 1-31 (day of month)
- For quarterly: Automatic (month-end)

---

## Testing

**Test File**: `backend/__tests__/portfolioRebalancing.test.js`

Comprehensive scenarios:

```javascript
describe('Portfolio Rebalancing Service', () => {
  // Portfolio Analysis
  - Should retrieve portfolio holdings
  - Should calculate portfolio value
  - Should calculate allocation percentages
  - Should identify allocation deviations

  // Rebalancing
  - Should generate rebalancing recommendation
  - Should not recommend when within bounds
  - Should estimate transaction costs

  // Tax-Loss Harvesting
  - Should identify tax-loss opportunities
  - Should find similar asset for wash-sale avoidance
  - Should calculate tax impact correctly
  - Should get tax summary

  // Execution
  - Should execute rebalancing
  - Should get rebalancing history

  // Analytics
  - Should get portfolio analytics
})
```

**Run Tests**:
```bash
npm test -- portfolioRebalancing.test.js
```

---

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Get holdings | O(n) | n = number of assets (typically <50) |
| Calculate allocations | O(n) | Linear scan of holdings |
| Generate recommendation | O(n) | Calculate deviations, find matches |
| Tax harvesting scan | O(m) | m = number of tax lots (typically <200) |
| Execute rebalancing | O(k) | k = number of moves (typically <10) |

### Space Complexity

- Portfolio state: O(n) assets
- Recommendation: O(k) moves
- Tax lots: O(m) individual purchases
- Total: O(n + m + k) ≈ O(200-500) per user

### Latencies (Typical)

- `analyzePortfolioAndRecommend()`: **50-200ms**
  - Depends on portfolio complexity
  - Cached after generation (1 hour TTL)

- `getPortfolioAnalytics()`: **10-50ms**
  - Pre-computed period metrics
  - Simple queries

- `getTaxOptimizationSummary()`: **20-100ms**
  - Scans tax lots
  - Calculates holding periods

---

## Integration Points

### Automatic Triggers

#### 1. **New Portfolio Addition**
When user adds new holding:
- Create portfolio holding
- Create initial tax lot
- Trigger portfolio analysis (async)

#### 2. **Scheduled Rebalancing**
Auto-rebalance if enabled:
- Daily job checks `next_rebalance_date`
- Runs analysis
- Auto-executes if within cost/slippage limits
- Publishes notification event

#### 3. **Price Updates**
When asset prices updated:
- Recalculate unrealized gains/losses
- Check if drift threshold exceeded
- Flag portfolio for analysis if needed

### Outbox Events Published

```javascript
// When recommendation generated
{
  eventType: 'portfolio.rebalancing_recommended',
  payload: {
    recommendationId,
    priority,
    estimatedCost,
    maxDrift,
    harvestablelosses
  }
}

// When rebalancing executed
{
  eventType: 'portfolio.rebalancing_executed',
  payload: {
    recommendationId,
    transactionCount,
    totalCost,
    taxBenefit
  }
}

// Tax report generation
{
  eventType: 'portfolio.tax_report_ready',
  payload: {
    year,
    realizedGains,
    realizedLosses,
    harvestedLosses
  }
}
```

---

## Troubleshooting

### Issue: Recommendations Not Generating

**Symptoms**: `analyzePortfolioAndRecommend()` returns null

**Causes**:
- Portfolio value is 0 (no holdings)
- Allocation drift < threshold (within acceptable variance)
- No target allocation configured

**Solutions**:
- Add holdings to portfolio
- Lower rebalancing threshold temporarily
- Create allocation target if missing
- Check if holdings have valid `currentValue`

### Issue: Tax Harvesting Not Working

**Symptoms**: `harvestablelosses` sum is 0, no tax-harvesting moves

**Causes**:
- No unrealized losses (all positions green)
- Positions in wash-sale restriction
- Tax optimization disabled
- Tax lots not recording properly

**Solutions**:
- Check positions have losses in `tax_lots` table
- Verify `wash_sale_exclude_until` dates are in past
- Enable `tax_optimization` in allocation target
- Verify `can_be_harvested = true` for loss positions

### Issue: Transaction Costs Too High

**Symptoms**: Rebalancing rejected due to cost, users complain of low execution rate

**Causes**:
- Asset pairs have high spreads
- Trading volume is low
- Fee structure not optimized
- Preferred exchanges have poor liquidity

**Solutions**:
- Use larger trade sizes (reduce frequency)
- Switch preferred exchanges to high-liquidity venues
- Increase `max_transaction_cost` threshold
- Adjust `max_slippage` tolerance higher

### Issue: Excessive Slippage in Estimates

**Symptoms**: Actual slippage 2-3x higher than estimated

**Causes**:
- Slippage model underestimates market impact
- Market volatility increased since recommendation
- Poor trade execution (wrong venue or time)

**Solutions**:
- Increase `max_slippage` buffer (e.g., 1% instead of 0.5%)
- Reduce trade sizes
- Implement TWAP/VWAP for large orders
- Trade during high-liquidity sessions

---

## Future Enhancements

### Phase 2

1. **Multi-Account Portfolio**
   - Aggregate holdings across multiple accounts/exchanges
   - Single recommendation across accounts (if permitted)

2. **Advanced Tax Strategies**
   - Specific lot selection (instead of FIFO)
   - Estimated tax payment planning
   - Tax-loss carryforward tracking

3. **Dividend/Interest Management**
   - Automatic dividend reinvestment
   - Interest income tracking
   - Tax-efficient cash management

4. **International Tax Compliance**
   - FATCA reporting
   - Treaty benefits tracking
   - Currency gain/loss tracking

5. **Machine Learning Optimization**
   - Learn user rebalancing preferences
   - Predict optimal rebalancing times
   - Anomaly detection in market conditions

6. **Real-Time Risk Monitoring**
   - Portfolio beta calculation
   - Value-at-Risk (VaR) tracking
   - Concentration risk alerts

### Phase 3

- Options strategy rebalancing
- Futures margin tracking
- Synthetic replication for lower-cost execution
- Blockchain/DeFi portfolio support

---

## References

### Files Created/Modified

**Created**:
- `backend/db/schema-portfolio-rebalancing.js` - Schema with 6 tables
- `backend/drizzle/0015_portfolio_rebalancing_tax_loss.sql` - Migration
- `backend/services/portfolioRebalancingService.js` - Core service
- `backend/routes/rebalancing.js` - REST API routes
- `backend/__tests__/portfolioRebalancing.test.js` - Test suite
- `PORTFOLIO_REBALANCING_IMPLEMENTATION.md` - This guide

**Modified**:
- `backend/server.js` - Added rebalancing routes import and registration
- `backend/db/schema.js` - Added portfolio rebalancing schema export

### Related Issues

- **#609**: Time-series forecasting
- **#610**: Model drift detection
- **#611**: Goal sharing with RBAC
- **#612**: Expense anomaly detection
- **#613**: Portfolio rebalancing with tax-loss harvesting (this issue)

### External References

- **IRS Wash Sale Rule**: https://www.irs.gov/publications/p550#en_US_2021_pubch4
- **FIFO vs LIFO vs Specific ID**: https://www.investopedia.com/terms/l/lifo.asp
- **Long-Term Capital Gains**: https://www. irs.gov/taxtopics/tc409

---

## Summary

Issue #613 implements intelligent portfolio rebalancing with complete tax optimization:

- **Multi-currency support**: Track holdings in any currency/asset type
- **Automatic drift detection**: Monitor allocation variance from targets
- **Cost-aware suggestions**: Minimize fees, slippage, currency conversion
- **Tax-loss harvesting**: Identify and execute loss-harvesting opportunities automatically
- **Wash-sale compliance**: Track 30-day restriction and suggest substitutes
- **Auto-rebalancing**: Execute periodic rebalancing without user intervention
- **Complete audit trail**: Track all rebalancing decisions and outcomes
- **Performance analytics**: Understand portfolio efficiency and returns

The system enables users to maintain optimized, tax-efficient portfolios with minimal effort through intelligent automation and real-time recommendations.
