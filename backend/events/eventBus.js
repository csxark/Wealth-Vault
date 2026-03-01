import { EventEmitter } from 'events';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Autonomous Financial Event Bus (#461)
 * ─────────────────────────────────────
 * Singleton pub/sub hub for the entire Wealth Vault backend.
 * Every domain (expenses, vaults, debts, macros, governance) emits typed
 * events here. The WorkflowEngine and listeners subscribe to drive
 * autonomous orchestration without tight coupling.
 *
 * Canonical event catalogue:
 *   EXPENSE_CREATED              { userId, amount, categoryId, vaultId }
 *   EXPENSE_SPIKE_DETECTED       { userId, amount, categoryId }
 *   EXPENSE_CAP_EXCEEDED         { userId, categoryId, capAmount }
 *   VAULT_BALANCE_UPDATED        { userId, vaultId, balance, currency }
 *   VAULT_SWEEP_COMPLETED        { userId, fromVaultId, toVaultId, amount }
 *   LIQUIDITY_RUNWAY_CHANGE      { userId, value }
 *   DEBT_APR_CHANGE              { userId, debtId, value }
 *   DEBT_PAYOFF_INITIATED        { userId, debtId, strategy }
 *   MARKET_VOLATILITY_CHANGE     { userId, value }
 *   MACRO_VIX_UPDATE             { userId, value }
 *   TAX_LIABILITY_THRESHOLD      { userId, value }
 *   GOVERNANCE_QUORUM_REACHED    { userId, resolutionId }
 *   GOVERNANCE_VOTE_CAST         { userId, resolutionId, vote }
 *   WORKFLOW_EXECUTED            { userId, workflowId, workflowName, status, durationMs }
 *   AUTOPILOT_ALERT              { userId, title, message, severity }
 *   AUTOPILOT_VAULT_SWEEP        { userId, fromVaultId, toVaultId, amount }
 *   AUTOPILOT_EXPENSE_CAP        { userId, categoryId, capAmount, durationDays }
 *   AUTOPILOT_DEBT_PAYOFF        { userId, debtId, strategy }
 *   AUTOPILOT_REBALANCE          { userId, portfolioId, targetAllocation }
 *   AUTOPILOT_HARVEST            { userId, threshold }
 *   AUTOPILOT_GOVERNANCE_VOTE    { userId, resolutionId, vote, reason }
 *   AUTOPILOT_FX_SWAP            { userId, fromCurrency, toCurrency, amount, vaultId }
 *   AUTOPILOT_FUND_GOAL          { userId, goalId, amount, fromVaultId }
 */
class FinancialEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // High-throughput scaling

    // Dead-letter queue for events with no listeners (avoids silent drops)
    this._dlq = [];
  }

  /**
   * Publish an event to the bus with structured logging.
   * @param {string} eventName
   * @param {object} payload – must always include userId for auditability
   */
  emit(eventName, payload = {}) {
    if (this.listenerCount(eventName) === 0) {
      // Push to dead-letter queue for diagnostics
      this._dlq.push({ eventName, payload, ts: new Date().toISOString() });
      if (this._dlq.length > 200) this._dlq.shift(); // Rolling window
    }

    logInfo(`[EventBus] ▶ ${eventName} | user=${payload.userId || 'system'}`);
    super.emit(eventName, payload);
  }

  /**
   * Subscribe with error isolation — listener crashes don't propagate.
   */
  subscribe(eventName, handler) {
    this.on(eventName, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logError(`[EventBus] Listener error on "${eventName}": ${err.message}`);
      }
    });
  }

  /** Expose dead-letter queue for admin diagnostics */
  getDLQ() {
    return [...this._dlq];
  }

  /** Flush dead-letter queue */
  flushDLQ() {
    const snapshot = [...this._dlq];
    this._dlq = [];
    return snapshot;
  }
}

const eventBus = new FinancialEventBus();
export default eventBus;
