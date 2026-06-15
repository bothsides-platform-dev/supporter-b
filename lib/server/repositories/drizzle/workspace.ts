import { and, asc, eq, gt, ilike, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  workspaces,
  workspaceMembers,
  workspaceInvitations,
  workspaceLogoBlobs,
  users as usersTable,
  bizProfiles,
} from '@/lib/db/schema';
import type { DB } from '@/lib/db/client';
import type {
  Workspace,
  WorkspaceMembershipSummary,
  WorkspaceType,
} from '@/lib/types/workspace';
import type { User } from '@/lib/types/user';
import type { WorkspaceRepo, Tx } from '../types';

/** ilike 메타문자 이스케이프 (사용자 입력 q 용). */
function escapeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&');
}

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

  async listAllWorkspacesForMaster(tx?: Tx): Promise<WorkspaceMembershipSummary[]> {
    const db = this.h(tx);
    return (await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        type: workspaces.type,
        status: workspaces.status,
        role: sql<'admin'>`'admin'`,
        unreadCount: sql<number>`0`,
        hasLogo: workspaces.hasLogo,
      })
      .from(workspaces)
      .where(eq(workspaces.status, 'active'))
      .orderBy(asc(workspaces.name))
      .limit(500)) as WorkspaceMembershipSummary[];
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

  async search(
    opts: { type: WorkspaceType; q?: string },
    tx?: Tx,
  ): Promise<{ id: string; name: string }[]> {
    const db = this.h(tx);
    const { type, q } = opts;
    // 데모 PG(isDemo)는 항상 제외 — 실제 RFP 초대·이메일이 가짜 PG로 새지 않도록(봉인입찰/온보딩 격리).
    const base = and(eq(workspaces.type, type), eq(workspaces.isDemo, false));
    return (await db
      .select({ id: workspaces.id, name: workspaces.name })
      .from(workspaces)
      .where(q ? and(base, ilike(workspaces.name, `%${escapeIlike(q)}%`)) : base)
      .limit(q ? 20 : 500)) as { id: string; name: string }[];
  }

  async getName(workspaceId: string, tx?: Tx): Promise<string | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return row?.name;
  }

  async memberRecipients(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ userId: string; email: string }[]> {
    const db = this.h(tx);
    return (await db
      .select({ userId: workspaceMembers.userId, email: usersTable.email })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as { userId: string; email: string }[];
  }

  async adminRecipients(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ userId: string; email: string }[]> {
    const db = this.h(tx);
    return (await db
      .select({ userId: workspaceMembers.userId, email: usersTable.email })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as { userId: string; email: string }[];
  }

  async memberRecipientsBatch(
    wsIds: string[],
    tx?: Tx,
  ): Promise<{ workspaceId: string; userId: string; role: string; email: string }[]> {
    if (wsIds.length === 0) return [];
    const db = this.h(tx);
    return (await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        email: usersTable.email,
      })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          inArray(workspaceMembers.workspaceId, wsIds),
          eq(usersTable.isSystemAccount, false),
        ),
      )) as { workspaceId: string; userId: string; role: string; email: string }[];
  }

  async findActiveById(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ id: string; type: WorkspaceType } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: workspaces.id, type: workspaces.type })
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.status, 'active')))
      .limit(1);
    return row ?? undefined;
  }

  async findEarliestActiveWorkspace(tx?: Tx): Promise<{ id: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.status, 'active'))
      .orderBy(asc(workspaces.createdAt))
      .limit(1);
    return row ?? undefined;
  }

  async getMembership(
    userId: string,
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ role: string; type: WorkspaceType } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ role: workspaceMembers.role, type: workspaces.type })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    return row ?? undefined;
  }

  async findInitialMembership(
    userId: string,
    tx?: Tx,
  ): Promise<{ workspaceId: string; role: string; type: WorkspaceType } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        type: workspaces.type,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaceMembers.joinedAt))
      .limit(1);
    return row ?? undefined;
  }

  async listMembershipsWithMembers(
    userId: string,
    tx?: Tx,
  ): Promise<
    {
      workspaceId: string;
      name: string;
      role: string;
      members: { userId: string; role: string }[];
    }[]
  > {
    const db = this.h(tx);
    const myMemberships = (await db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        name: workspaces.name,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))) as {
      workspaceId: string;
      role: string;
      name: string;
    }[];

    const result: {
      workspaceId: string;
      name: string;
      role: string;
      members: { userId: string; role: string }[];
    }[] = [];
    for (const m of myMemberships) {
      const members = (await db
        .select({ userId: workspaceMembers.userId, role: workspaceMembers.role })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, m.workspaceId))) as {
        userId: string;
        role: string;
      }[];
      result.push({ workspaceId: m.workspaceId, name: m.name, role: m.role, members });
    }
    return result;
  }

  async setBizProfilePointer(
    workspaceId: string,
    bizProfileId: string,
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .update(workspaces)
      .set({ bizProfileId })
      .where(eq(workspaces.id, workspaceId));
  }

  async getBizProfileId(workspaceId: string, tx?: Tx): Promise<string | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ bizProfileId: workspaces.bizProfileId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    return row?.bizProfileId ?? undefined;
  }

  async getBizProfileIdAndName(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ bizProfileId: string | null; name: string } | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ bizProfileId: workspaces.bizProfileId, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!row) return undefined;
    return { bizProfileId: row.bizProfileId ?? null, name: row.name };
  }

  async filterPgIds(ids: string[], tx?: Tx): Promise<string[]> {
    if (ids.length === 0) return [];
    const db = this.h(tx);
    const rows = (await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(inArray(workspaces.id, ids), eq(workspaces.type, 'pg')))) as { id: string }[];
    return rows.map((r) => r.id);
  }

  async rename(workspaceId: string, name: string, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));
  }

  async setHasLogo(workspaceId: string, hasLogo: boolean, tx?: Tx): Promise<void> {
    const db = this.h(tx);
    await db.update(workspaces).set({ hasLogo }).where(eq(workspaces.id, workspaceId));
  }

  async createBare(
    params: { id: string; type: WorkspaceType; name: string; bizProfileId: string | null },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db.insert(workspaces).values({
      id: params.id,
      type: params.type,
      name: params.name,
      bizProfileId: params.bizProfileId,
    });
  }

  async addMember(
    params: { workspaceId: string; userId: string; role: string },
    tx?: Tx,
  ): Promise<void> {
    const db = this.h(tx);
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: params.workspaceId,
        userId: params.userId,
        role: params.role as MemberRow['role'],
      })
      .onConflictDoNothing({
        target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      });
  }

  async listPendingInvitations(
    workspaceId: string,
    tx?: Tx,
  ): Promise<{ email: string; createdAt: Date; role: string }[]> {
    const db = this.h(tx);
    return (await db
      .select({
        email: workspaceInvitations.invitedEmail,
        createdAt: workspaceInvitations.createdAt,
        role: workspaceInvitations.role,
      })
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          eq(workspaceInvitations.status, 'pending'),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )) as { email: string; createdAt: Date; role: string }[];
  }

  async findInvitationByTokenHash(
    tokenHash: string,
    tx?: Tx,
  ): Promise<
    | {
        invitedEmail: string;
        status: string;
        expiresAt: Date;
        workspaceName: string;
        workspaceId: string;
      }
    | undefined
  > {
    const db = this.h(tx);
    const [row] = await db
      .select({
        invitedEmail: workspaceInvitations.invitedEmail,
        status: workspaceInvitations.status,
        expiresAt: workspaceInvitations.expiresAt,
        workspaceName: workspaces.name,
        workspaceId: workspaceInvitations.workspaceId,
      })
      .from(workspaceInvitations)
      .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
      .where(eq(workspaceInvitations.tokenHash, tokenHash))
      .limit(1);
    return row ?? undefined;
  }

  async claimInvitation(
    invitationId: string,
    userId: string,
    tx?: Tx,
  ): Promise<
    | { ok: true; workspaceId: string; role: string }
    | { ok: false; reason: 'expired' }
  > {
    const db = this.h(tx);
    // 조건부 UPDATE — status='pending' AND expires_at>now() 가 원자적 직렬화 지점.
    // 멤버 추가·이메일 인증은 호출부 책임(이 메서드는 초대 전이만 소유).
    const [claimed] = await db
      .update(workspaceInvitations)
      .set({ status: 'accepted', acceptedByUserId: userId })
      .where(
        and(
          eq(workspaceInvitations.id, invitationId),
          eq(workspaceInvitations.status, 'pending'),
          gt(workspaceInvitations.expiresAt, new Date()),
        ),
      )
      .returning({
        workspaceId: workspaceInvitations.workspaceId,
        role: workspaceInvitations.role,
      });
    if (!claimed) return { ok: false, reason: 'expired' };
    return { ok: true, workspaceId: claimed.workspaceId, role: claimed.role };
  }

  async findAdminEmail(workspaceId: string, tx?: Tx): Promise<string | undefined> {
    const db = this.h(tx);
    const [row] = await db
      .select({ email: usersTable.email })
      .from(workspaceMembers)
      .innerJoin(usersTable, eq(workspaceMembers.userId, usersTable.id))
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, 'admin'),
        ),
      )
      .limit(1);
    return row?.email;
  }
}
