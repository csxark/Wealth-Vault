// Controllers: API endpoints for bills, payments, schedules

const BillService = require('./billService');
const PaymentService = require('./paymentService');
const SchedulerService = require('./schedulerService');

const controllers = {
	createBill: (req, res) => {
		const bill = BillService.createBill(req.body);
		res.status(201).json(bill);
	},
	getBills: (req, res) => {
		const bills = BillService.getBillsByUser(req.params.userId);
		res.json(bills);
	},
	updateBill: (req, res) => {
		const bill = BillService.updateBill(parseInt(req.params.billId), req.body);
		if (bill) res.json(bill);
		else res.status(404).json({ error: 'Bill not found' });
	},
	deleteBill: (req, res) => {
		const success = BillService.deleteBill(parseInt(req.params.billId));
		if (success) res.json({ success: true });
		else res.status(404).json({ error: 'Bill not found' });
	},
	processPayment: (req, res) => {
		const payment = PaymentService.processPayment(req.body);
		if (payment.status === 'success') {
			BillService.markBillPaid(payment.billId);
		}
		res.status(201).json(payment);
	},
	getPayments: (req, res) => {
		const payments = PaymentService.getPaymentsByUser(req.params.userId);
		res.json(payments);
	},
	runScheduler: (req, res) => {
		SchedulerService.runScheduler();
		res.json({ success: true });
	}
};

module.exports = controllers;
