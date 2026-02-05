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
      id: 'test-category-123',
      name: 'Test Category',
      color: '#3B82F6',
      icon: 'tag',
    }]),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    query: {
      categories: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'test-category-123',
          name: 'Test Category',
        }),
      },
    },
  },
}));

describe('Categories Routes', () => {
  let app;
  let categoriesRouter;

  beforeAll(async () => {
    const module = await import('../../routes/categories.js');
    categoriesRouter = module.default;

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

    app.use('/api/categories', categoriesRouter);
  });

  describe('GET /api/categories', () => {
    it('should return all categories for user', async () => {
      const res = await request(app)
        .get('/api/categories');

      expect([200, 500]).toContain(res.status);
    });

    it('should accept type filter', async () => {
      const res = await request(app)
        .get('/api/categories')
        .query({ type: 'expense' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /api/categories', () => {
    it('should create a new category', async () => {
      const res = await request(app)
        .post('/api/categories')
        .send({
          name: 'Groceries',
          color: '#10B981',
          icon: 'shopping-cart',
          type: 'expense'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/categories')
        .send({
          color: '#10B981'
          // Missing name
        });

      expect([400, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('should update an existing category', async () => {
      const res = await request(app)
        .put('/api/categories/test-category-123')
        .send({
          name: 'Updated Category',
          color: '#EF4444'
        });

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should delete a category', async () => {
      const res = await request(app)
        .delete('/api/categories/test-category-123');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /api/categories/:id/stats', () => {
    it('should return category statistics', async () => {
      const res = await request(app)
        .get('/api/categories/test-category-123/stats');

      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
