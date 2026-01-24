export default {
  testEnvironment: 'node',
  collectCoverage: true,
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {},
  transformIgnorePatterns: [
    'node_modules/(?!(supertest)/)'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    'routes/**/*.js',
    'middleware/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    '!**/__tests__/**',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 3,
      functions: 3,
      lines: 3,
      statements: 3
    }
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 10000
};
