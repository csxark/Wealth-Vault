// backend/utils/taxFilingExport.js
const { exportToJSON, exportToCSV } = require('../services/alertNotificationService');

function exportFilings(filings, format = 'json') {
  const alerts = filings.map(filing => ({
    userId: filing.userId,
    taxYear: filing.taxYear,
    deadline: filing.deadline,
    filedDate: filing.filedDate,
    status: filing.status,
    penalties: filing.penalties
  }));
  return format === 'csv' ? exportToCSV(alerts) : exportToJSON(alerts);
}

module.exports = { exportFilings };
