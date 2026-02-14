import { EventEmitter } from 'events';

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase limit for many listeners
  }

  // Helper to standardise event emissions
  emitEvent(eventName, data) {
    console.log(`[EventBus] Emitting: ${eventName}`);
    this.emit(eventName, data);
  }
}

const eventBus = new EventBus();
export default eventBus;
