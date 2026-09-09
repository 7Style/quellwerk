import { afterEach, jest } from '@jest/globals';
import { resetAuthDependencies } from '../services/base.service.js';
import { setLogger } from '../internal/utils/logger.util.js';

afterEach(() => {
  resetAuthDependencies();
  setLogger(null);
  jest.restoreAllMocks();
});
