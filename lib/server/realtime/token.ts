// Centrifugo connection JWT issuance.
//
// A connection token authenticates the WebSocket connection to Centrifugo. It
// carries only the user identity (`sub`) — channel-level access is enforced
// separately by the subscribe proxy (`/api/centrifugo/subscribe`), keeping the
// private 1:N ACL app-side (PIPA/PG 자사 보관). See impl-plan 2026-06-02,
// §실시간 전송.
//
// HS256, signed with the Centrifugo `token_hmac_secret_key`
// (CENTRIFUGO_TOKEN_HMAC_SECRET). `jose` is reused (Auth.js dependency); no new
// dependency. This module is dependency-pure (jose + process.env only) so it
// stays edge-safe and trivially unit-testable.

import { SignJWT } from 'jose';

/** How long a connection token is valid. The client re-fetches before expiry. */
const TOKEN_TTL = '10m';

/**
 * Issue a short-lived Centrifugo connection JWT for a user.
 *
 * @param userId application user id → JWT `sub` claim.
 * @throws if CENTRIFUGO_TOKEN_HMAC_SECRET is unset/empty (never sign with a
 *   falsy secret — that would let anyone forge a connection token).
 */
export async function issueCentrifugoConnectionToken(
  userId: string,
): Promise<string> {
  const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      'CENTRIFUGO_TOKEN_HMAC_SECRET is not set — cannot issue a Centrifugo connection token.',
    );
  }

  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime(TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));
}
