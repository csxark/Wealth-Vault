// Test setup file for Vitest
import '@testing-library/jest-dom';

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: vi.fn(),
  error: vi.fn(),
};