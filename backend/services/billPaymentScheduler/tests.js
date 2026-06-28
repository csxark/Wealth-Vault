// Unit/integration tests

const BillService = require('./billService');
const PaymentService = require('./paymentService');
const ReminderService = require('./reminderService');
const SchedulerService = require('./schedulerService');

function runTests() {
	// Create user and bills
	const user = { id: 1, name: 'Alice', email: 'alice@example.com', phone: '1234567890' };
	const bill1 = BillService.createBill({ userId: user.id, name: 'Electricity', amount: 100, dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), recurring: true, frequency: 'monthly', paymentMethodId: 1 });
	const bill2 = BillService.createBill({ userId: user.id, name: 'Internet', amount: 50, dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), recurring: true, frequency: 'monthly', paymentMethodId: 1 });

	// Get bills
	const bills = BillService.getBillsByUser(user.id);
	console.log('Bills:', bills);

	// Send reminders
	ReminderService.sendUpcomingReminders([user], 7);

	// Process payment
	const payment = PaymentService.processPayment({ billId: bill1.id, userId: user.id, amount: bill1.amount });
	console.log('Payment:', payment);

	// Mark bill paid
	BillService.markBillPaid(bill1.id);

	// Run scheduler
	SchedulerService.runScheduler();

	// Check recurring bill
	const updatedBill = BillService.getBillById(bill1.id);
	console.log('Updated Bill:', updatedBill);
}

runTests();
