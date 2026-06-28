// Express routes for API

const express = require('express');
const controllers = require('./controllers');
const router = express.Router();

router.post('/bill', controllers.createBill);
router.get('/bills/:userId', controllers.getBills);
router.put('/bill/:billId', controllers.updateBill);
router.delete('/bill/:billId', controllers.deleteBill);

router.post('/payment', controllers.processPayment);
router.get('/payments/:userId', controllers.getPayments);

router.post('/scheduler/run', controllers.runScheduler);

module.exports = router;
