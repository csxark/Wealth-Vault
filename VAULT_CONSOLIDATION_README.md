# Multi-Vault Portfolio Consolidation & Cross-Vault Analytics

## Overview
The Multi-Vault Consolidation feature allows users to group multiple vaults into unified portfolios. This provides a "bird's eye view" of total net worth, asset allocation, and risk exposure across disparate accounts, enabling more comprehensive financial planning.

## Key Components

### 1. Vault Grouping
Users can create custom logical groups (e.g., "Retirement Portfolio", "Active Trading", "Family Trust") and map multiple vaults to these groups.

### 2. Global Consolidation
The system automatically aggregates data from all vaults in a group, calculating:
- Combined Net Worth
- Total Assets vs Liabilities
- Aggregated Cash Balances

### 3. Cross-Vault Analytics
AI-powered analytics engine that works across the consolidated data:
- **Asset Allocation**: Holistic view of diversification across the entire group.
- **Risk Exposure**: Analysis of correlations and volatility across combined portfolios.
- **Yield Analysis**: Weighted yield calculations comparing performance across vaults.
- **Tax Efficiency**: Identification of tax-loss harvesting or optimization opportunities across accounts.

### 4. Background Synchronization
A periodic job runs every 4 hours to refresh snapshots and update analytics, ensuring the consolidated view remains current.

## Database Schema

- **vault_groups**: Stores group metadata.
- **vault_group_mappings**: Bridges individual vaults to groups.
- **consolidated_snapshots**: Time-series performance data for groups.
- **consolidated_analytics**: Stores AI-generated insights and metrics.

## API Documentation

### Vault Groups
- `POST /api/vault-consolidation/groups`: Create a new vault group.
- `GET /api/vault-consolidation/groups`: List current user's vault groups.

### Consolidation & Sync
- `POST /api/vault-consolidation/sync/:groupId`: Manually trigger a refresh cycle for a group.

### Analytics & Insights
- `GET /api/vault-consolidation/analytics/:groupId`: Retrieve the latest insights for a group.
- `POST /api/vault-consolidation/analytics/:groupId/generate`: Force generation of new analytics.
- `GET /api/vault-consolidation/history/:groupId`: Get historical performance data for charting.

## Implementation Details

### Consolidator Logic
The `vaultConsolidator` service handles the core math of summing balances and assets across multiple vault identifiers. It handles currency normalization and metadata enrichment.

### Analytics Engine
The `crossVaultAnalytics` service uses the aggregated data points to generate sector exposure, risk metrics (Beta, VaR), and efficiency insights that are not visible when looking at single vaults in isolation.

## Performance Considerations
Aggregation is performed in background jobs to ensure that manual sync requests are responsive and do not block the main event loop.

---
**Version**: 1.0.0
**Issue**: #274
