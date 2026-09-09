import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';

export interface TokenPayload {
  sub?: string; // User ID as string
  email?: string;
  type?: string;
  roles?: string[];
  permissions?: string[];
  sessionId?: string;
  [key: string]: unknown;
}

export interface DecodedToken extends TokenPayload {
  iat: number;
  exp: number;
  iss?: string;
  aud?: string;
}

export interface TokenConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
  algorithm?: jwt.Algorithm;
  issuer?: string;
  audience?: string;
}

/** Issuer/audience defaults shared by every token implementation of the module */
export const DEFAULT_JWT_ISSUER = 'bp-monolith';
export const DEFAULT_JWT_AUDIENCE = 'bp-monolith-api';
/** Only HS256 is ever accepted */
export const JWT_ALGORITHM: jwt.Algorithm = 'HS256';
export const TEMP_2FA_TOKEN_TYPE = 'temp_2fa';
export const TEMP_2FA_TOKEN_TTL = '5m';

type ExpiresIn = SignOptions['expiresIn'];

// Default configuration -- secrets MUST be overridden via configure()
let config: TokenConfig = {
  jwtSecret: '',
  jwtExpiresIn: '15m',
  refreshSecret: '',
  refreshExpiresIn: '7d',
  algorithm: JWT_ALGORITHM,
  issuer: DEFAULT_JWT_ISSUER,
  audience: DEFAULT_JWT_AUDIENCE,
};

function requireSecret(secret: string, name: string): string {
  if (!secret) {
    throw new Error(`[Auth] TokenUtil is not configured: ${name} is missing`);
  }
  return secret;
}

export class TokenUtil {
  /**
   * Configure token utility
   */
  static configure(newConfig: Partial<TokenConfig>): void {
    config = { ...config, ...newConfig, algorithm: JWT_ALGORITHM };
  }

  /**
   * Current configuration (issuer/audience are shared with the token services)
   */
  static getConfig(): Readonly<TokenConfig> {
    return config;
  }

  private static signOptions(expiresIn: string): SignOptions {
    return {
      expiresIn: expiresIn as ExpiresIn,
      algorithm: JWT_ALGORITHM,
      issuer: config.issuer,
      audience: config.audience,
    };
  }

  private static verifyOptions(): VerifyOptions {
    return {
      algorithms: [JWT_ALGORITHM],
      issuer: config.issuer,
      audience: config.audience,
    };
  }

  /**
   * Generate JWT access token
   */
  static async generateAccessToken(payload: Omit<TokenPayload, 'type'>): Promise<string> {
    const tokenPayload: TokenPayload = {
      ...payload,
      type: 'access',
    };

    return jwt.sign(
      tokenPayload,
      requireSecret(config.jwtSecret, 'jwtSecret'),
      this.signOptions(config.jwtExpiresIn)
    );
  }

  /**
   * Generate JWT refresh token
   */
  static async generateRefreshToken(userId: number, sessionId?: string): Promise<string> {
    const payload: TokenPayload = {
      sub: userId.toString(),
      type: 'refresh',
      sessionId: sessionId ?? crypto.randomUUID(),
    };

    return jwt.sign(
      payload,
      requireSecret(config.refreshSecret, 'refreshSecret'),
      this.signOptions(config.refreshExpiresIn)
    );
  }

  /**
   * Generate temporary token for the 2FA login step
   */
  static async generateTempToken(userId: number): Promise<string> {
    const payload: TokenPayload = {
      sub: userId.toString(),
      type: TEMP_2FA_TOKEN_TYPE,
    };

    return jwt.sign(
      payload,
      requireSecret(config.jwtSecret, 'jwtSecret'),
      this.signOptions(TEMP_2FA_TOKEN_TTL)
    );
  }

  /**
   * Verify and decode access token
   */
  static async verifyAccessToken(token: string): Promise<DecodedToken> {
    const decoded = jwt.verify(
      token,
      requireSecret(config.jwtSecret, 'jwtSecret'),
      this.verifyOptions()
    ) as DecodedToken;

    if (decoded.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return decoded;
  }

  /**
   * Verify and decode refresh token
   */
  static async verifyRefreshToken(token: string): Promise<DecodedToken> {
    const decoded = jwt.verify(
      token,
      requireSecret(config.refreshSecret, 'refreshSecret'),
      this.verifyOptions()
    ) as DecodedToken;

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  }

  /**
   * Verify and decode temporary 2FA token
   */
  static async verifyTempToken(token: string): Promise<DecodedToken> {
    const decoded = jwt.verify(
      token,
      requireSecret(config.jwtSecret, 'jwtSecret'),
      this.verifyOptions()
    ) as DecodedToken;

    if (decoded.type !== TEMP_2FA_TOKEN_TYPE) {
      throw new Error('Invalid token type');
    }

    return decoded;
  }

  /**
   * Decode token without verification. Never trust the result for
   * authorization decisions; it is only used to read `exp` of tokens that
   * were verified before.
   */
  static decode(token: string): DecodedToken | null {
    return jwt.decode(token) as DecodedToken | null;
  }

  /**
   * Generate random token (non-JWT)
   */
  static generateRandomToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate UUID v4
   */
  static generateUuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Check if token is expired
   */
  static isExpired(token: string): boolean {
    try {
      const decoded = this.decode(token);
      if (!decoded?.exp) {
        return true;
      }
      return decoded.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true;
    }
  }

  /**
   * Get time until token expiry in seconds
   */
  static getTimeUntilExpiry(token: string): number {
    try {
      const decoded = this.decode(token);
      if (!decoded?.exp) {
        return 0;
      }
      const now = Math.floor(Date.now() / 1000);
      return Math.max(0, decoded.exp - now);
    } catch {
      return 0;
    }
  }

  /**
   * Create a token pair (access + refresh)
   */
  static async createTokenPair(
    user: { id: number; email: string; roles: string[]; permissions: string[] },
    sessionId?: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const sid = sessionId ?? crypto.randomUUID();
    const accessToken = await this.generateAccessToken({
      sub: user.id.toString(),
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
      sessionId: sid,
    });

    const refreshToken = await this.generateRefreshToken(user.id, sid);

    return { accessToken, refreshToken };
  }
}
