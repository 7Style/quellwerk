import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import winston from 'winston';
// The base class comes from `winston-transport`, which is what winston itself
// re-exports at runtime; `winston.Transport` exists there but not in the type
// definitions, so the class below extended `any` and nothing in this file was
// type checked. A devDependency on the package winston already carries.
import Transport from 'winston-transport';
import { logger, scrubSensitive } from '../logger.util.js';

const LEVEL = Symbol.for('level');
const MESSAGE = Symbol.for('message');

type Entry = Record<string | symbol, unknown>;

/** Captures every entry that reaches the transport layer */
class SpyTransport extends Transport {
  readonly entries: Entry[] = [];

  override log(info: Entry, next: () => void): void {
    this.entries.push(info);
    next();
  }
}

type LoggerInternals = { logger: winston.Logger; auditLogger: winston.Logger };

describe('logger', () => {
  const main = new SpyTransport();
  const audit = new SpyTransport();

  beforeAll(() => {
    const internals = logger as unknown as LoggerInternals;
    internals.logger.add(main);
    internals.auditLogger.add(audit);
  });

  afterAll(() => {
    const internals = logger as unknown as LoggerInternals;
    internals.logger.remove(main);
    internals.auditLogger.remove(audit);
  });

  it('delivers info and error entries with winston routing keys intact', () => {
    logger.info('probe info', { safe: 1 });
    logger.error('probe error', new Error('boom'), { requestId: 'r-1' });

    const info = main.entries.find((entry) => entry.message === 'probe info');
    const error = main.entries.find((entry) => entry.message === 'probe error');

    expect(info).toBeDefined();
    expect(info?.[LEVEL]).toBe('info');
    expect(info?.[MESSAGE]).toBeDefined();
    expect(info?.safe).toBe(1);
    expect(info?.service).toBe('quellwerk');

    expect(error).toBeDefined();
    expect(error?.[LEVEL]).toBe('error');
    expect(error?.error).toMatchObject({ message: 'boom', requestId: 'r-1' });
  });

  it('scrubs authorization, password and token fields, nested ones included', () => {
    logger.info('probe scrub', {
      password: 'plain-password',
      authorization: 'Bearer secret',
      nested: { token: 'abc', refreshToken: 'def', accessToken: 'ghi', keep: 'yes' },
      list: [{ Password: 'upper-case-key' }],
    });

    const entry = main.entries.find((item) => item.message === 'probe scrub');

    expect(entry).toBeDefined();
    expect(entry?.[LEVEL]).toBe('info');
    expect(entry?.password).toBe('[REDACTED]');
    expect(entry?.authorization).toBe('[REDACTED]');
    expect(entry?.nested).toEqual({
      token: '[REDACTED]',
      refreshToken: '[REDACTED]',
      accessToken: '[REDACTED]',
      keep: 'yes',
    });
    expect(entry?.list).toEqual([{ Password: '[REDACTED]' }]);
    expect(JSON.stringify(entry)).not.toMatch(/plain-password|Bearer secret|abc|def|ghi|upper-case-key/);
  });

  it('writes audit entries through the audit logger with scrubbed details', () => {
    logger.audit('LOGIN', 42, { token: 'session-token', ip: '203.0.113.9' });

    const entry = audit.entries.find((item) => item.action === 'LOGIN');

    expect(entry).toBeDefined();
    expect(entry?.[LEVEL]).toBe('info');
    expect(entry?.userId).toBe(42);
    expect(entry?.details).toEqual({ token: '[REDACTED]', ip: '203.0.113.9' });
    expect(entry?.service).toBe('quellwerk-audit');
  });

  it('scrubSensitive returns a copy and leaves the input untouched', () => {
    const input = { password: 'x', child: { secret: 'y' } };
    const copy = scrubSensitive(input);

    expect(copy).toEqual({ password: '[REDACTED]', child: { secret: '[REDACTED]' } });
    expect(input).toEqual({ password: 'x', child: { secret: 'y' } });
  });
});
