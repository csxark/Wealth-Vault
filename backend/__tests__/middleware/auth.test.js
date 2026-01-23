import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { protect } from '../../middleware/auth.js';

describe('Authentication Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null
    };
    res = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(data) { this.body = data; return this; },
      statusCode: 200,
      body: null
    };
    next = () => {};
  });

  it('should return 401 if no token is provided', async () => {
    await protect(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 401 if token is invalid', async () => {
    req.headers.authorization = 'Bearer invalid-token';

    await protect(req, res, next);

    expect(res.statusCode).toBe(401);
  });
});
