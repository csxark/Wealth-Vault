# TODO: Implement Budget Alerts and Notifications

## Tasks
- [ ] Add budget_alerts table to database schema
- [ ] Create notification service for sending alerts
- [ ] Add budget checking logic in expenses route
- [ ] Create budget alerts API endpoint
- [ ] Add budget alert components to dashboard
- [ ] Update category management to show budget status
- [ ] Add notification preferences UI
- [ ] Run database migrations
- [ ] Test alert triggering with sample expenses
- [ ] Configure email service for notifications

## Completed Features
- [x] Multi-Currency Engine & FX Normalization
  - [x] exchangeRates table added to database schema
  - [x] currencyService.js with caching and fallback mechanisms
  - [x] syncRates.js for daily background sync
  - [x] currencies.js REST API endpoints
  - [x] Database migration applied
  - [x] Currency routes registered in server.js
  - [x] Currency conversion integrated in analytics.js
  - [x] EXCHANGE_RATE_API_KEY environment variable configured
  - [x] Currency conversion tested (POST /api/currencies/convert)
  - [x] Daily sync job verified (POST /api/currencies/sync)
