// SchedulerService: manages recurring schedules

const BillService = require('./billService');

class SchedulerService {
	static runScheduler() {
		// Run recurring bill scheduling
		BillService.scheduleRecurringBills();
		console.log('Recurring bills scheduled.');
	}
}

module.exports = SchedulerService;
