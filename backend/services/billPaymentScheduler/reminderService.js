// ReminderService: notifications for upcoming bills

const BillService = require('./billService');
const { User } = require('./models');

class ReminderService {
	static sendReminder(user, bill) {
		// Simulate sending email/SMS
		console.log(`Reminder sent to ${user.email} for bill '${bill.name}' due on ${bill.dueDate}`);
		return true;
	}

	static sendUpcomingReminders(users, daysAhead = 7) {
		users.forEach(user => {
			const upcomingBills = BillService.getUpcomingBills(user.id, daysAhead);
			upcomingBills.forEach(bill => {
				this.sendReminder(user, bill);
			});
		});
	}
}

module.exports = ReminderService;
