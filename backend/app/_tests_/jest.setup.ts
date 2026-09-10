import { afterEach, jest } from '@jest/globals';

// Runs after the test environment is up. The auth module brought its own
// resets here; what is left is the one every suite needs.
afterEach(() => {
  jest.restoreAllMocks();
});
