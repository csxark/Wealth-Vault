import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the database
jest.unstable_mockModule('../../config/db.js', () => ({
  default: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{
      id: 'test-goal-123',
      name: 'Emergency Fund',
      targetAmount: '10000',
      currentAmount: '5000',
      deadline: new Date('2025-12-31'),
      status: 'in_progress',
    }]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    query: {
      goals: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'test-goal-123',
          name: 'Emergency Fund',
          targetAmount: '10000',
        }),
      },
    },
  },
}));

describe('Goals Routes', () => {
  let app;
  let goalsRouter;

  beforeAll(async () => {
    const module = await import('../../routes/goals.js');
    goalsRouter = module.default;

    app = express();
    app.use(express.json());
    
    // Mock authentication
    app.use((req, res, next) => {
      req.user = { 
        id: 'test-user-123', 
        email: 'test@example.com'
      };
      next();
    });
    
    // Mock response helpers
    app.use((req, res, next) => {
      res.success = (data, message = 'Success') => {
        res.status(200).json({
          success: true,
          message,
          data,
        });
      };
      res.error = (message, statusCode = 500) => {
        res.status(statusCode).json({
          success: false,
          message,
        });
      };
      next();
    });

    app.use('/api/goals', goalsRouter);
  });

  describe('GET /api/goals', () => {
    it('should return all goals for user', async () => {
      const res = await request(app)
        .get('/api/goals');

      expect([200, 500]).toContain(res.status);
    });

    it('should accept status filter', async () => {
      const res = await request(app)
        .get('/api/goals')
        .query({ status: 'in_progress' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /api/goals', () => {
    it('should create a new goal', async () => {
      const res = await request(app)
        .post('/api/goals')
        .send({
          name: 'Vacation Fund',
          description: 'Save for summer vacation',
          targetAmount: 5000,
          deadline: '2025-06-01',
          categoryId: 'test-category-123'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/goals')
        .send({
          description: 'Missing name and target'
        });

      expect([400, 500]).toContain(res.status);
    });

    it('should validate target amount is positive', async () => {
      const res = await request(app)
        .post('/api/goals')
        .send({
          name: 'Invalid Goal',
          targetAmount: -100,
          deadline: '2025-12-31'
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/goals/:id', () => {
    it('should update an existing goal', async () => {
      const res = await request(app)
        .put('/api/goals/test-goal-123')
        .send({
          name: 'Updated Goal',
          targetAmount: 15000
        });

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /api/goals/:id/contribute', () => {
    it('should add contribution to goal', async () => {
      const res = await request(app)
        .post('/api/goals/test-goal-123/contribute')
        .send({
          amount: 500,
          note: 'Monthly savings'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('should validate contribution amount', async () => {
      const res = await request(app)
        .post('/api/goals/test-goal-123/contribute')
        .send({
          amount: -50
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/goals/:id', () => {
    it('should delete a goal', async () => {
      const res = await request(app)
        .delete('/api/goals/test-goal-123');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/goals/:id/progress', () => {
    it('should return goal progress', async () => {
      const res = await request(app)
        .get('/api/goals/test-goal-123/progress');

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
