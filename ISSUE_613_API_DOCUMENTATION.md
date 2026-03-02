# Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting

## API Documentation

Complete REST API reference for the Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting feature.

---

## Base URL
```
/api/rebalancing
/api/portfolio
```

## Authentication
All endpoints require bearer token authentication:
```
Authorization: Bearer {token}
```

---

## Portfolio Holdings

### GET `/api/rebalancing/holdings`
Get current portfolio holdings with valuations.

**Response:**
```json
{
  "success": true,
  "data": {
    "holdings": [
      {
        "id": "uuid",
        "assetSymbol": "BTC",
        "assetType": "cryptocurrency",
        "quantity": 0.5,
        "currentValue": 25000,
        "acquisitionCost": 15000,
        "unrealizedGain": 10000,
        "isLongTerm": true,
        "lastPriceUpdate": "2026-03-02T10:30:00Z"
      }
    ],
    "summary": {
      "totalValue": 50000,
      "holdingCount": 3,
      "allocations": {
        "BTC": { "value": 25000, "percent": 50, "quantity": 0.5 }
      }
    }
  }
}
```

---

## Allocation Targets

### GET `/api/rebalancing/allocations`
Get all allocation targets.

**Response:**
```json
{
  "success": true,
  "data": {
    "targets": [
      {
        "id": "uuid",
        "targetName": "Balanced",
        "strategy": "balanced",
        "riskProfile": "medium",
        "allocations": {
          "BTC": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
          "ETH": { "target": 0.20, "minBound": 0.15, "maxBound": 0.25 }
        },
        "isActive": true
      }
    ]
  }
}
```

### POST `/api/rebalancing/allocations`
Create new allocation target.

**Request:**
```json
{
  "targetName": "Balanced",
  "strategy": "balanced",
  "riskProfile": "medium",
  "allocations": {
    "BTC": { "target": 0.30, "minBound": 0.25, "maxBound": 0.35 },
    "ETH": { "target": 0.20, "minBound": 0.15, "maxBound": 0.25 },
    "USDC": { "target": 0.50, "minBound": 0.45, "maxBound": 0.55 }
  },
  "rebalancingThreshold": 0.05,
  "autoRebalance": false
}
```

### GET `/api/rebalancing/allocations/:allocationId`
Get specific allocation target details.

### PATCH `/api/rebalancing/allocations/:allocationId`
Update allocation target.

**Request:**
```json
{
  "targetName": "Updated Name",
  "allocations": { ... },
  "rebalancingThreshold": 0.07
}
```

### DELETE `/api/rebalancing/allocations/:allocationId`
Soft delete allocation target.

---

## Rebalancing Recommendations

### GET `/api/rebalancing/allocations/:allocationId/analyze`
Analyze portfolio against allocation target and generate recommendations.

**Query Parameters:**
- None required

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendation": {
      "id": "uuid",
      "portfolioValue": 50000,
      "currentAllocations": {
        "BTC": { "value": 25000, "percent": 50 }
      },
      "targetAllocations": {
        "BTC": { "value": 15000, "percent": 30 }
      },
      "deviations": {
        "BTC": { "deviation": 0.20, "direction": "overweight", "withinBounds": false }
      },
      "moves": [
        {
          "from": "BTC",
          "to": "ETH",
          "amount": 5000,
          "reason": "rebalance"
        }
      ],
      "estimatedCost": 50,
      "estimatedSlippage": 25,
      "taxImpact": {
        "realizedGains": 500,
        "realizedLosses": 0,
        "netGains": 500,
        "estimatedTaxCost": 175
      },
      "taxHarvestingMoves": [],
      "harvestableLosses": 0,
      "status": "pending",
      "priority": "high",
      "expiresAt": "2026-03-03T10:30:00Z"
    }
  }
}
```

### GET `/api/rebalancing/recommendations`
Get all rebalancing recommendations.

**Query Parameters:**
- `status` (optional): pending, approved, executed, rejected, expired
- `limit` (optional): Default 20

**Response:**
```json
{
  "success": true,
  "data": {
    "recommendations": [...]
  }
}
```

### POST `/api/rebalancing/recommendations/:recommendationId/execute`
Execute an approved recommendation.

**Request:**
```json
{
  "approvalNotes": "Approved for execution"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Rebalancing executed successfully",
  "data": {
    "recommendation": {...},
    "transactions": [...]
  }
}
```

---

## Tax-Loss Harvesting

### GET `/api/rebalancing/harvesting/opportunities`
Find all tax-loss harvesting opportunities.

**Response:**
```json
{
  "success": true,
  "data": {
    "opportunities": [
      {
        "lotId": "uuid",
        "assetSymbol": "AAPL",
        "harvestValue": 500,
        "daysHeld": 180,
        "replacementAssets": ["MSFT", "GOOGL", "NVDA"],
        "recommendation": "HARVEST_NOW"
      }
    ],
    "totalHarvestable": 2500,
    "opportunityCount": 5
  }
}
```

### GET `/api/rebalancing/harvesting/year-end-strategy`
Get year-end tax optimization strategy.

**Query Parameters:**
- `taxBracket` (optional): Default 0.35

**Response:**
```json
{
  "success": true,
  "data": {
    "strategy": {
      "currentYearSummary": {
        "realizedGains": 5000,
        "realizedLosses": 1000,
        "netGains": 4000,
        "shortTermGains": 2000,
        "longTermGains": 2000
      },
      "harvestingStrategy": {
        "totalHarvestable": 2500,
        "recommendedHarvest": 2500,
        "estimatedTaxSavings": 875,
        "annualCarryforwardLimit": 3000,
        "opportunityCount": 5
      },
      "harvestingOpportunities": [...]
    }
  }
}
```

### GET `/api/rebalancing/harvesting/carryforward`
Get capital loss carryforward amounts.

**Query Parameters:**
- `year` (optional): Year to check, defaults to current year

**Response:**
```json
{
  "success": true,
  "data": {
    "carryforward": {
      "carryforwardAmount": 5000,
      "availableToUse": 3000,
      "message": "You have $5000 in capital loss carryforward"
    }
  }
}
```

### POST `/api/rebalancing/harvesting/wash-sale-check`
Check wash-sale compliance for a trade.

**Request:**
```json
{
  "assetSymbol": "AAPL",
  "saleDate": "2026-03-02T00:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "compliance": {
      "compliant": true,
      "washSaleRestrictedUntil": "2026-04-01T00:00:00Z",
      "conflictingTransactions": [],
      "message": "No wash-sale violations detected"
    }
  }
}
```

### GET `/api/rebalancing/harvesting/tax-lot/:lotId/implications`
Get tax implications for specific tax lot.

**Response:**
```json
{
  "success": true,
  "data": {
    "implications": {
      "taxLotId": "uuid",
      "assetSymbol": "AAPL",
      "acquisitionDate": "2024-03-02T00:00:00Z",
      "daysHeld": 366,
      "isLongTerm": true,
      "quantity": 10,
      "costBasis": 1500,
      "currentValue": 2000,
      "unrealizedGain": 500,
      "taxRate": 0.20,
      "estimatedTax": 100,
      "harvestBenefit": 0,
      "recommendation": "HOLD"
    }
  }
}
```

### GET `/api/rebalancing/tax-summary`
Get portfolio tax optimization summary.

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalHoldings": 15,
      "unrealizedGains": 25000,
      "unrealizedLosses": 2500,
      "harvestablelosses": 2500,
      "longTermGains": 15000,
      "shortTermGains": 10000,
      "daysUntilLongTerm": 45
    }
  }
}
```

### GET `/api/rebalancing/tax-lots`
Get tax lots (specific asset purchases for tax tracking).

**Query Parameters:**
- `assetSymbol` (optional): Filter by asset symbol
- `harvestable` (optional): true/false - only harvestable lots

**Response:**
```json
{
  "success": true,
  "data": {
    "lots": [
      {
        "id": "uuid",
        "assetSymbol": "BTC",
        "quantity": 0.5,
        "costBasis": 15000,
        "costPerUnit": 30000,
        "acquisitionDate": "2024-01-15T00:00:00Z",
        "currentValue": 25000,
        "unrealizedGain": 10000,
        "daysHeld": 414,
        "isLongTerm": true,
        "canBeHarvested": true,
        "status": "open"
      }
    ]
  }
}
```

---

## Multi-Currency Analysis

### GET `/api/rebalancing/multi-currency/analysis`
Analyze portfolio in multiple currencies.

**Query Parameters:**
- `baseCurrency` (optional): Default USD

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "baseCurrency": "USD",
      "totalPortfolioValue": 50000,
      "currencyAllocations": {
        "USD": {
          "currency": "USD",
          "valueInOwnCurrency": 30000,
          "exchangeRate": 1.0,
          "valueInBaseCurrency": 30000,
          "percent": 60
        },
        "EUR": {
          "currency": "EUR",
          "valueInOwnCurrency": 20000,
          "exchangeRate": 1.1,
          "valueInBaseCurrency": 22000,
          "percent": 44
        }
      },
      "currencyCount": 2
    }
  }
}
```

### GET `/api/rebalancing/multi-currency/exposure`
Get currency exposure summary and volatility analysis.

**Response:**
```json
{
  "success": true,
  "data": {
    "exposure": {
      "baseCurrency": "USD",
      "totalValue": 50000,
      "hedgingNeeded": false,
      "currencies": [
        {
          "currency": "USD",
          "valueInBaseCurrency": 30000,
          "percent": 60,
          "holdingCount": 5,
          "volatility": 0
        },
        {
          "currency": "EUR",
          "valueInBaseCurrency": 22000,
          "percent": 44,
          "holdingCount": 3,
          "volatility": 0.08
        }
      ]
    }
  }
}
```

### GET `/api/rebalancing/multi-currency/hedging-strategy`
Get currency hedging recommendations.

**Query Parameters:**
- `baseCurrency` (optional): Default USD

**Response:**
```json
{
  "success": true,
  "data": {
    "strategy": {
      "baseCurrency": "USD",
      "totalExposure": 2,
      "highVolatilityCurrencies": 1,
      "recommendations": [
        {
          "currency": "EUR",
          "exposure": 44,
          "volatility": 0.08,
          "recommendation": "MONITOR",
          "suggestedHedge": "NONE_YET",
          "hedgePercent": 0
        }
      ]
    }
  }
}
```

### POST `/api/rebalancing/multi-currency/optimize-conversion`
Find optimal currency conversion path.

**Request:**
```json
{
  "fromCurrency": "USD",
  "toCurrency": "EUR",
  "amount": 10000
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "optimization": {
      "fromCurrency": "USD",
      "toCurrency": "EUR",
      "amount": 10000,
      "bestPath": "USD→EUR",
      "rate": 0.92,
      "resultingAmount": 9200,
      "savings": 0
    }
  }
}
```

---

## Rebalancing Optimization

### POST `/api/rebalancing/optimization/scenarios`
Generate alternative rebalancing scenarios.

**Request:**
```json
{
  "allocationId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scenarios": [
      {
        "name": "Conservative",
        "threshold": 0.10,
        "maxSlippage": 0.003,
        "prioritizeTaxLoss": true,
        "description": "Minimizes costs, addresses only major allocations drift"
      },
      {
        "name": "Moderate",
        "threshold": 0.05,
        "maxSlippage": 0.005,
        "prioritizeTaxLoss": true,
        "description": "Balanced approach between cost and accuracy"
      }
    ]
  }
}
```

### POST `/api/rebalancing/optimization/validate-moves`
Validate proposed rebalancing moves.

**Request:**
```json
{
  "moves": [
    {
      "from": "BTC",
      "to": "ETH",
      "amount": 5000
    }
  ],
  "constraints": {
    "minPositionSize": 100,
    "maxTransactionCost": 1000
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "validation": {
      "valid": true,
      "issues": []
    }
  }
}
```

### POST `/api/rebalancing/optimization/efficiency`
Calculate rebalancing efficiency score.

**Request:**
```json
{
  "allocationId": "uuid",
  "moves": [...]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "efficiency": {
      "currentDrift": 15.5,
      "projectedDrift": 2.1,
      "driftReduction": 13.4,
      "totalCost": 75,
      "costPercent": 0.15,
      "efficiencyScore": 89.3,
      "recommendation": "RECOMMEND"
    }
  }
}
```

---

## Rebalancing History & Analytics

### GET `/api/rebalancing/history`
Get rebalancing transaction history.

**Query Parameters:**
- `limit` (optional): Default 20

**Response:**
```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "uuid",
        "transactionType": "swap",
        "fromAsset": "BTC",
        "toAsset": "ETH",
        "fromQuantity": 0.1,
        "toQuantity": 1.5,
        "transactionFee": 50,
        "slippage": 25,
        "realizedGain": 500,
        "realizedLoss": 0,
        "isTaxHarvest": false,
        "status": "filled",
        "executedAt": "2026-03-02T10:30:00Z"
      }
    ]
  }
}
```

### GET `/api/rebalancing/analytics`
Get portfolio analytics and metrics.

**Query Parameters:**
- `allocationId` (required): Allocation target ID
- `periodType` (optional): daily, weekly, monthly, quarterly - Default monthly

**Response:**
```json
{
  "success": true,
  "data": {
    "analytics": [
      {
        "id": "uuid",
        "periodStart": "2026-02-01T00:00:00Z",
        "periodEnd": "2026-03-01T00:00:00Z",
        "portfolioValue": 52000,
        "totalReturn": 4.0,
        "maxAllocationDrift": 15.2,
        "averageAllocationDrift": 8.5,
        "rebalancingCount": 2,
        "totalRebalancingCost": 150,
        "realizedGains": 2000,
        "realizedLosses": 500,
        "harvested Losses": 500,
        "targetAlignmentScore": 94.5,
        "efficiencyScore": 88.2
      }
    ]
  }
}
```

---

## Error Responses

All endpoints return error responses in this format:

```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "field": "fieldName",
      "message": "Error message"
    }
  ]
}
```

### Common Error Codes
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: User doesn't have permission
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

---

## Rate Limiting

Portfolio rebalancing endpoints have rate limits:
- 100 requests per 15 minutes per user
- 1000 requests per hour per IP
- Exceeding limits returns `429 Too Many Requests`

---

## Webhooks & Events

The service publishes events to the outbox for async processing:

### Events Published
- `portfolio.rebalancing_recommended`: Recommendation generated
- `portfolio.rebalancing_executed`: Rebalancing executed
- `portfolio.tax_harvest_completed`: Tax-loss harvest completed
- `portfolio.allocation_drifted`: Allocation drift detected

---

## Integration Examples

### Schedule Auto-Rebalancing
```bash
curl -X PATCH /api/rebalancing/allocations/{id} \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "autoRebalance": true,
    "rebalanceFrequency": "monthly",
    "rebalanceDay": 1
  }'
```

### Execute Rebalancing
```bash
# 1. Analyze portfolio
curl -X GET /api/rebalancing/allocations/{id}/analyze \
  -H "Authorization: Bearer {token}"

# 2. Review recommendation

# 3. Execute if approved
curl -X POST /api/rebalancing/recommendations/{recId}/execute \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{ "approvalNotes": "Approved" }'
```

### Tax-Loss Harvesting Workflow
```bash
# 1. Get opportunities
curl -X GET /api/rebalancing/harvesting/opportunities \
  -H "Authorization: Bearer {token}"

# 2. Check year-end strategy
curl -X GET /api/rebalancing/harvesting/year-end-strategy \
  -H "Authorization: Bearer {token}"

# 3. Execute recommendation (via main rebalancing endpoint)
```

---

## Best Practices

1. **Always check allocation drift** before major portfolio changes
2. **Review tax impact** before executing rebalancing
3. **Monitor wash-sale restrictions** when harvesting losses
4. **Use conservative scenario** if unsure, **moderate** is standard
5. **Set rebalancing threshold** based on your risk tolerance
6. **Schedule auto-rebalancing** for hands-off management
7. **Track carryforward losses** for multi-year tax planning
8. **Monitor currency exposure** if portfolio is multi-currency
