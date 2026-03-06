// backend/utils/retirementExport.js
function exportProgress(progress, format = 'json') {
  if (format === 'csv') {
    const headers = ['Total Balance', 'Projected', 'Years To Goal', 'Percent To Goal'];
    const row = [progress.totalBalance, progress.projected, progress.yearsToGoal, progress.percentToGoal];
    return [headers, row].map(r => r.join(',')).join('\n');
  }
  return JSON.stringify(progress, null, 2);
}

module.exports = { exportProgress };
