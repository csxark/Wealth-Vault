# 📊 Advanced Portfolio Rebalancing & Asset Drift Manager

A sophisticated portfolio management engine designed to keep user investments aligned with their long-term financial goals through automated drift detection and trade optimization.

## 🚀 Core Features

### 1. Drift Detection Engine (`rebalanceEngine.js`)
*   **Real-time Monitoring**: Calculates the deviation (drift) of current asset holdings from user-defined target percentages.
*   **Tolerance Bands**: Supports "Smart Bands" (e.g., ±5%) where rebalancing is only suggested if the drift exceeds the allowed threshold, preventing unnecessary trading fees.
*   **Drift Logging**: Tracks a historical record of portfolio health over time.

### 2. Trade Optimizer (`tradeOptimizer.js`)
*   **Tax-Loss Harvesting Awareness**: Proposes trades while considering potential tax impacts.
*   **Fee Minimization**: Aggregates trades and filters out "dust" orders that would be inefficient due to fixed transaction costs.
*   **Execution Strategies**: Automatically assigns execution methods (e.g., TWAP for crypto, Limit for stocks) based on asset volatility.

### 3. Hourly Health Monitor (`driftMonitor.js`)
*   **Automated Scanning**: A background worker that checks every active portfolio every hour for drift breaches.
*   **Proactive Alerts**: Hooks for notifying users the moment their portfolio requires attention.

---

## 🛠 Database Architecture

| Table | Purpose |
| :--- | :--- |
| `target_allocations` | Stores the desired % mix (e.g., 60% Stocks, 40% Bonds) for each portfolio. |
| `rebalance_history` | Audit trail of all rebalancing plans proposed and executed. |
| `drift_logs` | Hourly snapshots of asset deviations used for health analytics. |

---

## 📡 API Reference

### Configuration
*   `GET /api/rebalancing/:id/targets`: Retrieve current allocation goals.
*   `POST /api/rebalancing/:id/targets`: Update target percentages (must sum to 100%).

### Analysis
*   `GET /api/rebalancing/:id/drift`: Instant check of current asset deviations.
*   `POST /api/rebalancing/:id/propose`: Generate an optimized list of buy/sell orders to restore balance.

---

## 🔒 Safety Systems
*   **Sum-To-100 Validation**: Middleware ensures that target allocations always mathematically represent a complete portfolio.
*   **Ownership Check**: Rebalance commands are scoped strictly to the authenticated owner of the portfolio.

---
*Maintaining equilibrium in a volatile market.*
