// Jest config for ES modules and integration testing
export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {},
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  testTimeout: 10000,
};
