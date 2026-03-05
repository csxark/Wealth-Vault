// backend/events/retirementEvents.js
const eventBus = require('./eventBus');
const AlertNotificationService = require('../services/alertNotificationService');

function emitRetirementGap(userId, gap, percentShortfall) {
  eventBus.emit('RETIREMENT_GAP', { userId, gap, percentShortfall });
}

eventBus.on('RETIREMENT_GAP', async ({ userId, gap, percentShortfall }) => {
  const alert = AlertNotificationService.generateRetirementGapAlert(userId, gap, percentShortfall);
  // Save or send alert as needed
});

module.exports = { emitRetirementGap };
