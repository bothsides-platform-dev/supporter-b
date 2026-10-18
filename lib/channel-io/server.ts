import 'server-only';
import { createHmac } from 'node:crypto';
import { auth } from '@/auth';
import { isSessionRevoked } from '@/lib/auth/session';

export type ChannelMember = {
  memberId: string;
  memberHash?: string;
  profile: { name: string | null; email: string };
};

let warnedMissingSecret = false;

export async function getChannelMember(): Promise<ChannelMember | null> {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) return null;

    if (await isSessionRevoked(session)) return null;
    const secret = process.env.CHANNEL_IO_SECRET;
    let memberHash: string | undefined;
    if (secret) {
      // Channel.io issues the secret as a hex-encoded string; HMAC key must
      // be the decoded raw bytes (PHP docs: `pack("H*", $secret)`). Treating
      // it as UTF-8 produces a hash that fails verification with a 401
      // unauthenticatedError on the messenger handshake.
      const keyBytes = Uint8Array.from(Buffer.from(secret, 'hex'));
      memberHash = createHmac('sha256', keyBytes)
        .update(session.user.id)
        .digest('hex');
    } else if (process.env.NODE_ENV !== 'production' && !warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn('[channel-io] CHANNEL_IO_SECRET not set — booting without memberHash.');
    }

    return {
      memberId: session.user.id,
      memberHash,
      profile: {
        name: session.user.name ?? null,
        email: session.user.email,
      },
    };
  } catch {
    return null;
  }
}
