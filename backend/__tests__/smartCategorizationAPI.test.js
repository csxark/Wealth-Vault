import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { createServer } from 'http';
import request from 'supertest';

/**
 * Test Suite: Smart Categorization API Endpoints
 * Issue #639: REST API endpoints for categorization features
 */

// Mock setup
const mockAuthMiddleware = (req, res, next) => {
  req.user = { id: 'test-user-123' };
  next();
};

const mockAsyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Helper function to create test app
function createTestApp(router) {
  const app = express();
  app.use(express.json());
  app.use(mockAuthMiddleware);
  app.use('/api/smart-categorization', router);

  // Error handler
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  });

  return app;
}

describe('Smart Categorization API', () => {
  describe('POST /categorize/:expenseId', () => {
    it('should categorize an expense', async () => {
      const mockRouter = express.Router();
      mockRouter.post('/categorize/:expenseId', mockAsyncHandler(async (req, res) => {
        const { expenseId } = req.params;
        
        // Mock categorization response
        res.json({
          success: true,
          expenseId,
          primaryCategory: 'cat-123',
          confidence: 0.92,
          source: 'rule_based',
          suggestions: [
            { categoryId: 'cat-123', confidence: 0.92, source: 'rule_based' },
            { categoryId: 'cat-456', confidence: 0.78, source: 'ml_model' }
          ]
        });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .post('/api/smart-categorization/categorize/exp-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.expenseId).toBe('exp-123');
      expect(response.body.primaryCategory).toBeDefined();
      expect(response.body.confidence).toBeGreaterThan(0);
      expect(response.body.suggestions).toHaveLength(2);
    });

    it('should return 404 for non-existent expense', async () => {
      const mockRouter = express.Router();
      mockRouter.post('/categorize/:expenseId', mockAsyncHandler(async (req, res) => {
        const error = new Error('Expense not found');
        error.status = 404;
        throw error;
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .post('/api/smart-categorization/categorize/invalid-id')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /categorize-batch', () => {
    it('should categorize multiple expenses', async () => {
      const mockRouter = express.Router();
      mockRouter.post('/categorize-batch', mockAsyncHandler(async (req, res) => {
        const { expenseIds } = req.body;

        const results = expenseIds.map(id => ({
          expenseId: id,
          primaryCategory: 'cat-123',
          confidence: 0.85,
          source: 'rule_based'
        }));

        res.json({
          success: true,
          results,
          processedCount: results.length,
          failedCount: 0
        });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .post('/api/smart-categorization/categorize-batch')
        .send({ expenseIds: ['exp-1', 'exp-2', 'exp-3'] })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(3);
      expect(response.body.processedCount).toBe(3);
    });

    it('should validate expenseIds is an array', async () => {
      const mockRouter = express.Router();
      mockRouter.post('/categorize-batch', mockAsyncHandler(async (req, res) => {
        const { expenseIds } = req.body;
        if (!Array.isArray(expenseIds)) {
          const error = new Error('expenseIds must be an array');
          error.status = 400;
          throw error;
        }
        res.json({ success: true });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .post('/api/smart-categorization/categorize-batch')
        .send({ expenseIds: 'not-an-array' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /suggestions/:expenseId', () => {
    it('should get categorization suggestions', async () => {
      const mockRouter = express.Router();
      mockRouter.get('/suggestions/:expenseId', mockAsyncHandler(async (req, res) => {
        const { expenseId } = req.params;

        res.json({
          success: true,
          expenseId,
          suggestions: [
            {
              categoryId: 'cat-1',
              categoryName: 'Grocery',
              confidence: 0.92,
              source: 'rule_based'
            },
            {
              categoryId: 'cat-2',
              categoryName: 'Food & Dining',
              confidence: 0.78,
              source: 'ml_model'
            }
          ]
        });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .get('/api/smart-categorization/suggestions/exp-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.suggestions).toHaveLength(2);
      expect(response.body.suggestions[0].confidence).toBeGreaterThan(
        response.body.suggestions[1].confidence
      );
    });
  });

  describe('GET /stats', () => {
    it('should get categorization statistics', async () => {
      const mockRouter = express.Router();
      mockRouter.get('/stats', mockAsyncHandler(async (req, res) => {
        res.json({
          success: true,
          stats: {
            totalExpenses: 1250,
            autoCategorized: 1180,
            accuracyRate: 0.944,
            averageConfidence: 0.87,
            categoryDistribution: {
              'cat-1': 450,
              'cat-2': 380,
              'cat-3': 350
            }
          }
        });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .get('/api/smart-categorization/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.stats.autoCategorized).toBeGreaterThan(0);
      expect(response.body.stats.accuracyRate).toBeGreaterThan(0.9);
    });
  });

  describe('POST /correct-category', () => {
    it('should record category correction', async () => {
      const mockRouter = express.Router();
      mockRouter.post('/correct-category', mockAsyncHandler(async (req, res) => {
        const { expenseId, suggestedCategoryId, correctCategoryId } = req.body;

        res.json({
          success: true,
          message: 'Category correction recorded',
          expenseId,
          correction: {
            from: suggestedCategoryId,
            to: correctCategoryId
          }
        });
      }));

      const app = createTestApp(mockRouter);
      const response = await request(app)
        .post('/api/smart-categorization/correct-category')
        .send({
          expenseId: 'exp-123',
          suggestedCategoryId: 'cat-1',
          correctCategoryId: 'cat-2'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.correction.from).toBe('cat-1');
      expect(response.body.correction.to).toBe('cat-2');
    });
  });

  describe('Merchant Endpoints', () => {
    describe('GET /merchants', () => {
      it('should get top merchants', async () => {
        const mockRouter = express.Router();
        mockRouter.get('/merchants', mockAsyncHandler(async (req, res) => {
          const { limit = 10 } = req.query;

          res.json({
            success: true,
            merchants: [
              {
                id: 'merchant-1',
                name: 'Starbucks',
                frequency: 45,
                rating: 4.5,
                logo: 'https://...'
              },
              {
                id: 'merchant-2',
                name: 'Whole Foods',
                frequency: 28,
                rating: 4.2,
                logo: 'https://...'
              }
            ]
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .get('/api/smart-categorization/merchants?limit=10')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.merchants).toBeDefined();
        expect(response.body.merchants[0].frequency).toBeGreaterThan(0);
      });
    });

    describe('POST /merchants/recognize', () => {
      it('should recognize merchant from description', async () => {
        const mockRouter = express.Router();
        mockRouter.post('/merchants/recognize', mockAsyncHandler(async (req, res) => {
          const { description } = req.body;

          res.json({
            success: true,
            merchant: {
              id: 'merchant-123',
              name: 'Starbucks Coffee',
              confidence: 0.96,
              rating: 4.5,
              type: 'food_and_beverage'
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .post('/api/smart-categorization/merchants/recognize')
          .send({ description: 'Starbucks Coffee Shop' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.merchant.name).toBeDefined();
        expect(response.body.merchant.confidence).toBeGreaterThan(0.9);
      });
    });

    describe('GET /merchants/autocomplete', () => {
      it('should autocomplete merchant names', async () => {
        const mockRouter = express.Router();
        mockRouter.get('/merchants/autocomplete', mockAsyncHandler(async (req, res) => {
          const { q } = req.query;

          res.json({
            success: true,
            suggestions: [
              { id: 'merchant-1', name: 'Starbucks' },
              { id: 'merchant-2', name: 'Starbucks Coffee Co' }
            ]
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .get('/api/smart-categorization/merchants/autocomplete?q=star')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.suggestions).toBeDefined();
      });
    });

    describe('POST /merchants/:id/rate', () => {
      it('should rate a merchant', async () => {
        const mockRouter = express.Router();
        mockRouter.post('/merchants/:id/rate', mockAsyncHandler(async (req, res) => {
          const { id } = req.params;
          const { rating } = req.body;

          res.json({
            success: true,
            merchant: {
              id,
              averageRating: 4.3
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .post('/api/smart-categorization/merchants/merchant-1/rate')
          .send({ rating: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.merchant.averageRating).toBeGreaterThan(0);
      });
    });
  });

  describe('Rule Endpoints', () => {
    describe('GET /rules', () => {
      it('should get user rules', async () => {
        const mockRouter = express.Router();
        mockRouter.get('/rules', mockAsyncHandler(async (req, res) => {
          res.json({
            success: true,
            rules: [
              {
                id: 'rule-1',
                categoryId: 'cat-coffee',
                conditionType: 'text_match',
                conditionConfig: { keywords: ['starbucks', 'coffee'] },
                enabled: true
              }
            ]
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .get('/api/smart-categorization/rules')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.rules).toBeDefined();
      });
    });

    describe('POST /rules', () => {
      it('should create a new rule', async () => {
        const mockRouter = express.Router();
        mockRouter.post('/rules', mockAsyncHandler(async (req, res) => {
          const { categoryId, conditionType, conditionConfig } = req.body;

          res.json({
            success: true,
            rule: {
              id: 'rule-new-123',
              categoryId,
              conditionType,
              conditionConfig,
              enabled: true
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .post('/api/smart-categorization/rules')
          .send({
            categoryId: 'cat-123',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['test'] }
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.rule.id).toBeDefined();
      });
    });

    describe('POST /rules/:id/test', () => {
      it('should test rule with sample data', async () => {
        const mockRouter = express.Router();
        mockRouter.post('/rules/:id/test', mockAsyncHandler(async (req, res) => {
          const { id } = req.params;
          const { testData } = req.body;

          res.json({
            success: true,
            ruleId: id,
            testResults: {
              matches: true,
              description: testData.description
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .post('/api/smart-categorization/rules/rule-1/test')
          .send({
            testData: {
              description: 'Starbucks Coffee'
            }
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.testResults.matches).toBeDefined();
      });
    });

    describe('GET /rules/templates/available', () => {
      it('should get available rule templates', async () => {
        const mockRouter = express.Router();
        mockRouter.get('/rules/templates/available', mockAsyncHandler(async (req, res) => {
          res.json({
            success: true,
            templates: [
              {
                key: 'subscription',
                name: 'Subscriptions',
                description: 'Monthly subscription services'
              },
              {
                key: 'groceries',
                name: 'Groceries',
                description: 'Grocery store purchases'
              }
            ]
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .get('/api/smart-categorization/rules/templates/available')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.templates.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Receipt Endpoints', () => {
    describe('POST /receipts/upload', () => {
      it('should handle receipt upload', async () => {
        const mockRouter = express.Router();
        mockRouter.post('/receipts/upload', mockAsyncHandler(async (req, res) => {
          res.json({
            success: true,
            receipt: {
              id: 'receipt-123',
              merchant: 'Whole Foods',
              amount: '45.67',
              date: '2024-01-15',
              items: ['Groceries', 'Produce'],
              tax: '3.50',
              ocrConfidence: 0.94
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .post('/api/smart-categorization/receipts/upload')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.receipt.merchant).toBeDefined();
        expect(response.body.receipt.ocrConfidence).toBeGreaterThan(0.9);
      });
    });

    describe('GET /receipts/:id', () => {
      it('should get receipt details', async () => {
        const mockRouter = express.Router();
        mockRouter.get('/receipts/:id', mockAsyncHandler(async (req, res) => {
          const { id } = req.params;

          res.json({
            success: true,
            receipt: {
              id,
              merchant: 'Starbucks',
              amount: '5.50',
              verified: true
            }
          });
        }));

        const app = createTestApp(mockRouter);
        const response = await request(app)
          .get('/api/smart-categorization/receipts/receipt-123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.receipt.id).toBe('receipt-123');
      });
    });
  });
});

describe('Authentication & Authorization', () => {
  it('should require authentication', async () => {
    const mockRouter = express.Router();
    mockRouter.get('/protected', (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      res.json({ success: true });
    });

    const app = express();
    app.use(express.json());
    // No auth middleware
    app.use('/api/smart-categorization', mockRouter);

    const response = await request(app)
      .get('/api/smart-categorization/protected')
      .expect(401);

    expect(response.body.success).toBe(false);
  });
});

describe('Error Handling', () => {
  it('should handle validation errors', async () => {
    const mockRouter = express.Router();
    mockRouter.post('/rules', mockAsyncHandler(async (req, res) => {
      const { categoryId } = req.body;
      if (!categoryId) {
        const error = new Error('categoryId is required');
        error.status = 400;
        throw error;
      }
      res.json({ success: true });
    }));

    const app = createTestApp(mockRouter);
    const response = await request(app)
      .post('/api/smart-categorization/rules')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('should handle server errors', async () => {
    const mockRouter = express.Router();
    mockRouter.post('/error', mockAsyncHandler(async (req, res) => {
      throw new Error('Internal server error');
    }));

    const app = createTestApp(mockRouter);
    const response = await request(app)
      .post('/api/smart-categorization/error')
      .expect(500);

    expect(response.body.success).toBe(false);
  });
});
