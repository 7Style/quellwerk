import type { PrismaClient } from '../../../lib/prisma.js';
import { IUserEmailSender } from '../interfaces/user-email-sender.interface.js';
import crypto from 'node:crypto';
import { hash } from '../../../common/utils/crypto.util.js';

export class UserActivationService {
  constructor(
    private prisma: PrismaClient,
    private emailSender: IUserEmailSender
  ) {}

  async activateEmployeeAsUser(
    userId: number,
    roleCode: string,
    department?: string
  ): Promise<void> {
    // 1. Get user details
    const user = await this.prisma.user.findUnique({ 
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 2. User aktivieren ohne loginSecurityMode zu setzen (wird nach password setup gesetzt)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isActive: true,
        department: department || null,
      },
    });

    // 3. Role zuweisen
    const role = await this.prisma.role.findUnique({ where: { code: roleCode } });
    if (role) {
      await this.prisma.userRole.create({
        data: { userId, roleId: role.id },
      });
    }

    // 4. Generate password setup token (valid for 24 hours). Only the SHA-256
    //    hash is stored; the auth module looks it up with the same digest
    //    (CryptoUtil.hash) when the user calls /api/auth/password/setup.
    const setupToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        resetToken: hash(setupToken),
        resetTokenExpires: expiresAt,
      },
    });

    // 5. Send password setup email
    const userName = `${user.firstName} ${user.lastName}`;
    await this.emailSender.sendPasswordSetupEmail(
      user.email,
      userName,
      setupToken
    );
  }
}
