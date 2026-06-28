// backend/tests/taxFilingRoutes.test.js
const request = require('supertest');
const express = require('express');
const taxFilingRouter = require('../routes/taxFiling');

const app = express();
app.use(express.json());
app.use('/api/tax/filing', taxFilingRouter);

describe('TaxFiling Routes', () => {
  it('should create a new tax filing', async () => {
    const res = await request(app)
      .post('/api/tax/filing')
      .send({ userId: 'user1', taxYear: 2026, deadline: '2027-04-15', status: 'pending', penalties: 0 });
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('userId', 'user1');
  });

  it('should update a tax filing', async () => {
    await request(app)
      .post('/api/tax/filing')
      .send({ userId: 'user2', taxYear: 2025, deadline: '2026-04-15', status: 'pending', penalties: 0 });
    const res = await request(app)
      .put('/api/tax/filing/user2/2025')
      .send({ status: 'on-time', filedDate: '2026-04-10' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'on-time');
  });

  it('should get all filings for a user', async () => {
    await request(app)
      .post('/api/tax/filing')
      .send({ userId: 'user3', taxYear: 2024, deadline: '2025-04-15', status: 'pending', penalties: 0 });
    const res = await request(app)
      .get('/api/tax/filing/user3');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
