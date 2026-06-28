// Bill, User, Payment, Schedule models
// ...existing code...
// User Model
class User {
	constructor(id, name, email, phone, paymentMethods = []) {
		this.id = id;
		this.name = name;
		this.email = email;
		this.phone = phone;
		this.paymentMethods = paymentMethods;
	}
}

// Bill Model
class Bill {
	constructor(id, userId, name, amount, dueDate, recurring, frequency, status = 'pending', paymentMethodId = null) {
		this.id = id;
		this.userId = userId;
		this.name = name;
		this.amount = amount;
		this.dueDate = dueDate;
		this.recurring = recurring;
		this.frequency = frequency; // e.g. 'monthly', 'weekly', 'yearly'
		this.status = status;
		this.paymentMethodId = paymentMethodId;
	}
}

// Payment Model
class Payment {
	constructor(id, billId, userId, amount, date, status, gatewayResponse = null) {
		this.id = id;
		this.billId = billId;
		this.userId = userId;
		this.amount = amount;
		this.date = date;
		this.status = status; // 'success', 'failed', 'pending'
		this.gatewayResponse = gatewayResponse;
	}
}

// Schedule Model
class Schedule {
	constructor(id, billId, userId, nextRun, frequency, enabled = true) {
		this.id = id;
		this.billId = billId;
		this.userId = userId;
		this.nextRun = nextRun;
		this.frequency = frequency;
		this.enabled = enabled;
	}
}

module.exports = {
	User,
	Bill,
	Payment,
	Schedule
};
