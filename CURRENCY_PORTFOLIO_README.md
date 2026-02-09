# Multi-Currency Portfolio Manager

## Overview
The Multi-Currency Portfolio Manager is a core feature for international investors and users with assets across different countries. It allows for seamless tracking, conversion, and consolidation of financial positions in various global currencies, including support for real-time FX rates and currency hedging.

## Core Components

### 1. Currency Manager 🏦
Handles user-specific settings and consolidations:
- **Base Currency**: Set a primary currency (e.g., USD, INR) for global reporting.
- **Preference Tracking**: Manage multiple secondary currencies used in specific accounts.
- **Auto-Refresh**: Configure which currencies should be automatically updated.
- **Consolidated Valuation**: Aggregates varied assets into the base currency value using the latest FX rates.

### 2. FX Converter 💱
The engine behind currency transformations:
- **Rate Discovery**: Fetches live market rates from external providers (OpenExchangeRates, etc.).
- **Caching Layer**: Optimized to reduce external API calls and latency.
- **Historical Rates**: Access past exchange rates for performance analysis and trend tracking.
- **Conversion API**: Programmatically convert amounts between any supported pair.

### 3. Hedging Tracker 🛡️
Advanced feature for managing currency risk:
- **Position Tracking**: Monitor forward contracts, options, or swaps designed to hedge FX volatility.
- **Gain/Loss Analysis**: Track realized and unrealized gains from hedging positions.
- **Expiry Management**: Get notified when hedging contracts are nearing their expiration date.

## Database Schema

### User Currencies Table
Stores user-specific currency settings.
```javascript
export const userCurrencies = pgTable('user_currencies', {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    currencyCode: text('currency_code').notNull(),
    isBaseCurrency: boolean('is_base_currency').default(false),
    manualRate: numeric('manual_rate')
});
```

### Exchange Rate History Table
Permanent log of all fetched or manual FX rates.
```javascript
export const exchangeRateHistory = pgTable('exchange_rate_history', {
    id: uuid('id').primaryKey(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull(),
    rate: numeric('rate').notNull(),
    rateTimestamp: timestamp('rate_timestamp').notNull()
});
```

### Hedging Positions Table
Tracks risk mitigation strategies.
```javascript
export const currencyHedgingPositions = pgTable('currency_hedging_positions', {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    baseCurrency: text('base_currency').notNull(),
    targetCurrency: text('target_currency').notNull(),
    notionalAmount: numeric('notional_amount').notNull(),
    hedgeType: text('hedge_type').notNull(), // forward, option, swap
    status: text('status').default('active')
});
```

## API Endpoints

### Set Base Currency
`POST /api/currency-portfolio/base`
- **Request**: `{ "currencyCode": "EUR" }`
- **Effect**: Switches the global reporting currency for the user and updates all valuations.

### Convert Amount
`POST /api/currency-portfolio/convert`
- **Request**: `{ "amount": 1000, "from": "GBP", "to": "USD" }`
- **Response**: Returns the converted amount and the exact rate used.

### Get Preferences
`GET /api/currency-portfolio/preferences`
- **Response**: List of all currencies tracked by the user and their base currency setting.

### Create hedge
`POST /api/currency-portfolio/hedges`
- **Request**: `{ "targetCurrency": "JPY", "notionalAmount": 500000, "hedgeType": "forward" }`
- **Effect**: Registers a new hedging position for risk monitoring.

## Background Jobs

### FX Rate Updater
Runs hourly to:
1. Identify all currency codes currently in use by active users.
2. Fetch the latest market rates for those codes against USD.
3. Update the `exchangeRateHistory` and invalidate local caches.

## Supported Currencies
The system currently provides high-fidelity tracking for:
- **Fiat**: USD, EUR, GBP, INR, JPY, CAD, AUD, CHF, CNY, SGD
- **Crypto (Extended)**: BTC, ETH (via specialized providers)

---
**Version**: 1.0.0  
**Issue**: #297
