/**
 * 계약 보관함 서버 액션 — 세션 경계만 본다(도메인 판정은 서비스가 소유).
 *
 * 보관함은 **양쪽 워크스페이스 공용**이라 `requirePgWorkspace` 가 아니라
 * `requireActiveWorkspace` 를 쓴다 — 견적 템플릿(PG 전용)과 갈리는 지점이다.
 * 그 헬퍼가 PG 멤버십 승인 게이트를 이미 품고 있다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const requireActiveWorkspaceMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/actions/_session', () => ({
  requireActiveWorkspace: () => requireActiveWorkspaceMock(),
}));

const listForWorkspace = vi.hoisted(() => vi.fn());
const deleteUpload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/server/services/contract-archive', () => ({
  getContractArchiveService: async () => ({ listForWorkspace, deleteUpload }),
}));

const ACTOR = { ok: true as const, userId: randomUUID(), workspaceId: randomUUID(), workspaceType: 'buyer' as const };

beforeEach(() => {
  requireActiveWorkspaceMock.mockReset();
  requireActiveWorkspaceMock.mockResolvedValue(ACTOR);
  listForWorkspace.mockReset();
  listForWorkspace.mockResolvedValue({ ok: true, rows: [] });
  deleteUpload.mockReset();
  deleteUpload.mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe('listContractArchivesAction', () => {
  it('활성 워크스페이스의 목록을 서비스에 위임한다', async () => {
    const { listContractArchivesAction } = await import('../contract-archive');
    const rows = [{ id: 'a1' }];
    listForWorkspace.mockResolvedValue({ ok: true, rows });

    const r = await listContractArchivesAction();

    expect(r).toEqual({ ok: true, rows });
    expect(listForWorkspace).toHaveBeenCalledWith({
      userId: ACTOR.userId,
      workspaceId: ACTOR.workspaceId,
    });
  });

  it('세션 게이트에 막히면 서비스를 부르지 않는다', async () => {
    requireActiveWorkspaceMock.mockResolvedValue({ ok: false, error: 'FORBIDDEN_PG' });
    const { listContractArchivesAction } = await import('../contract-archive');

    const r = await listContractArchivesAction();

    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_PG' });
    expect(listForWorkspace).not.toHaveBeenCalled();
  });
});

describe('deleteContractArchiveAction', () => {
  it('삭제를 서비스에 위임한다', async () => {
    const { deleteContractArchiveAction } = await import('../contract-archive');
    const id = randomUUID();

    const r = await deleteContractArchiveAction({ id });

    expect(r).toEqual({ ok: true });
    expect(deleteUpload).toHaveBeenCalledWith(id, {
      userId: ACTOR.userId,
      workspaceId: ACTOR.workspaceId,
    });
  });

  it('uuid 가 아닌 입력은 서비스에 닿기 전에 거부한다', async () => {
    const { deleteContractArchiveAction } = await import('../contract-archive');

    const r = await deleteContractArchiveAction({ id: 'not-a-uuid' });

    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  it('세션 게이트에 막히면 서비스를 부르지 않는다', async () => {
    requireActiveWorkspaceMock.mockResolvedValue({ ok: false, error: 'UNAUTHENTICATED' });
    const { deleteContractArchiveAction } = await import('../contract-archive');

    const r = await deleteContractArchiveAction({ id: randomUUID() });

    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
    expect(deleteUpload).not.toHaveBeenCalled();
  });

  // 서비스가 보존 원칙을 소유한다(자동 보관본은 삭제 불가) — 액션은 그 판정을
  // 다시 하지 않고 오류를 그대로 전달한다. 액션이 자체 판정을 두면 판정이 둘이 된다.
  it('서비스의 보존 거부를 그대로 전달한다', async () => {
    deleteUpload.mockResolvedValue({ ok: false, error: 'ARCHIVE_NOT_DELETABLE' });
    const { deleteContractArchiveAction } = await import('../contract-archive');

    const r = await deleteContractArchiveAction({ id: randomUUID() });

    expect(r).toEqual({ ok: false, error: 'ARCHIVE_NOT_DELETABLE' });
  });
});
