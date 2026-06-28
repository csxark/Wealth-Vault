// BillService: CRUD, scheduling logic

const { Bill } = require('./models');

// In-memory bill storage
const bills = [];

class BillService {
	static createBill(billData) {
		const bill = new Bill(
			bills.length + 1,
			billData.userId,
			billData.name,
			billData.amount,
			billData.dueDate,
			billData.recurring,
			billData.frequency,
			'pending',
			billData.paymentMethodId
		);
		bills.push(bill);
		return bill;
	}

	static getBillsByUser(userId) {
		return bills.filter(b => b.userId === userId);
	}

	static getBillById(billId) {
		return bills.find(b => b.id === billId);
	}

	static updateBill(billId, updateData) {
		const bill = this.getBillById(billId);
		if (!bill) return null;
		Object.assign(bill, updateData);
		return bill;
	}

	static deleteBill(billId) {
		const idx = bills.findIndex(b => b.id === billId);
		if (idx !== -1) {
			bills.splice(idx, 1);
			return true;
		}
		return false;
	}

	static getUpcomingBills(userId, daysAhead = 7) {
		const now = new Date();
		const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
		return bills.filter(b => b.userId === userId && new Date(b.dueDate) <= future && b.status === 'pending');
	}

	static markBillPaid(billId) {
		const bill = this.getBillById(billId);
		if (bill) {
			bill.status = 'paid';
			return bill;
		}
		return null;
	}

	static scheduleRecurringBills() {
		bills.forEach(bill => {
			if (bill.recurring && bill.status === 'paid') {
				// Schedule next bill
				let nextDue;
				const currentDue = new Date(bill.dueDate);
				switch (bill.frequency) {
					case 'monthly':
						nextDue = new Date(currentDue);
						nextDue.setMonth(nextDue.getMonth() + 1);
						break;
					case 'weekly':
						nextDue = new Date(currentDue);
						nextDue.setDate(nextDue.getDate() + 7);
						break;
					case 'yearly':
						nextDue = new Date(currentDue);
						nextDue.setFullYear(nextDue.getFullYear() + 1);
						break;
					default:
						nextDue = null;
				}
				if (nextDue) {
					bill.dueDate = nextDue.toISOString();
					bill.status = 'pending';
				}
			}
		});
	}
}

module.exports = BillService;
