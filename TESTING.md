# Testing Documentation for Wealth Vault

This document provides information about the testing infrastructure for the Wealth Vault application across backend, frontend, and end-to-end (E2E) layers.
## Table of Contents

1. [Overview](#overview)
2. [Backend Testing (Jest)](#backend-testing-jest)
3. [Frontend Testing (Vitest)](#frontend-testing-vitest)
4. [End-to-End Testing (Playwright)](#end-to-end-testing-playwright)
5. [Running Tests](#running-tests)
6. [Writing Tests](#writing-tests)
7. [CI/CD Integration](#cicd-integration)
8. [Coverage Reports](#coverage-reports)
9. [Troubleshooting](#troubleshooting)
10. [Resources](#resources)
11. [Contributing](#contributing)

---
## Overview

The Wealth Vault project uses multiple testing layers:
- **Backend**: Jest for unit and integration tests (Node.js)
- **Frontend**: Vitest + React Testing Library for unit and component tests
- **End-to-End (E2E)**: Playwright for full user journey tests against the running app
- **Coverage**: Jest and Vitest coverage thresholds are configured in their respective configs

### Why Testing Matters
- 🐛 **Prevents Bugs**: Catch errors before they reach production
- 📚 **Documents Behavior**: Tests serve as living documentation
- 🔄 **Enables Refactoring**: Safely improve code with confidence
- ⚡ **Speeds Development**: Automated tests are faster than manual QA
- 📈 **Improves Quality**: Encourages modular, maintainable code

---
## Backend Testing (Jest)

### Configuration

The backend uses **Jest** with ES modules support. Configuration is in:
- `backend/jest.config.js`

Key points:

- `testEnvironment: "node"`
- Discovers tests via:
   - `**/__tests__/**/*.test.js`
   - `**/?(*.)+(spec|test).js`
- Collects coverage from `routes/`, `middleware/`, `services/`, and `utils/`
- Uses `backend/test/setup.js` for shared setup

### Test Structure
Current backend test layout:

```text
backend/
├── __tests__/
│   ├── api.test.js
│   ├── budgetAlerts.test.js
│   ├── outbox-concurrency.test.js
│   ├── tenant-isolation.test.js
│   ├── middleware/
│   ├── routes/
│   └── utils/
├── test/
│   └── setup.js
└── jest.config.js
```

In addition to the files shown above, Jest will also pick up any `*.test.js` or `*.spec.js` files under the backend directory that match the configured patterns.

### Running Backend Tests

From the **backend** directory:

```bash
# Run all backend tests
cd backend
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run a specific test file
npm test -- api.test.js

# Run tests matching a name pattern
npm test -- --testNamePattern="auth"
```

From the **repository root** (runs backend Jest tests only):

```bash
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

---

## Frontend Testing (Vitest)

### Configuration

The frontend uses **Vitest** with **React Testing Library** for component and unit tests. Configuration is in:

- `frontend/vitest.config.ts`

Key points:

- `environment: "jsdom"` for browser-like testing
- `globals: true` so you can use `describe`, `it`, `test`, etc. without imports
- `setupFiles: ["./src/tests/setup.ts"]` for shared test setup
- Includes tests matching:
   - `src/**/*.{test,spec}.{js,jsx,ts,tsx}`

### Test Structure

Current frontend test layout (non-exhaustive):

```text
frontend/
├── src/
│   └── tests/
│       ├── App.test.tsx
│       ├── SpendingAnalytics.test.tsx
│       ├── calculations.test.ts
│       └── setup.ts
└── vitest.config.ts
```

Additional `*.test.tsx` / `*.test.ts` files under `src/` that match the include pattern are also discovered automatically.

The shared setup file `frontend/src/tests/setup.ts`:

- Imports `@testing-library/jest-dom` for extended DOM matchers
- Stubs `console.warn` and `console.error` using Vitest's `vi.fn()` to keep test output clean

### Running Frontend Tests

From the **frontend** directory:

```bash
cd frontend

# Run all frontend unit/component tests
npm test

# Run with coverage
npm run test:coverage

# Run with the Vitest UI
npm run test:ui
```

---

## End-to-End Testing (Playwright)

### Configuration

End-to-end tests use **Playwright** and live alongside the root config:

- Playwright config: `playwright.config.ts`
- Test directory: `e2e/`

Key configuration details:

- `testDir: "./e2e"`
- Runs tests in parallel locally (`fullyParallel: true`)
- Retries and workers are adjusted automatically when `CI` is set
- HTML, list, and JUnit reporters (output to `test-results/junit.xml`)
- `webServer` starts the frontend dev server via `cd frontend && npm run dev`
- `baseURL: "http://localhost:3002"` for `page.goto("/")` style navigation

### Test Structure

```text
e2e/
├── auth.spec.ts
├── dashboard.spec.ts
└── user-journey.spec.ts
```

### Running E2E Tests Locally

From the **repository root**:

```bash
# 1) Install Playwright browsers (first time only)
npx playwright install

# 2) Run all E2E tests (spins up the frontend dev server automatically)
npx playwright test

# Run a specific E2E test file
npx playwright test e2e/auth.spec.ts

# Run tests in a specific browser project
npx playwright test --project=chromium

# Debug mode with Playwright inspector
npx playwright test --debug
```

Example E2E test snippet:

```ts
import { test, expect } from "@playwright/test";

test("should complete user login", async ({ page }) => {
   await page.goto("/");
   // ... fill in login form and assert dashboard is visible
});
```

---

## Running Tests

### Common Workflows

From the **repository root**:

```bash
# Backend Jest tests
npm test

# Start full dev environment (backend + frontend)
npm run dev
```

From the **backend** directory:

```bash
cd backend

# Run all tests
npm test

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage
```

From the **frontend** directory:

```bash
cd frontend

npm test              # Vitest unit/component tests
npm run test:coverage # Coverage
npm run test:ui       # Vitest UI
```

End-to-end tests (from root):

```bash
npx playwright test
```

---

## Writing Tests

### Best Practices

1. **Test Behavior, Not Implementation**
    - Focus on what the code does, not how it does it
    - Favour tests that reflect real usage and user flows

2. **Use Descriptive Names**
    - Test names should clearly describe what they verify
    - Use "should" statements: `"should return error for invalid email"`

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
    - Tests should not depend on side effects from other tests
    - Use `beforeEach` / `afterEach` to set up and reset state

5. **Mock External Dependencies**
    - Mock network calls, databases, and external services
    - Keep tests fast, deterministic, and reliable

### What to Prioritize

- Critical API endpoints and business logic
- Authentication, authorization, and multi-tenancy behavior
- Core UI flows: onboarding, dashboard, budgeting, and alerts
- Error handling and resilience (e.g., failed network calls)

---

## CI/CD Integration

Automated tests run on GitHub Actions for every push and pull request to protected branches.

### Workflows

There are two primary testing workflows under `.github/workflows/`:

1. **`ci.yml` – Focused Testing + Linting**
    - Triggers on pushes and pull requests to `main` and `develop`
    - Jobs:
       - **Backend Tests (Jest)**
          - Runs `npm test` in `backend/` on Node.js `18.x` and `20.x`
          - Uploads backend coverage via `codecov/codecov-action`
       - **Lint**
          - Installs frontend dependencies
          - Runs `npm run lint` in `frontend/`

2. **`ci-tests.yml` – Full Test Matrix**
    - Triggers on pushes and pull requests to `main` and `master`
    - Jobs:
       - Installs root, backend, and frontend dependencies
       - **Backend tests**: `npm test` in `backend/` with `CI=true` and a test `DATABASE_URL`
       - **Frontend tests**: `npm test` in `frontend/` (Vitest)
       - Optional frontend lint step is present but currently commented out

### Status Checks

- ✅ All configured CI jobs must pass before merging
- ✅ Backend and frontend test suites must be green
- ✅ Linting (where enabled) must complete without blocking errors

> Note: At the moment, E2E Playwright tests are intended for local execution and are not wired into a dedicated CI workflow.

---

## Coverage Reports

### Backend Coverage (Jest)

```bash
cd backend
npm test -- --coverage

# Open HTML report (Windows)
start coverage/lcov-report/index.html

# Open HTML report (macOS/Linux)
open coverage/lcov-report/index.html
```

Coverage thresholds for the backend are configured in `backend/jest.config.js` under `coverageThreshold.global`.

### Frontend Coverage (Vitest)

```bash
cd frontend
npm run test:coverage

# Vitest will output a coverage summary in the terminal
```

For more advanced HTML or LCOV reporting, refer to the Vitest documentation and update `frontend/vitest.config.ts` as needed.

---

## Troubleshooting

### Backend (Jest)

- **ES modules errors**
   - Ensure `"type": "module"` is set in `backend/package.json`
   - Tests are run via `node --experimental-vm-modules` in the `npm test` script

- **Tests timing out**
   - The default Jest timeout is set to `10000` ms in `backend/jest.config.js`
   - Long-running tests may need explicit timeouts or improved cleanup

- **Open handles / hanging tests**
   - `detectOpenHandles` and `forceExit` are enabled in Jest config
   - Ensure all DB connections, timers, and servers are closed in `afterAll`

### Frontend (Vitest)

- **DOM-related errors**
   - Confirm tests run under `jsdom` (already configured)
   - Use React Testing Library patterns (`screen`, `within`, etc.)

- **Noisy console output**
   - `console.warn` and `console.error` are stubbed in `src/tests/setup.ts`
   - If you need to assert on warnings, remove or adjust those stubs

### E2E (Playwright)

- **Server not ready**
   - Playwright relies on the `webServer` config to start `npm run dev` in `frontend/`
   - Ensure required environment variables are set for the frontend dev server

- **Flaky tests**
   - Prefer `await expect(...)` style assertions with auto-waiting
   - Use retries (already enabled on CI) for inherently flaky scenarios

---

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)

---

## Contributing

When adding or modifying features:

1. ✅ Add or update backend Jest tests for API and business logic changes
2. ✅ Add or update frontend Vitest tests for UI and component changes
3. ✅ Add or update Playwright E2E tests for critical user flows when appropriate
4. ✅ Ensure all relevant test suites pass locally:
    - `npm test` (root/backend)
    - `cd frontend && npm test`
    - `npx playwright test` (optional but recommended for key flows)
5. ✅ Maintain or improve coverage where it matters most
6. ✅ Update this documentation if the testing structure or commands change

For questions or issues, please open a GitHub issue.

---

**Happy Testing! 🧪✨**
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
