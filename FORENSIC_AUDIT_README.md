# 🔍 Forensic Financial Health Auditor & Stress Tester

Welcome to the most advanced layer of **Wealth-Vault's** security and planning engine. This module provides institutional-grade forensic analysis and crisis simulation for personal finances.

## 🚀 Key Features

### 1. Forensic Audit Engine (`auditEngine.js`)
Detects suspicious activities before they become liabilities.
*   **Z-Score Outlier Detection**: Automatically flags transactions that significantly deviate from your historical spending average.
*   **Velocity Monitoring**: Re-evaluates risk if multiple high-value transactions occur within a narrow time window.
*   **Duplicate Payout Guard**: Real-time detection of identical payments made to the same merchant within 5 minutes.
*   **Geolocation Logic**: (Alpha) Ready for integration with merchant location Jump Analysis.

### 2. Liquidity Stress Simulator (`stressSimulator.js`)
Worry less about the future by simulating it today.
*   **Monte Carlo Logic**: Project how many days you can survive during a "Total Job Loss" or "Market Crash."
*   **Survival Runway**: Calculation of precisely which date your liquidity hits ZERO.
*   **Dynamic Adjustments**: Factoring in sudden expense spikes (e.g., Medical Emergencies) vs. partial income flows.
*   **AI Recommendations**: Contextual advice on whether to liquidate assets, cut discretionary spending, or hedge with stable-coins.

### 3. Automated Anomaly Detector (`anomalyDetector.js`)
*   **Background Cron**: Runs every day at 2:00 AM.
*   **Audit Logging**: Every anomaly is persisted to the `audit_logs` table for future review.

---

## 🛠 Database Schema

| Table | Purpose |
| :--- | :--- |
| `audit_logs` | Permanent record of detected anomalies and security scans. |
| `stress_scenarios` | Saved crisis parameters and survival runway results. |
| `anomaly_patterns` | Configurable rules for the audit engine (thresholds, logic types). |

---

## 📡 API Reference

### Audit
*   `POST /api/forensic-audit/scan`: Manually trigger a forensic scan for the current user.
*   `GET /api/forensic-audit/logs`: Retrieve recent audit logs and flagged anomalies.
*   `GET /api/forensic-audit/patterns`: List active detection patterns and their hit counts.

### Stress Testing
*   `POST /api/forensic-audit/scenarios`: Create a new custom crisis scenario.
*   `POST /api/forensic-audit/scenarios/:id/run`: Run simulation and get survival runway data.

---

## 🔒 Security & Performance
*   **Rate Limiting**: Stress simulations are CPU-bound; hence, they are limited to 3 runs per minute per user via `auditValidator.js`.
*   **Data Integrity**: Ownership of scenarios is strictly enforced.
*   **Atomicity**: All audit logs are written in a strictly serializable manner to ensure no detection is lost.

---
*Developed as part of the Wealth-Vault Advanced Intelligence Layer.*
