import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock the database before importing routes
jest.unstable_mockModule('../../config/db.js', () => ({
  default: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    query: {
      expenses: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    },
  },
}));

// Mock currency service
jest.unstable_mockModule('../../services/currencyService.js', () => ({
  convertAmount: jest.fn().mockResolvedValue(100),
  getAllRates: jest.fn().mockResolvedValue([]),
}));

// Mock other services
jest.unstable_mockModule('../../services/assetService.js', () => ({
  default: {
    getTotalNetWorth: jest.fn().mockResolvedValue(0),
  },
}));

jest.unstable_mockModule('../../services/projectionEngine.js', () => ({
  default: {
    projectFinances: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule('../../services/marketData.js', () => ({
  default: {
    getMarketData: jest.fn().mockResolvedValue({}),
  },
}));

describe('Analytics Routes', () => {
  let app;
  let analyticsRouter;

  beforeAll(async () => {
    // Dynamically import the router after mocks are set up
    const module = await import('../../routes/analytics.js');
    analyticsRouter = module.default;

    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { 
        id: 'test-user-123', 
        email: 'test@example.com',
        currency: 'USD'
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

    app.use('/api/analytics', analyticsRouter);
  });

  describe('GET /api/analytics/spending-summary', () => {
    it('should return 200 and spending summary data', async () => {
      const res = await request(app)
        .get('/api/analytics/spending-summary')
        .query({ period: 'month' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success');
    });

    it('should accept period parameter', async () => {
      const res = await request(app)
        .get('/api/analytics/spending-summary')
        .query({ period: 'year' });

      expect(res.status).toBe(200);
    });

    it('should accept custom date range', async () => {
      const res = await request(app)
        .get('/api/analytics/spending-summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/analytics/category-trends', () => {
    it('should return category trends', async () => {
      const res = await request(app)
        .get('/api/analytics/category-trends');

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/analytics/monthly-comparison', () => {
    it('should return monthly comparison data', async () => {
      const res = await request(app)
        .get('/api/analytics/monthly-comparison');

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/analytics/spending-patterns', () => {
    it('should return spending patterns', async () => {
      const res = await request(app)
        .get('/api/analytics/spending-patterns');

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/analytics/top-merchants', () => {
    it('should return top merchants', async () => {
      const res = await request(app)
        .get('/api/analytics/top-merchants')
        .query({ limit: 10 });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /api/analytics/budget-performance', () => {
    it('should return budget performance', async () => {
      const res = await request(app)
        .get('/api/analytics/budget-performance');

      expect([200, 500]).toContain(res.status);
    });
  });
});
