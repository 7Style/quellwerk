import type { Application } from 'express';
import type { PrismaClient } from '../../lib/prisma.js';
import { createUserRoutes } from './user.routes.js';
import { logger } from '../../common/utils/logger.util.js';
import type { IUserEmailSender } from './interfaces/user-email-sender.interface.js';

export interface UserModuleOptions {
  emailSender: IUserEmailSender;
}

export function initUserModule(
  app: Application,
  prisma: PrismaClient,
  options: UserModuleOptions
): void {
  const userRoutes = createUserRoutes(prisma, options.emailSender);
  app.use('/api/users', userRoutes);
  logger.info('User module initialized');
}

export * from './dto/index.js';
export * from './services/index.js';
export { UserController } from './user.controller.js';
