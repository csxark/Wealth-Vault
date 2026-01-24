// Test setup file for Jest
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/wealth_vault_test';

// Handle unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit process in test environment - let Jest handle it
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
  // Don't exit process in test environment - let Jest handle it
});

// Global test teardown
global.afterAll(async () => {
  // Clean up any remaining database connections or resources
  try {
    // Force close any open handles
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
});

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
