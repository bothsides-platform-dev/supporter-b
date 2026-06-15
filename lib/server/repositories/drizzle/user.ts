import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { users } from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { User } from '@/lib/types/user';
import { hashPassword } from '@/lib/auth/password';
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

  async create(
    params: { id: string; email: string; passwordHash: string; name: string; phone: string },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(users).values({
      id: params.id,
      email: params.email,
      passwordHash: params.passwordHash,
      name: params.name,
      phone: params.phone,
      avatarColor: 'ink',
      status: 'active',
      emailVerified: false,
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

  async findPasswordHashById(userId: string, tx?: Tx): Promise<string | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.passwordHash ?? undefined;
  }

  async updatePassword(email: string, passwordHash: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      // sessionVersion bump revokes sessions issued before the reset — the
      // whole point of resetting a (possibly compromised) password.
      .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.email, email));
  }

  async updateEmail(userId: string, newEmail: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      // Email is the login identifier — revoke sessions minted under the old one.
      .set({ email: newEmail, sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, userId));
  }

  async softDelete(userId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      .set({
        deletedAt: new Date(),
        lastActiveWorkspaceId: null,
        // Revoke every outstanding JWT for the deleted account.
        sessionVersion: sql`${users.sessionVersion} + 1`,
      })
      .where(eq(users.id, userId));
  }

  async getSessionVersion(userId: string, tx?: Tx): Promise<number | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.sessionVersion ?? undefined;
  }

  async getEmailVerified(userId: string, tx?: Tx): Promise<boolean | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row?.emailVerified ?? undefined;
  }

  async findEmailVerifiedByEmail(
    email: string,
    tx?: Tx,
  ): Promise<boolean | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row?.emailVerified ?? undefined;
  }

  async existsByEmail(email: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return !!row;
  }

  async findIdByEmailCI(email: string, tx?: Tx): Promise<string | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return row?.id ?? undefined;
  }

  async markEmailVerifiedById(userId: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      .set({ emailVerified: true, emailVerifiedAt: sql`now()` })
      .where(and(eq(users.id, userId), eq(users.emailVerified, false)));
  }

  async setLastActiveWorkspace(
    userId: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(users)
      .set({ lastActiveWorkspaceId: workspaceId })
      .where(eq(users.id, userId));
  }

  async findAuthRowByEmail(
    email: string,
    tx?: Tx,
  ): Promise<
    | {
        id: string;
        email: string;
        name: string;
        passwordHash: string | null;
        emailVerified: boolean;
        deletedAt: Date | null;
        lastActiveWorkspaceId: string | null;
        sessionVersion: number;
      }
    | undefined
  > {
    const db = this.h(tx);
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        emailVerified: users.emailVerified,
        deletedAt: users.deletedAt,
        lastActiveWorkspaceId: users.lastActiveWorkspaceId,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? undefined;
  }

  async provisionMaster(
    params: { email: string; name: string },
    tx?: Tx,
  ): Promise<string> {
    const db = this.h(tx);
    const email = params.email.trim().toLowerCase();
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing) return existing.id;

    const passwordHash = await hashPassword(randomBytes(32).toString('hex'));
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: params.name.trim() || email,
        emailVerified: true,
        emailVerifiedAt: sql`now()`,
        isSystemAccount: true,
      })
      .returning({ id: users.id });
    return created.id;
  }
}
