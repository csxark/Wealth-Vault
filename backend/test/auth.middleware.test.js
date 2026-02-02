// Unit tests for authentication middleware
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth.js';

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      header: function(name) {
        return this.headers[name.toLowerCase()];
      }
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('authenticateToken', () => {
    it('should call next() with valid token', () => {
      const testUser = { id: '123', email: 'test@example.com' };
      const token = jwt.sign(testUser, process.env.JWT_SECRET || 'test-secret');
      
      req.headers.authorization = `Bearer ${token}`;

      authenticateToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    it('should return 401 when no token is provided', () => {
      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 with invalid token', () => {
      req.headers.authorization = 'Bearer invalid-token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle token without Bearer prefix', () => {
      req.headers.authorization = 'invalid-format-token';

      authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
