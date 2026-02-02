// Integration tests for authentication API endpoints
import request from 'supertest';
import app from '../server.js';

describe('Authentication API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid credentials', async () => {
      const newUser = {
        email: `test${Date.now()}@example.com`,
        password: 'Test@12345',
        name: 'Test User'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', newUser.email);
    });

    it('should reject registration with weak password', async () => {
      const newUser = {
        email: `test${Date.now()}@example.com`,
        password: 'weak',
        name: 'Test User'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toBe(400);
    });

    it('should reject registration with invalid email', async () => {
      const newUser = {
        email: 'invalid-email',
        password: 'Test@12345',
        name: 'Test User'
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(newUser);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // First register a user
      const testUser = {
        email: `login${Date.now()}@example.com`,
        password: 'Test@12345',
        name: 'Login Test User'
      };

      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Now login
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', testUser.email);
    });

    it('should reject login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(res.statusCode).toBe(401);
    });

    it('should reject login with missing credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });
});
