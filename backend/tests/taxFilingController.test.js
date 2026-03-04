// backend/tests/taxFilingController.test.js
const request = require('supertest');
const express = require('express');
const TaxFilingController = require('../controllers/taxFilingController');

const app = express();
app.get('/api/tax/analytics/:userId', TaxFilingController.getUserAnalytics);
app.get('/api/tax/alerts/:userId', TaxFilingController.getUserAlerts);

describe('TaxFilingController', () => {
  it('should return analytics for user', async () => {
    const res = await request(app).get('/api/tax/analytics/user1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('filingTrends');
  });

  it('should return alerts for user', async () => {
    const res = await request(app).get('/api/tax/alerts/user1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
