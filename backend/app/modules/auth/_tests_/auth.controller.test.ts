import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthController } from '../controllers/auth.controller.js';
import { ValidationException, ForbiddenException } from '../internal/exceptions/base.exception.js';
import type { AuthService } from '../services/auth.service.js';

describe('AuthController validation', () => {
  let controller: AuthController;
  let authServiceMock: Record<string, jest.Mock>;
  let next: jest.Mock;

  beforeEach(() => {
    authServiceMock = {
      login: jest.fn(),
      requestPasswordReset: jest.fn(),
      verifyOneTimePassword: jest.fn(),
      getTwoFactorService: jest.fn().mockReturnValue({ adminReset: jest.fn() }),
    };
    controller = new AuthController(authServiceMock as unknown as AuthService);
    next = jest.fn();
  });

  function createRequest(body: any = {}, extras: Record<string, any> = {}) {
    return {
      body,
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('jest-agent'),
      user: extras.user,
      params: extras.params || {},
    } as any;
  }

  function createResponse() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  }

  it('calls next with ValidationException when login body invalid', async () => {
    const req = createRequest({ email: '', password: '' });
    const res = createResponse();

    await controller.login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationException));
    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('tolerates a missing request body (Express 5 leaves req.body undefined)', async () => {
    const req = createRequest(undefined);
    const res = createResponse();

    await controller.login(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationException));
    expect(authServiceMock.login).not.toHaveBeenCalled();
  });

  it('validates password reset request email', async () => {
    const req = createRequest({ email: '' });
    const res = createResponse();

    await controller.requestPasswordReset(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationException));
    expect(authServiceMock.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('validates OTP verification payload', async () => {
    const req = createRequest({ challengeToken: '', code: '' });
    const res = createResponse();

    await controller.verifyOneTimePassword(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationException));
    expect(authServiceMock.verifyOneTimePassword).not.toHaveBeenCalled();
  });

  it('enforces admin permission for adminResetTwoFactor', async () => {
    const req = createRequest(
      {},
      {
        params: { userId: '42' },
        user: { id: 1, permissions: ['auth:admin:view'] },
      }
    );
    const res = createResponse();

    await controller.adminResetTwoFactor(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenException));
  });
});
