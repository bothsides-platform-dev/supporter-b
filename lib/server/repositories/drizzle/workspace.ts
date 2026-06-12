import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  workspaces,
  workspaceMembers,
  workspaceLogoBlobs,
  users as usersTable,
  bizProfiles,
} from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type { Workspace, WorkspaceMembershipSummary } from '@/lib/types/workspace';
import type { User } from '@/lib/types/user';
import type { WorkspaceRepo, Tx } from '../types';

type WsRow = typeof workspaces.$inferSelect;
type MemberRow = typeof workspaceMembers.$inferSelect;
type UserRow = typeof usersTable.$inferSelect;
type BizRow = typeof bizProfiles.$inferSelect;

const VALID_AVATAR_COLORS = [
  'lavender',
  'amber',
  'moss',
  'accent',
  'terra',
  'ink',
] as const;
type AvatarColor = (typeof VALID_AVATAR_COLORS)[number];

function normalizeAvatarColor(raw: string | null | undefined): AvatarColor {
  return (VALID_AVATAR_COLORS as readonly string[]).includes(raw ?? '')
    ? (raw as AvatarColor)
    : 'ink';
}

function rowToUser(u: UserRow, m: MemberRow): User {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarColor: normalizeAvatarColor(u.avatarColor),
    role: m.role,
    status: u.status === 'paused' ? 'paused' : 'active',
    emailVerified: u.emailVerified,
    joinedAt: new Date(m.joinedAt).toISOString(),
    lastSeenAt: m.lastSeenAt ? new Date(m.lastSeenAt).toISOString() : undefined,
  };
}

export class DrizzleWorkspaceRepository implements WorkspaceRepo {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly _db: DB | any) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private h(tx?: Tx): any {
    return tx ?? this._db;
  }

  // Hydrate one workspace's members + biz profile with two cheap queries.
  // Inlined twice across finders would invite drift — kept private here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async hydrate(db: any, ws: WsRow): Promise<Workspace> {
    const memberRows = (await db
      .select({ m: workspaceMembers, u: usersTable })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, ws.id),
          // System-managed master accounts are hidden from all UI member lists.
          eq(usersTable.isSystemAccount, false),
        ),
      )) as { m: MemberRow; u: UserRow }[];

    const members: User[] = memberRows.map((r) => rowToUser(r.u, r.m));

    let bizProfile: Workspace['bizProfile'];
    if (ws.bizProfileId) {
      const [biz] = (await db
        .select()
        .from(bizProfiles)
        .where(eq(bizProfiles.id, ws.bizProfileId))
        .limit(1)) as BizRow[];
      if (biz) {
        bizProfile = {
          bizNo: biz.bizNo ?? undefined,
          taxType: biz.taxType ?? undefined,
          status: biz.status ?? undefined,
          grade: biz.grade ?? undefined,
          gradeSource: biz.gradeSource,
          gradeConfirmedBy: biz.gradeConfirmedBy ?? undefined,
          gradeConfirmedAt: biz.gradeConfirmedAt
            ? new Date(biz.gradeConfirmedAt).toISOString()
            : undefined,
        };
      }
    }

    const [logoRow] = await db
      .select({ workspaceId: workspaceLogoBlobs.workspaceId })
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, ws.id))
      .limit(1);

    return {
      id: ws.id,
      type: ws.type,
      name: ws.name,
      bizProfile,
      members,
      hasLogo: !!logoRow,
      createdAt: new Date(ws.createdAt).toISOString(),
    };
  }

  async save(ws: Workspace, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(workspaces)
      .values({
        id: ws.id,
        type: ws.type,
        name: ws.name,
        bizProfileId: null, // workspace.bizProfile is read-only hydration; updates go through BizProfileRepo + workspaces.bizProfileId
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: { name: ws.name },
      });

    // Sync members table — additive (we don't remove members here).
    for (const u of ws.members) {
      await db
        .insert(workspaceMembers)
        .values({
          workspaceId: ws.id,
          userId: u.id,
          role: u.role,
          joinedAt: new Date(u.joinedAt),
          lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt) : null,
        })
        .onConflictDoNothing({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
        });
    }
  }

  async findById(id: string, tx?: Tx): Promise<Workspace | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    return row ? this.hydrate(db, row) : undefined;
  }

  async listForUser(
    userId: string,
    tx?: Tx,
  ): Promise<WorkspaceMembershipSummary[]> {
    const db = this.h(tx);
    return (await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        type: workspaces.type,
        status: workspaces.status,
        role: workspaceMembers.role,
        unreadCount: sql<number>`(
          SELECT COALESCE(COUNT(*)::int, 0)
          FROM notifications
          WHERE workspace_id = ${workspaces.id}
            AND user_id = ${userId}
            AND channel = 'in_app'
            AND read_at IS NULL
        )`,
        hasLogo: workspaces.hasLogo,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.joinedAt))) as WorkspaceMembershipSummary[];
  }

  async isMember(userId: string, workspaceId: string, tx?: Tx): Promise<boolean> {
    const db = this.h(tx);
    const [row] = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async memberUserIds(workspaceId: string, tx?: Tx): Promise<string[]> {
    const db = this.h(tx);
    const rows = (await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as Pick<MemberRow, 'userId'>[];
    return rows.map((r) => r.userId);
  }

  async memberUserIdsBatch(wsIds: string[], tx?: Tx): Promise<Map<string, string[]>> {
    if (wsIds.length === 0) return new Map();
    const db = this.h(tx);
    const rows = (await db
      .select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          inArray(workspaceMembers.workspaceId, wsIds),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as Pick<MemberRow, 'workspaceId' | 'userId'>[];
    const map = new Map<string, string[]>();
    for (const r of rows) {
      const list = map.get(r.workspaceId) ?? [];
      list.push(r.userId);
      map.set(r.workspaceId, list);
    }
    return map;
  }

  async memberEmails(workspaceId: string, tx?: Tx): Promise<string[]> {
    const db = this.h(tx);
    const rows = (await db
      .select({ email: usersTable.email })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as Pick<UserRow, 'email'>[];
    return rows.map((r) => r.email);
  }

  async listCanonicalPgWorkspaces(): Promise<{ id: string; name: string; canonicalPgKey: string }[]> {
    const rows = (await this._db
      .select({ id: workspaces.id, name: workspaces.name, canonicalPgKey: workspaces.canonicalPgKey })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.type, 'pg'),
          eq(workspaces.status, 'active'),
          isNotNull(workspaces.canonicalPgKey),
        ),
      )
      .orderBy(asc(workspaces.name))) as { id: string; name: string; canonicalPgKey: string | null }[];
    return rows.map((r) => ({ ...r, canonicalPgKey: r.canonicalPgKey! }));
  }
}
