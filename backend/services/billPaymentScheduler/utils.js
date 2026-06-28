// Utils: Notification, Logger, PaymentGateway

const Notification = {
	sendEmail: (to, subject, message) => {
		console.log(`Email sent to ${to}: ${subject} - ${message}`);
		return true;
	},
	sendSMS: (to, message) => {
		console.log(`SMS sent to ${to}: ${message}`);
		return true;
	}
};

const Logger = {
	log: (msg) => {
		console.log(`[LOG] ${new Date().toISOString()} - ${msg}`);
	},
	error: (msg) => {
		console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`);
	}
};

const PaymentGateway = {
	process: (paymentInfo) => {
		// Simulate payment gateway
		return {
			transactionId: 'TXN' + Math.floor(Math.random() * 1000000),
			status: 'success',
			timestamp: new Date().toISOString()
		};
	}
};

module.exports = {
	Notification,
	Logger,
	PaymentGateway
};
