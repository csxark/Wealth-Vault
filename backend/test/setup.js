// Test setup file for Jest
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/wealth_vault_test';

// Mock console methods to reduce noise in test output (optional)
global.console = {
  ...console,
  // Uncomment to suppress console logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  warn: () => {},
  error: () => {},
};

// Global test teardown to clean up resources
global.afterAll(async () => {
  // Close database connections
  try {
    const { client } = await import('../config/db.js');
    if (client && typeof client.end === 'function') {
      await client.end();
    }
  } catch (error) {
    console.warn('Error closing database connection:', error.message);
  }
});
