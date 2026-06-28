// backend/events/rebalancingEvents.js
const eventBus = require('./eventBus');
const AlertNotificationService = require('../services/alertNotificationService');

function emitRebalancingAction(userId, drift, actions) {
  eventBus.emit('REBALANCING_ACTION', { userId, drift, actions });
}

eventBus.on('REBALANCING_ACTION', async ({ userId, drift, actions }) => {
  const alert = AlertNotificationService.generateRebalancingAlert(userId, drift, actions);
  // Save or send alert as needed
});

module.exports = { emitRebalancingAction };
