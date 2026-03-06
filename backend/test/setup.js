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

    // Close database connections
    // In mock mode, we might not need to do anything, but if we were using real DB:
    /*
    const { client } = await import('../config/db.js');
    if (client && typeof client.end === 'function') {
      await client.end();
    }
    */
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
});
