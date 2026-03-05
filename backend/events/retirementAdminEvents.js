// backend/events/retirementAdminEvents.js
const eventBus = require('./eventBus');

function emitGoalExport(userId, format) {
  eventBus.emit('RETIREMENT_GOAL_EXPORT', { userId, format });
}

eventBus.on('RETIREMENT_GOAL_EXPORT', async ({ userId, format }) => {
  // Handle export event (logging, audit, etc.)
});

module.exports = { emitGoalExport };
