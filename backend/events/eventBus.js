import { EventEmitter } from 'events';
import { logInfo } from '../utils/logger.js';

/**
 * Autonomous Financial Event-Bus (L3)
 * Central hub for broadcasting cross-service state changes.
 */
class FinancialEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // High-frequency scaling
  }

  /**
   * Publish an event to the bus
   * @param {string} eventName - Name of the event (e.g., 'DEBT_APR_CHANGE')
   * @param {Object} payload - Event data
   */
  emit(eventName, payload) {
    logInfo(`[EventBus] Publishing event: ${eventName} for user ${payload.userId}`);
    super.emit(eventName, payload);
  }
}

const eventBus = new FinancialEventBus();
export default eventBus;
