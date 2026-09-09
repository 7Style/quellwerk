import {
  AuthResult,
  OneTimePasswordRequestResult,
  OneTimePasswordVerifyInput,
} from "../interfaces/module.interface.js";
import {
  ValidationException,
  AccountDisabledException,
  AccountLockedException,
  EmailNotVerifiedException,
  CryptoUtil,
  UnauthorizedException,
} from "../internal/index.js";
import { AuthEvents } from "../events/auth.events.js";
import { AuthMainService } from "./auth-main-service.js";

export class OtpAuthService extends AuthMainService {
  async requestOneTimePassword(
    email: string
  ): Promise<OneTimePasswordRequestResult> {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new ValidationException("Email is required");
    }

    const user = await this.userDbService.findUserWithRolesAndPermissions(
      normalizedEmail
    );

    const userMode = (user?.loginSecurityMode as string)?.toLowerCase();
    if (!user || userMode !== "one_time_password") {
      this.logger.debug("OTP request rejected (no user or OTP disabled)", {
        email: normalizedEmail,
        mode: user?.loginSecurityMode,
      });
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isActive) {
      throw new AccountDisabledException();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AccountLockedException(
        user.lockedUntil,
        this.config.maxLoginAttempts! - user.failedAttempts
      );
    }

    if (!user.emailVerified) {
      throw new EmailNotVerifiedException();
    }

    const challenge = await this.oneTimePasswordService.createChallenge({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      loginSecurityMode: user.loginSecurityMode,
      preferredLanguage: user.preferredLanguage,
    });

    this.events.emit(AuthEvents.ONE_TIME_PASSWORD_REQUESTED, {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    });

    return challenge;
  }

  async verifyOneTimePassword(
    input: OneTimePasswordVerifyInput
  ): Promise<AuthResult> {
    if (!input.challengeToken || !input.code) {
      throw new ValidationException(
        "Challenge token und Code sind erforderlich"
      );
    }

    try {
      const { userId } = await this.oneTimePasswordService.verifyCode(
        input.challengeToken,
        input.code
      );

      // Get user to check password status
      const user = await this.userDbService.findUserById(userId);

      // Check if user needs password setup:
      // - User must have loginSecurityMode as ONE_TIME_PASSWORD
      // - Password should be unusable (random generated)
      // - User must be a CONSULTANT (other roles might use OTP permanently without password)
      const isConsultant = user?.userRoles?.some(
        (ur) => ur.role.code?.toUpperCase() === "CONSULTANT"
      );

      // OTP users carry a random placeholder password until they set one;
      // the mode is the signal (a bcrypt hash has no usable length property,
      // and the hash column is never read outside the password check).
      const requiresPasswordSetup = Boolean(
        user &&
          isConsultant &&
          user.loginSecurityMode?.toLowerCase() === "one_time_password"
      );

      const result = await this.finalizeLoginForUser(userId, input.metadata, {
        allowedModes: ["one_time_password"],
      });

      // Add requiresPasswordSetup flag to result
      const resultWithFlag = {
        ...result,
        requiresPasswordSetup,
      };

      this.events.emit(AuthEvents.ONE_TIME_PASSWORD_VERIFIED, {
        userId: result.user.id,
        email: result.user.email,
        timestamp: new Date(),
      });

      return resultWithFlag;
    } catch (error) {
      if (error instanceof ValidationException) {
        let email = "unknown";
        try {
          const challenge = await this.otpLoginModel.findUnique({
            where: { challengeToken: input.challengeToken },
            select: {
              user: {
                select: { email: true },
              },
            },
          });
          if (challenge?.user?.email) {
            email = challenge.user.email;
          }
        } catch (lookupError) {
          this.logger.debug("Failed to resolve email for OTP failure", {
            lookupError,
          });
        }

        this.events.emit(AuthEvents.ONE_TIME_PASSWORD_FAILED, {
          email,
          reason: error.message || "validation_error",
          challengeToken: input.challengeToken,
          timestamp: new Date(),
        });
      }

      throw error;
    }
  }

  async verifyOneTimePasswordToken(
    token: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<AuthResult> {
    if (!token) {
      throw new ValidationException("Token ist erforderlich");
    }

    try {
      const { userId } = await this.oneTimePasswordService.verifyDeepLink(
        token
      );

      // Get user to check password status
      const user = await this.userDbService.findUserById(userId);

      // Check if user needs password setup
      const isConsultant = user?.userRoles?.some(
        (ur) => ur.role.code?.toUpperCase() === "CONSULTANT"
      );

      // OTP users carry a random placeholder password until they set one;
      // the mode is the signal (a bcrypt hash has no usable length property,
      // and the hash column is never read outside the password check).
      const requiresPasswordSetup = Boolean(
        user &&
          isConsultant &&
          user.loginSecurityMode?.toLowerCase() === "one_time_password"
      );

      const result = await this.finalizeLoginForUser(userId, metadata, {
        allowedModes: ["one_time_password"],
      });

      // Add requiresPasswordSetup flag to result
      const resultWithFlag = {
        ...result,
        requiresPasswordSetup,
      };

      this.events.emit(AuthEvents.ONE_TIME_PASSWORD_VERIFIED, {
        userId: result.user.id,
        email: result.user.email,
        timestamp: new Date(),
      });

      return resultWithFlag;
    } catch (error) {
      if (error instanceof ValidationException) {
        let email = "unknown";
        try {
          const hash = CryptoUtil.hash(token);
          const challenge = await this.otpLoginModel.findFirst({
            where: { deepLinkHash: hash },
            select: {
              user: {
                select: { email: true },
              },
            },
          });
          if (challenge?.user?.email) {
            email = challenge.user.email;
          }
        } catch (lookupError) {
          this.logger.debug(
            "Failed to resolve email for OTP deep link failure",
            { lookupError }
          );
        }

        this.events.emit(AuthEvents.ONE_TIME_PASSWORD_FAILED, {
          email,
          reason: error.message || "validation_error",
          challengeToken: undefined,
          timestamp: new Date(),
        });
      }

      throw error;
    }
  }
}
