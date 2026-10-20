// Centrifugo connection JWT issuance.
//
// A connection token authenticates the WebSocket connection to Centrifugo. It
// carries the user identity (`sub`) and optionally the workspace id in two
// Centrifugo-defined claims: `info.workspaceId` is visible in presence, while
// server-only `meta.workspaceId` is forwarded to the subscribe proxy. The
// proxy binds every channel ACL to that signed workspace context.
//
// HS256, signed with the Centrifugo `token_hmac_secret_key`
// (CENTRIFUGO_TOKEN_HMAC_SECRET). TTL ~30 minutes. `jose` is reused
// (Auth.js dependency); no new dependency. This module is dependency-pure
// (jose + process.env only) so it stays edge-safe and trivially unit-testable.

import { SignJWT } from 'jose';

/** How long a connection token is valid. The client re-fetches before expiry. */
const TOKEN_TTL = '30m';

/**
 * Issue a short-lived Centrifugo connection JWT for a user.
 *
 * @param userId application user id → JWT `sub` claim.
 * @param workspaceId optional workspace id → matching JWT `info.workspaceId`
 *   and server-only `meta.workspaceId` claims.
 * @throws if CENTRIFUGO_TOKEN_HMAC_SECRET is unset/empty (never sign with a
 *   falsy secret — that would let anyone forge a connection token).
 */
export async function issueCentrifugoConnectionToken(
  userId: string,
  workspaceId?: string,
): Promise<string> {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      'CENTRIFUGO_TOKEN_HMAC_SECRET is not set — cannot issue a Centrifugo connection token.',
    );
  }
  const claims = workspaceId
    ? { info: { workspaceId }, meta: { workspaceId } }
    : {};
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}
