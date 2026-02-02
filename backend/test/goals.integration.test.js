// Integration tests for goals API endpoints
import request from 'supertest';
import app from '../server.js';

describe('Goals API', () => {
  let authToken;

  beforeAll(async () => {
    const testUser = {
      email: `goals${Date.now()}@example.com`,
      password: 'Test@12345',
      name: 'Goals Test User'
    };

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    authToken = registerRes.body.token;
  });

  describe('POST /api/goals', () => {
    it('should create a new goal with authentication', async () => {
      const newGoal = {
        title: 'Save for vacation',
        description: 'Beach vacation in Goa',
        target_amount: 50000,
        current_amount: 10000,
        target_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'active'
      };

      const res = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newGoal);

      expect(res.statusCode).toBe(201);
      expect(res.body.goal).toHaveProperty('title', newGoal.title);
      expect(res.body.goal).toHaveProperty('target_amount', newGoal.target_amount);
    });

    it('should reject goal without authentication', async () => {
      const newGoal = {
        title: 'Test Goal',
        target_amount: 10000
      };

      const res = await request(app)
        .post('/api/goals')
        .send(newGoal);

      expect(res.statusCode).toBe(401);
    });

    it('should reject goal with negative target amount', async () => {
      const newGoal = {
        title: 'Invalid Goal',
        target_amount: -5000
      };

      const res = await request(app)
        .post('/api/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newGoal);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/goals', () => {
    it('should get all goals for authenticated user', async () => {
      const res = await request(app)
        .get('/api/goals')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('goals');
      expect(Array.isArray(res.body.goals)).toBe(true);
    });

    it('should reject request without authentication', async () => {
      const res = await request(app)
        .get('/api/goals');

      expect(res.statusCode).toBe(401);
    });
  });
});
