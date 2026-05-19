import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { verificationTokens } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { VerificationToken } from '@/lib/types/auth';
import type { VerificationTokenRepo, Tx } from '../types';

type VTokenRow = typeof verificationTokens.$inferSelect;
type VTokenView = Omit<VerificationToken, 'token'> & { tokenHash: string };

// Auth-domain VerificationToken includes 'invite'; DB enum doesn't. The DB row
// type is the source of truth post-persist.
type DbPurpose = VTokenRow['purpose'];

function rowToToken(row: VTokenRow): VTokenView {
  return {
    id: row.id,
    purpose: row.purpose as VerificationToken['purpose'],
    email: row.email,
    tokenHash: row.tokenHash,
    issuedAt: new Date(row.issuedAt).toISOString(),
    expiresAt: new Date(row.expiresAt).toISOString(),
    consumedAt: row.consumedAt ? new Date(row.consumedAt).toISOString() : undefined,
    meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
  };
}

export class DrizzleVerificationTokenRepository implements VerificationTokenRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(token: VTokenView, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.insert(verificationTokens).values({
      id: token.id,
      purpose: token.purpose as DbPurpose,
      email: token.email,
      tokenHash: token.tokenHash,
      issuedAt: new Date(token.issuedAt),
      expiresAt: new Date(token.expiresAt),
      consumedAt: token.consumedAt ? new Date(token.consumedAt) : null,
      meta: token.meta ?? {},
    });
  }

  async consume(
    tokenHash: string,
    now: Date,
    tx?: Tx,
  ): Promise<VTokenView | undefined> {
    const db = this.h(tx);
    const updated = await db
      .update(verificationTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(verificationTokens.tokenHash, tokenHash),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now),
        ),
      )
      .returning();
    return updated.length > 0 ? rowToToken(updated[0]) : undefined;
  }

  async findValid(
    tokenHash: string,
    now: Date,
    tx?: Tx,
  ): Promise<VTokenView | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.tokenHash, tokenHash),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, now),
        ),
      )
      .limit(1);
    return row ? rowToToken(row) : undefined;
  }

  async invalidatePending(
    params: {
      email: string;
      purpose: 'signup_email' | 'password_reset' | 'email_change';
      now: Date;
    },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(verificationTokens)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(verificationTokens.email, params.email),
          eq(verificationTokens.purpose, params.purpose),
          isNull(verificationTokens.consumedAt),
          gt(verificationTokens.expiresAt, params.now),
        ),
      );
  }
}
