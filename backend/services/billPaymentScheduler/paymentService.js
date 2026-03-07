// PaymentService: payment gateway integration

const { Payment } = require('./models');
const payments = [];

class PaymentService {
	static processPayment(paymentData) {
		// Simulate payment gateway integration
		const gatewayResponse = {
			transactionId: 'TXN' + Math.floor(Math.random() * 1000000),
			status: 'success',
			timestamp: new Date().toISOString()
		};
		const payment = new Payment(
			payments.length + 1,
			paymentData.billId,
			paymentData.userId,
			paymentData.amount,
			new Date().toISOString(),
			gatewayResponse.status,
			gatewayResponse
		);
		payments.push(payment);
		return payment;
	}

	static getPaymentsByUser(userId) {
		return payments.filter(p => p.userId === userId);
	}

	static getPaymentsByBill(billId) {
		return payments.filter(p => p.billId === billId);
	}

	static getPaymentById(paymentId) {
		return payments.find(p => p.id === paymentId);
	}
}

module.exports = PaymentService;
