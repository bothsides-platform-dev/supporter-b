/**
 * 계약 보관함 서버 액션 — 세션 경계만 본다(도메인 판정은 서비스가 소유).
 *
 * 보관함은 **양쪽 워크스페이스 공용**이라 `requirePgWorkspace` 가 아니라
 * `requireBuyerActor` 를 쓴다 — 견적 템플릿(PG 전용)과 갈리는 지점이다.
 * 그 헬퍼가 PG 멤버십 승인 게이트를 이미 품고 있다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const requireBuyerActorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/_session', () => ({
  requireBuyerActor: () => requireBuyerActorMock(),
}));

const listForWorkspace = vi.hoisted(() => vi.fn());
const deleteUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/services/contract-archive', () => ({
  getContractArchiveService: async () => ({ listForWorkspace, deleteUpload }),
}));

const ACTOR = { ok: true as const, userId: randomUUID(), workspaceId: randomUUID(), workspaceType: 'buyer' as const };

beforeEach(() => {
  requireBuyerActorMock.mockReset();
  requireBuyerActorMock.mockResolvedValue(ACTOR);
  listForWorkspace.mockReset();
  listForWorkspace.mockResolvedValue({ ok: true, rows: [], nextCursor: null });
  deleteUpload.mockReset();
  deleteUpload.mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe('listContractArchivesAction', () => {
  it('활성 워크스페이스의 목록을 엔트리로 매핑해 돌려준다', async () => {
    const { listContractArchivesAction } = await import('../contract-archive');
    // raw 행에는 스토리지 키가 들어 있다 — 액션이 경계라면 나가면 안 된다.
    listForWorkspace.mockResolvedValue({
      ok: true,
      nextCursor: { sortAt: '2026-08-01T00:00:00.000Z', id: randomUUID() },
      rows: [
        {
          id: 'a1',
          workspaceId: 'ws1',
          source: 'signing',
          signingContractId: 'sc1',
          rfpCode: 'P-2607-0042',
          title: '계약서',
          counterpartyName: 'OO페이',
          contractedAt: null,
          status: 'ready',
          documentKey: 'contract-archives/signing/sc1/document.pdf',
          documentName: '완료본.pdf',
          documentSize: 1,
          auditKey: 'contract-archives/signing/sc1/audit.pdf',
          auditName: '인증서.pdf',
          attempts: 0,
          createdBy: 'u1',
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    });

    const r = await listContractArchivesAction();

    expect(r.ok).toBe(true);
    // 서버 액션은 RPC 로 직접 호출될 수 있다 — 스트립이 페이지가 아니라 여기서 나야 한다.
    expect(JSON.stringify(r)).not.toContain('contract-archives/');
    expect(JSON.stringify(r)).not.toContain('ws1');
    if (r.ok) {
      expect(r.rows[0]).toMatchObject({ id: 'a1', hasAudit: true, canDelete: false });
      expect(r.nextCursor).toMatchObject({ sortAt: '2026-08-01T00:00:00.000Z' });
    }
    expect(listForWorkspace).toHaveBeenCalledWith({
      userId: ACTOR.userId,
      workspaceId: ACTOR.workspaceId,
    }, { before: undefined, query: undefined });
  });

  it('검색어와 커서를 검증해 현재 워크스페이스 조회에만 전달한다', async () => {
    const { listContractArchivesAction } = await import('../contract-archive');
    const before = { sortAt: '2026-08-01T00:00:00.000Z', id: randomUUID() };

    expect(await listContractArchivesAction({ before, query: '  페이  ' }))
      .toMatchObject({ ok: true, rows: [], nextCursor: null });
    expect(listForWorkspace).toHaveBeenCalledWith({
      userId: ACTOR.userId,
      workspaceId: ACTOR.workspaceId,
    }, { before, query: '페이' });
    expect(await listContractArchivesAction({ before: { sortAt: 'bad', id: before.id } }))
      .toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(listForWorkspace).toHaveBeenCalledTimes(1);
  });

  it('세션 게이트에 막히면 서비스를 부르지 않는다', async () => {
    requireBuyerActorMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' });
    const { listContractArchivesAction } = await import('../contract-archive');

    const r = await listContractArchivesAction();

    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(listForWorkspace).not.toHaveBeenCalled();
  });
});

it('기존 수동 업로드의 사용자 삭제 API는 닫혀 있다',async()=>{
 const {deleteContractArchiveAction}=await import('../contract-archive');
 expect(await deleteContractArchiveAction({id:randomUUID()})).toMatchObject({ok:false,error:'CONTRACT_FEATURE_REMOVED'});
 expect(deleteUpload).not.toHaveBeenCalled();
});
