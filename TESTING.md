# Testing Documentation for Wealth Vault

This document provides comprehensive information about the testing infrastructure for the Wealth Vault application.

## Table of Contents

1. [Overview](#overview)
2. [Backend Testing (Jest)](#backend-testing-jest)
3. [Running Tests](#running-tests)
4. [Writing Tests](#writing-tests)
5. [CI/CD Integration](#cicd-integration)
6. [Coverage Reports](#coverage-reports)

---

## Overview

The Wealth Vault project uses Jest for comprehensive backend testing:

- **Backend**: Jest for unit and integration tests
- **Coverage**: 50% minimum coverage threshold enforced

### Why Testing Matters

- 🐛 **Prevents Bugs**: Catch errors before they reach production
- 📚 **Documents Behavior**: Tests serve as living documentation
- 🔄 **Enables Refactoring**: Safely improve code with confidence
- ⚡ **Speeds Development**: Automated tests are faster than manual QA
- 📈 **Improves Quality**: Encourages modular, maintainable code

---

## Backend Testing (Jest)

### Configuration

The backend uses Jest with ES modules support. Configuration is in `backend/jest.config.js`.

### Test Structure

```
backend/
├── __tests__/
│   ├── routes/
│   │   ├── auth.test.js
│   │   └── expenses.test.js
│   ├── middleware/
│   │   └── auth.test.js
│   └── utils/
│       └── passwordValidator.test.js
├── test/
│   └── setup.js
└── jest.config.js
```

### Running Backend Tests

```bash
# Run all backend tests
cd backend && npm test

# Run tests in watch mode
cd backend && npm test -- --watch

# Run tests with coverage
cd backend && npm test -- --coverage

# Run specific test file
cd backend && npm test -- auth.test.js

# From root directory
npm test
```

### Example Backend Test

```javascript
import request from "supertest";
import express from "express";
import authRouter from "../routes/auth.js";

describe("Auth Routes", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/auth", authRouter);
  });

  it("should return 400 for invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "invalid-email", password: "test123" });

    expect(res.status).toBe(400);
  });
});
```

});
});

```

---

## End-to-End Testing (Playwright)

### Configuration

Playwright tests simulate real user interactions. Configuration is in `playwright.config.ts`.

### Test Structure

```

e2e/
├── auth.spec.ts
├── dashboard.spec.ts
└── user-journey.spec.ts

````

### Running E2E Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI mode
npm run test:e2e:ui

# Run specific test file
npx playwright test e2e/auth.spec.ts

# Run tests in specific browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug
````

### Example E2E Test

````typescript
import { test, expect } from "@playwright/test";

test("should complete user login", async ({ page }) => {
  await page.goto("/");

---

## Running Tests

### Run All Tests

```bash
# From root directory
npm test

# Or from backend directory
cd backend && npm test
````

### Test Options

```bash
# Run tests in watch mode (development)
cd backend && npm test -- --watch

# Run tests with coverage
cd backend && npm test -- --coverage

# Run specific test file
cd backend && npm test -- auth.test.js

# Run tests matching pattern
cd backend && npm test -- --testNamePattern="auth"
```

---

## Writing Tests

### Best Practices

1. **Test Behavior, Not Implementation**
   - Focus on what the code does, not how it does it
   - Test from the user's perspective

2. **Use Descriptive Names**
   - Test names should clearly describe what they test
   - Use "should" statements: "should return error for invalid email"

3. **Arrange-Act-Assert Pattern**

   ```javascript
   it("should add expense", () => {
     // Arrange: Set up test data
     const expense = { amount: 100, category: "Food" };

     // Act: Perform the action
     const result = addExpense(expense);

     // Assert: Verify the result
     expect(result.success).toBe(true);
   });
   ```

4. **Keep Tests Independent**
   - Tests should not depend on each other
   - Use `beforeEach` to set up fresh state

5. **Mock External Dependencies**
   - Mock API calls, databases, and external services
   - Keep tests fast and reliable

### Test Coverage Goals

- **Minimum**: 50% coverage across all code
- **Target**: 70-80% coverage for critical paths
- **Priority**: Focus on business logic and API routes

### Adding New Tests

When adding new backend features, create corresponding test files:

```
backend/__tests__/
├── routes/         # API endpoint tests
├── middleware/     # Middleware tests
├── services/       # Business logic tests
└── utils/          # Utility function tests
```

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on every push and pull request. The CI pipeline:

1. **Backend Tests**: Runs Jest tests on Node 18.x and 20.x
2. **Linting**: Checks code quality with ESLint

### Workflow File

See [.github/workflows/ci.yml](.github/workflows/ci.yml) for complete CI configuration.

### Status Checks

- ✅ All tests must pass before merging
- ✅ Code coverage must meet minimum thresholds (50%)
- ✅ No linting errors allowed

---

## Coverage Reports

### Viewing Coverage

```bash
# Generate coverage report
cd backend && npm test -- --coverage

# Open HTML report (Windows)
start backend/coverage/lcov-report/index.html

# Open HTML report (Mac/Linux)
open backend/coverage/lcov-report/index.html
```

### Coverage Thresholds

Current thresholds are set to 50% for:

- Branches
- Functions
- Lines
- Statements

These can be adjusted in `backend/jest.config.js`.

---

## Troubleshooting

### Common Issues

1. **ES Modules Errors**
   - Ensure `"type": "module"` is in package.json
   - Run with `node --experimental-vm-modules`

2. **Tests timing out**
   - Increase timeout: `jest.setTimeout(10000)`
   - Check for unresolved promises

3. **Mock not working**
   - ES modules require different mocking approach
   - Use simplified mocks without `jest.mock()`

4. **Coverage not accurate**
   - Check that all files are included in coverage config
   - Ensure test files are excluded

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)
- [Node.js ES Modules](https://nodejs.org/api/esm.html)

---

## Contributing

When adding new features:

1. ✅ Write tests first (TDD approach recommended)
2. ✅ Ensure all tests pass: `npm test`
3. ✅ Maintain or improve coverage
4. ✅ Update this documentation if needed

For questions or issues, please open a GitHub issue.

---

**Happy Testing! 🧪✨**
