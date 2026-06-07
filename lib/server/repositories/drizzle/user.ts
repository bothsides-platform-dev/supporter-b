import { eq, sql } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { User } from '@/lib/types/user';
import type { UserRepo, Tx } from '../types';

type UserRow = typeof users.$inferSelect;

const VALID_AVATAR_COLORS = [
  'lavender',
  'amber',
  'moss',
  'accent',
  'terra',
  'ink',
] as const;
type AvatarColor = (typeof VALID_AVATAR_COLORS)[number];

function normAvatar(raw: string | null | undefined): AvatarColor {
  return (VALID_AVATAR_COLORS as readonly string[]).includes(raw ?? '')
    ? (raw as AvatarColor)
    : 'ink';
}

// User row carries no role — role is per-workspace_member. Use 'member' default.
function rowToUser(row: UserRow): User & { passwordHash: string } {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarColor: normAvatar(row.avatarColor),
    role: 'member',
    status: row.status === 'paused' ? 'paused' : 'active',
    emailVerified: row.emailVerified,
    joinedAt: new Date(row.createdAt).toISOString(),
    passwordHash: row.passwordHash,
  };
}

export class DrizzleUserRepository implements UserRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  async save(user: User & { passwordHash: string }, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        avatarColor: user.avatarColor,
        status: user.status,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          passwordHash: user.passwordHash,
          name: user.name,
          avatarColor: user.avatarColor,
          status: user.status,
        },
      });
  }

  async findById(id: string, tx?: Tx): Promise<User | undefined> {
    const db = this.h(tx);
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return undefined;
    const u = rowToUser(row);
    // Strip passwordHash for the User-only finder.
    const { passwordHash: _ph, ...rest } = u;
    void _ph;
    return rest;
  }

  async findByEmail(
    email: string,
    tx?: Tx,
  ): Promise<(User & { passwordHash: string }) | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? rowToUser(row) : undefined;
  }

  async markEmailVerified(email: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      .set({ emailVerified: true, emailVerifiedAt: sql`now()` })
      .where(eq(users.email, email));
  }
}
