import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../../apps/api/src/modules/auth/auth.service.js';
import { DiscordOAuthClient } from '../../apps/api/src/modules/auth/discord.client.js';
import { PostgresAuthRepository } from '../../apps/api/src/modules/auth/postgres-auth.repository.js';
import * as schema from '../../packages/database/src/schema.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

describe('OAuth State Validation Adversarial Tests', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let repo: PostgresAuthRepository;
  let service: AuthService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL('../../packages/database/drizzle', import.meta.url))
    });
    repo = new PostgresAuthRepository(db);
    service = new AuthService(
      repo,
      new DiscordOAuthClient({ clientId: '', clientSecret: '', redirectUri: '' })
    );
  });

  afterAll(async () => {
    await client.close();
  });

  it('throws AppError 400 instead of 500 RangeError when state and cookie lengths differ', async () => {
    const validState = 'a'.repeat(64);
    await repo.saveState(hash(validState), new Date(Date.now() + 60000));

    const mismatchedCookie = 'b'.repeat(32); // Different byte length

    let capturedError: unknown;
    try {
      await service.validateState(validState, mismatchedCookie);
    } catch (err) {
      capturedError = err;
    }

    expect(capturedError).toBeDefined();
    expect((capturedError as { status?: number }).status).toBe(400);
    expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
  });

  it('throws AppError 400 when cookie or state is missing or not a string', async () => {
    let capturedError: unknown;
    try {
      await service.validateState(undefined, 'b'.repeat(64));
    } catch (err) {
      capturedError = err;
    }
    expect(capturedError).toBeDefined();
    expect((capturedError as { status?: number }).status).toBe(400);
    expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
  });

  describe('Edge Case: Empty strings', () => {
    it('throws AppError 400 for empty state and empty cookie', async () => {
      let capturedError: unknown;
      try {
        await service.validateState('', '');
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for empty state with valid cookie', async () => {
      let capturedError: unknown;
      try {
        await service.validateState('', 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for valid state with empty cookie', async () => {
      const validState = 'b'.repeat(64);
      await repo.saveState(hash(validState), new Date(Date.now() + 60000));
      let capturedError: unknown;
      try {
        await service.validateState(validState, '');
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });
  });

  describe('Edge Case: Unicode and Multi-byte Characters', () => {
    it('throws AppError 400 for emoji characters in state and cookie', async () => {
      const emojiState = '🔥'.repeat(64);
      let capturedError: unknown;
      try {
        await service.validateState(emojiState, emojiState);
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for multi-byte CJK characters in state', async () => {
      const cjkState = '你好世界'.repeat(16);
      let capturedError: unknown;
      try {
        await service.validateState(cjkState, 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for null byte in state', async () => {
      const nullByteState = `${'a'.repeat(30)}\0${'a'.repeat(33)}`;
      let capturedError: unknown;
      try {
        await service.validateState(nullByteState, 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for zero-width space in state', async () => {
      const zwsState = `\u200B${'a'.repeat(63)}`;
      let capturedError: unknown;
      try {
        await service.validateState(zwsState, 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });
  });

  describe('Edge Case: Extremely Large States (10MB Stress)', () => {
    it('throws AppError 400 without RangeError or unhandled exception when state is 10MB', async () => {
      const hugeState = 'a'.repeat(10 * 1024 * 1024); // 10MB
      let capturedError: unknown;
      try {
        await service.validateState(hugeState, 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 when cookie is 10MB', async () => {
      const hugeCookie = 'b'.repeat(10 * 1024 * 1024);
      let capturedError: unknown;
      try {
        await service.validateState('a'.repeat(64), hugeCookie);
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 when both state and cookie are 10MB', async () => {
      const huge = 'c'.repeat(10 * 1024 * 1024);
      let capturedError: unknown;
      try {
        await service.validateState(huge, huge);
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });
  });

  describe('Edge Case: Non-string and Incompatible Types', () => {
    const nonStringValues = [
      { label: 'null', val: null },
      { label: 'number', val: 123456789 },
      { label: 'boolean true', val: true },
      { label: 'boolean false', val: false },
      { label: 'plain object', val: {} },
      { label: 'array', val: ['a'.repeat(64)] },
      { label: 'Buffer instance', val: Buffer.alloc(64) },
      { label: 'Symbol', val: Symbol('oauth-state') },
      { label: 'BigInt', val: BigInt(64) }
    ];

    for (const { label, val } of nonStringValues) {
      it(`throws AppError 400 when state is ${label}`, async () => {
        let capturedError: unknown;
        try {
          await service.validateState(val, 'a'.repeat(64));
        } catch (err) {
          capturedError = err;
        }
        expect(capturedError).toBeDefined();
        expect((capturedError as { status?: number }).status).toBe(400);
        expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
      });
    }
  });

  describe('Edge Case: Boundary Lengths and Format Invariants', () => {
    it('throws AppError 400 for off-by-one state length (63 chars vs 64 chars)', async () => {
      let capturedError: unknown;
      try {
        await service.validateState('a'.repeat(63), 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for off-by-one state length (65 chars vs 64 chars)', async () => {
      let capturedError: unknown;
      try {
        await service.validateState('a'.repeat(65), 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for uppercase hex characters in state', async () => {
      const upperState = 'A'.repeat(64);
      let capturedError: unknown;
      try {
        await service.validateState(upperState, 'a'.repeat(64));
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 for 64 non-hex characters (e.g. g-z)', async () => {
      const nonHexState = 'g'.repeat(64);
      let capturedError: unknown;
      try {
        await service.validateState(nonHexState, nonHexState);
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });

    it('throws AppError 400 when valid state is replayed after being consumed', async () => {
      const validState = 'f'.repeat(64);
      await repo.saveState(hash(validState), new Date(Date.now() + 60000));

      // First validation: consumes state from database successfully
      await expect(service.validateState(validState, validState)).resolves.toBeUndefined();

      // Second validation (replay attack): state is no longer in database, must throw 400
      let capturedError: unknown;
      try {
        await service.validateState(validState, validState);
      } catch (err) {
        capturedError = err;
      }
      expect(capturedError).toBeDefined();
      expect((capturedError as { status?: number }).status).toBe(400);
      expect((capturedError as { code?: string }).code).toBe('INVALID_OAUTH_STATE');
    });
  });
});
