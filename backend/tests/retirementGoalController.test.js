// backend/tests/retirementGoalController.test.js
const request = require('supertest');
const express = require('express');
const RetirementGoalController = require('../controllers/retirementGoalController');

const app = express();
app.get('/api/retirement/progress/:userId', RetirementGoalController.getProgress);
app.get('/api/retirement/trends/:userId', RetirementGoalController.getTrends);

describe('RetirementGoalController', () => {
  it('should return progress for user', async () => {
    const res = await request(app).get('/api/retirement/progress/user1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('report');
  });

  it('should return trends for user', async () => {
    const res = await request(app).get('/api/retirement/trends/user1');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
