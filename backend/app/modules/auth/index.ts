/**
 * Auth Module - Public API
 * Re-export the integration function for the main application
 */

import { authModule as authModuleIntegration } from './integration.js';

export const authModule = authModuleIntegration;
