// backend/events/esgEvents.js
const eventBus = require('./eventBus');
const AlertNotificationService = require('../services/alertNotificationService');

function emitESGScreening(userId, complianceScore, flagged) {
  eventBus.emit('ESG_SCREENING', { userId, complianceScore, flagged });
}

eventBus.on('ESG_SCREENING', async ({ userId, complianceScore, flagged }) => {
  const alert = AlertNotificationService.generateESGAlert(userId, complianceScore, flagged);
  // Save or send alert as needed
});

module.exports = { emitESGScreening };
