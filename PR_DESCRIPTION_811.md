# PR Description: Issue #811 – Balance Transfer Rate Arbitrage Engine

**Summary:**  
This PR adds the Balance Transfer Rate Arbitrage Engine service and wires a new POST endpoint `/api/debts/balance-transfer/optimize` in the backend. The service helps credit cardholders identify optimal 0% balance transfer opportunities, calculate fee vs. interest savings, and generate actionable transfer plans to minimize interest costs.

**Key Features:**
- Identifies eligible 0% balance transfer cards in the user's portfolio.
- Calculates transfer fee cost vs. interest savings for each debt and offer.
- Models payoff scenarios: pay off within 0% window vs. extend beyond.
- Ranks transferable debts by APR, balance, and payoff timeline.
- Simulates sequential transfers (rotating through 0% windows over 2-3 years).
- Calculates total interest savings vs. fee costs.
- Recommends which debts to transfer, target order, and payoff timeline.
- Flags cards near credit limit and recommends post-transfer utilization.
- Generates a transfer action plan (call bank, initiate transfer, monitor progress).
- Comprehensive request validation and stateless, modular service design.

**Files Added/Modified:**
- `backend/services/balanceTransferRateArbitrageEngineService.js`: Implements arbitrage logic and recommendations.
- `backend/routes/debts.js`: Adds POST endpoint with validation for balance transfer optimization.

**Testing & Validation:**
- All new code passes static analysis and error checks.
- Endpoint is wired and ready for integration testing.

**Documentation:**
- Service and endpoint usage documented in code comments.
- PR description summarizes implementation and usage.

**Closes:** #811
