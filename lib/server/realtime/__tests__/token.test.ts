// issueCentrifugoConnectionToken — Centrifugo connection JWT.
//
// Contract (per impl-plan 2026-06-02, §실시간 전송 + Centrifugo authentication docs):
//   - HS256 JWT signed with CENTRIFUGO_TOKEN_HMAC_SECRET (the Centrifugo
//     `token_hmac_secret_key`). The secret is shared only between this backend
//     and Centrifugo — never exposed to the client.
//   - `sub` identifies the user; `info.workspaceId` powers presence and matching
//     server-only `meta.workspaceId` binds the subscribe proxy ACL.
//   - Short-lived: an `exp` claim ~30 minutes out (the client re-fetches via the
//     connection-token endpoint).
//   - Missing/empty secret → throws a clear error (must never sign with a falsy
//     secret).
//
// jose is reused (Auth.js dependency); no new dependency is added.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { jwtVerify, errors as joseErrors } from 'jose';

import { issueCentrifugoConnectionToken } from '../token';

const SECRET = 'super-secret-hmac-key';
const encode = (s: string) => new TextEncoder().encode(s);

describe('issueCentrifugoConnectionToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('signs an HS256 JWT with sub, matching info/meta workspaceId, and a ~30m exp', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);

    const token = await issueCentrifugoConnectionToken('user-42', 'ws-9');

    const { payload, protectedHeader } = await jwtVerify(token, encode(SECRET));
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe('user-42');
    expect((payload.info as { workspaceId?: string }).workspaceId).toBe('ws-9');
    expect((payload.meta as { workspaceId?: string }).workspaceId).toBe('ws-9');
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + 25 * 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 31 * 60);
  });

  it('omits info when no workspaceId is given (back-compat)', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);
    const token = await issueCentrifugoConnectionToken('user-1');
    const { payload } = await jwtVerify(token, encode(SECRET));
    expect(payload.info).toBeUndefined();
    expect(payload.meta).toBeUndefined();
  });

  it('produces a signature bound to the secret (wrong secret fails to verify)', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', SECRET);

    const token = await issueCentrifugoConnectionToken('user-7');

    await expect(
      jwtVerify(token, encode('a-different-secret')),
    ).rejects.toBeInstanceOf(joseErrors.JWSSignatureVerificationFailed);
  });

  it('throws a clear error when the secret is unset', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', undefined as unknown as string);

    await expect(
      issueCentrifugoConnectionToken('user-1'),
    ).rejects.toThrow(/CENTRIFUGO_TOKEN_HMAC_SECRET/);
  });

  it('throws a clear error when the secret is empty', async () => {
    vi.stubEnv('CENTRIFUGO_TOKEN_HMAC_SECRET', '');

    await expect(
      issueCentrifugoConnectionToken('user-1'),
    ).rejects.toThrow(/CENTRIFUGO_TOKEN_HMAC_SECRET/);
  });
});
