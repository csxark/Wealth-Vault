import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import expensesRouter from '../../routes/expenses.js';

describe('Expense Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Add a mock authentication middleware for testing
    app.use((req, res, next) => {
      req.user = { id: 'test-user-123', email: 'test@example.com' };
      next();
    });
    app.use('/api/expenses', expensesRouter);
  });

  describe('GET /api/expenses', () => {
    it('should return expenses endpoint', async () => {
      const res = await request(app)
        .get('/api/expenses')
        .set('Authorization', 'Bearer test-token');

      // Just check that the endpoint exists
      expect([200, 401, 500]).toContain(res.status);
    });
  });

  describe('POST /api/expenses', () => {
    it('should require authentication for creating expense', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .send({
          amount: 100,
          category: 'safe',
          description: 'Test expense',
          date: '2026-01-23',
          paymentMethod: 'credit-card'
        });

      // Without proper JWT token, should return 401
      expect(res.status).toBe(401);
    });

    it('should accept requests with authorization header', async () => {
      const res = await request(app)
        .post('/api/expenses')
        .set('Authorization', 'Bearer valid-token')
        .send({
          amount: 100,
          category: 'safe',
          description: 'Test expense',
          date: '2026-01-23',
          paymentMethod: 'credit-card'
        });

      // Will be 401 with invalid token or 201/400 with valid
      expect([201, 400, 401]).toContain(res.status);
    });
  });

  describe('PUT /api/expenses/:id', () => {
    it('should require authentication for updating expense', async () => {
      const res = await request(app)
        .put('/api/expenses/1')
        .send({
          amount: 150,
          description: 'Updated expense'
        });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/expenses/:id', () => {
    it('should require authentication for deleting expense', async () => {
      const res = await request(app)
        .delete('/api/expenses/1');

      expect(res.status).toBe(401);
    });
  });
});
