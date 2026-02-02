// Integration tests for expenses API endpoints
import request from 'supertest';
import app from '../server.js';

describe('Expenses API', () => {
  let authToken;
  let testUserId;

  // Register and login before running tests
  beforeAll(async () => {
    const testUser = {
      email: `expenses${Date.now()}@example.com`,
      password: 'Test@12345',
      name: 'Expenses Test User'
    };

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    authToken = registerRes.body.token;
    testUserId = registerRes.body.user.id;
  });

  describe('POST /api/expenses', () => {
    it('should create a new expense with authentication', async () => {
      const newExpense = {
        amount: 100,
        currency: 'INR',
        description: 'Test grocery shopping',
        category: 'safe',
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash'
      };

      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newExpense);

      expect(res.statusCode).toBe(201);
      expect(res.body.expense).toHaveProperty('amount', newExpense.amount);
      expect(res.body.expense).toHaveProperty('description', newExpense.description);
    });

    it('should reject expense creation without authentication', async () => {
      const newExpense = {
        amount: 100,
        currency: 'INR',
        description: 'Test expense',
        category: 'safe'
      };

      const res = await request(app)
        .post('/api/expenses')
        .send(newExpense);

      expect(res.statusCode).toBe(401);
    });

    it('should reject expense with invalid amount', async () => {
      const newExpense = {
        amount: -100,
        currency: 'INR',
        description: 'Invalid expense',
        category: 'safe'
      };

      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newExpense);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/expenses', () => {
    it('should get all expenses for authenticated user', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('expenses');
      expect(Array.isArray(res.body.expenses)).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const res = await request(app)
        .get('/api/expenses');

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/expenses/stats', () => {
    it('should get expense statistics for authenticated user', async () => {
      const res = await request(app)
        .get('/api/expenses/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('byCategory');
    });
  });
});
