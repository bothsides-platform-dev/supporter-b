// 온보딩 샘플 견적 요청 — 순수 tx 시딩/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 구매사)·backfill 스크립트(기존)·OnboardingService(삭제)가 호출.
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';

export const DEMO_PG_NAMES = ['샘플페이 A', '샘플페이 B', '샘플페이 C'] as const;

export type DemoPg = { wsId: string; userId: string; name: string };

/**
 * 전역 데모 PG 워크스페이스 3개(+로그인 불가 데모 유저)를 보장한다. 이름 기준 멱등 —
 * 모든 구매사의 샘플이 이 3개를 공유한다. isDemo=true 로 실제 PG 발견 표면에서 제외된다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoPgs(tx: any): Promise<DemoPg[]> {
  const out: DemoPg[] = [];
  for (let i = 0; i < DEMO_PG_NAMES.length; i++) {
    const name = DEMO_PG_NAMES[i];
    const [existing] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.isDemo, true), eq(workspaces.name, name)))
      .limit(1);
    if (existing) {
      const [member] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, existing.id))
        .limit(1);
      out.push({ wsId: existing.id, userId: member.userId, name });
      continue;
    }
    const wsId = randomUUID();
    const userId = randomUUID();
    const slug = String.fromCharCode(97 + i); // a, b, c
    await tx.insert(users).values({
      id: userId,
      email: `demo-pg-${slug}@sample.invalid`, // .invalid = 예약된 비배달 TLD
      passwordHash: '!', // 사용 불가 — 데모 계정은 절대 인증되지 않는다
      name,
      isSystemAccount: true,
      emailVerified: true,
    });
    await tx.insert(workspaces).values({
      id: wsId,
      type: 'pg',
      name,
      status: 'active',
      isDemo: true,
    });
    await tx.insert(workspaceMembers).values({ workspaceId: wsId, userId, role: 'admin' });
    out.push({ wsId, userId, name });
  }
  return out;
}
