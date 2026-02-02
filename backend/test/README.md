# Backend Testing Guide

## Overview

This directory contains comprehensive tests for the Wealth-Vault backend API, including:

- **Unit Tests**: Testing individual functions, utilities, and middleware
- **Integration Tests**: Testing API endpoints and database operations
- **Schema Tests**: Testing database schema definitions

## Test Structure

```
backend/test/
├── setup.js                      # Jest setup and configuration
├── api.integration.test.js       # Basic API health checks
├── auth.integration.test.js      # Authentication endpoint tests
├── auth.middleware.test.js       # Authentication middleware tests
├── expenses.integration.test.js  # Expenses API tests
├── goals.integration.test.js     # Goals API tests
├── users.schema.test.js          # Users schema validation
└── utils.test.js                 # Utility function tests
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test File
```bash
npm test auth.integration.test.js
```

### Run Tests in Watch Mode
```bash
npm test -- --watch
```

### Run Tests with Coverage
```bash
npm test -- --coverage
```

## Test Configuration

### Environment Variables

Tests use `.env.test` for configuration. Key variables:

- `NODE_ENV=test` - Sets environment to test mode
- `JWT_SECRET` - Secret key for JWT token generation
- `DATABASE_URL` - Test database connection (should be separate from production)
- `PORT` - Test server port (different from development)

### Jest Configuration

Configuration is in `jest.config.js`:

- **testEnvironment**: Node.js environment
- **setupFilesAfterEnv**: Loads `test/setup.js` before tests
- **testTimeout**: 10 seconds for integration tests
- **ES Modules**: Full ES module support enabled

## Test Categories

### 1. API Integration Tests

Tests HTTP endpoints using Supertest:

```javascript
import request from 'supertest';
import app from '../server.js';

describe('API Tests', () => {
  it('should return 200 for health check', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toBe(200);
  });
});
```

### 2. Authentication Tests

- User registration with validation
- User login and token generation
- Password strength requirements
- Email format validation

### 3. Authorization Tests

- Protected route access
- JWT token validation
- Middleware authentication

### 4. CRUD Operations

- Create, Read, Update, Delete for expenses
- Create, Read, Update, Delete for goals
- Data validation and error handling

### 5. Schema Tests

- Database table structure validation
- Field presence and type checking

## Best Practices

### 1. Test Isolation

Each test should be independent and not rely on other tests:

```javascript
beforeEach(() => {
  // Setup test data
});

afterEach(() => {
  // Cleanup test data
});
```

### 2. Use Descriptive Test Names

```javascript
it('should reject registration with weak password', async () => {
  // Test implementation
});
```

### 3. Test Both Success and Failure Cases

```javascript
describe('POST /api/expenses', () => {
  it('should create expense with valid data', async () => {
    // Test success case
  });

  it('should reject expense without authentication', async () => {
    // Test failure case
  });
});
```

### 4. Mock External Dependencies

For AI services, external APIs, etc.:

```javascript
jest.mock('../services/gemini', () => ({
  generateResponse: jest.fn().mockResolvedValue('Mocked response')
}));
```

## Common Issues and Solutions

### Issue: Database Connection Errors

**Solution**: Ensure test database is running and credentials in `.env.test` are correct.

### Issue: JWT_SECRET Not Configured

**Solution**: Check `.env.test` file exists and contains `JWT_SECRET`.

### Issue: Tests Timeout

**Solution**: Increase timeout in `jest.config.js` or specific tests:

```javascript
jest.setTimeout(15000); // 15 seconds
```

### Issue: Rate Limiting in Tests

**Solution**: Tests may hit rate limits. Consider:
- Using separate rate limit configuration for tests
- Resetting rate limits between tests
- Mocking rate limiter middleware

## Contributing New Tests

### 1. Create Test File

Name pattern: `feature.test.js` or `feature.integration.test.js`

### 2. Follow Structure

```javascript
import request from 'supertest';
import app from '../server.js';

describe('Feature Name', () => {
  beforeAll(async () => {
    // Setup (e.g., create test user)
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Endpoint Group', () => {
    it('should do something', async () => {
      // Test implementation
    });
  });
});
```

### 3. Test Checklist

- [ ] Happy path (success case)
- [ ] Error cases (invalid input, unauthorized access)
- [ ] Edge cases (empty data, boundary conditions)
- [ ] Authentication/Authorization
- [ ] Data validation
- [ ] Error messages

## Code Coverage

Aim for:
- **Functions**: > 80%
- **Lines**: > 75%
- **Branches**: > 70%

View coverage report:
```bash
npm test -- --coverage
```

## Next Steps

### Priority Areas to Add Tests:

1. **Categories API** - CRUD operations for expense categories
2. **Analytics API** - Data aggregation and reporting
3. **User Profile** - Profile updates and preferences
4. **Error Handling** - Global error handler tests
5. **Rate Limiting** - Rate limiter middleware tests
6. **Validation** - Input validation middleware tests
7. **Database Migrations** - Schema migration tests

### Advanced Testing:

1. **E2E Tests** - Full user workflow tests with Playwright/Cypress
2. **Load Tests** - Performance testing with k6 or Artillery
3. **Security Tests** - SQL injection, XSS, CSRF tests
4. **Contract Tests** - API contract validation with Pact

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

## Support

For questions or issues with tests:
1. Check this README
2. Review existing test examples
3. Open an issue on GitHub
4. Ask in project discussions

---

**Happy Testing! 🧪**
