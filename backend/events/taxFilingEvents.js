// backend/events/taxFilingEvents.js
const eventBus = require('./eventBus');
const TaxFilingRepository = require('../repositories/taxFilingRepository');
const AlertNotificationService = require('../services/alertNotificationService');

function emitFilingCreated(filing) {
  eventBus.emit('TAX_FILING_CREATED', filing);
}

function emitFilingUpdated(filing) {
  eventBus.emit('TAX_FILING_UPDATED', filing);
}

eventBus.on('TAX_FILING_CREATED', async (filing) => {
  // Generate alert for new filing
  const alerts = AlertNotificationService.generateBillAlerts({
    userId: filing.userId,
    taxYear: filing.taxYear,
    dueDate: filing.deadline,
    status: filing.status,
    amount: filing.penalties,
    vaultId: null,
    recurringTransactionId: null
  }, { merchant: 'Tax Authority' });
  // Save or send alerts as needed
});

eventBus.on('TAX_FILING_UPDATED', async (filing) => {
  // Update alerts or escalate if status is late
  if (filing.status === 'late') {
    // Escalate alert
    const alerts = AlertNotificationService.generateBillAlerts({
      userId: filing.userId,
      taxYear: filing.taxYear,
      dueDate: filing.deadline,
      status: filing.status,
      amount: filing.penalties,
      vaultId: null,
      recurringTransactionId: null
    }, { merchant: 'Tax Authority' });
    // Save or escalate alerts as needed
  }
});

module.exports = { emitFilingCreated, emitFilingUpdated };
