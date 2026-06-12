import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditLogRecord } from '@/lib/server/repositories/types';

const listAuditLogsAction = vi.fn();
vi.mock('@/lib/server/actions/workspace/listAuditLogsAction', () => ({
  listAuditLogsAction: (...a: unknown[]) => listAuditLogsAction(...a),
}));

import { AuditLogPanel } from '../AuditLogPanel';

function log(over: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: over.id ?? crypto.randomUUID(),
    actorUserId: 'u-1',
    actorWorkspaceId: 'ws-1',
    action: 'rfp.award',
    entityType: 'rfp',
    entityId: 'P-2605-0042',
    metadata: null,
    createdAt: '2026-06-12T03:00:00.000Z',
    actorName: '김선정',
    viaMaster: false,
    ...over,
  };
}

beforeEach(() => {
  listAuditLogsAction.mockReset();
});

describe('AuditLogPanel', () => {
  it('행위자 이름 + 한국어 행위 라벨 + 견적 코드 링크를 렌더한다 (buyer → /rfp/코드)', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log()]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('김선정')).toBeInTheDocument();
    expect(screen.getByText('견적을 선정했어요')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'P-2605-0042' });
    expect(link).toHaveAttribute('href', '/rfp/P-2605-0042');
  });

  it('pg 워크스페이스의 견적 코드 링크는 /inbox/코드 로 간다', () => {
    render(
      <AuditLogPanel
        workspaceType="pg"
        initialLogs={[log({ action: 'bid.submit' })]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('견적을 제출했어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'P-2605-0042' })).toHaveAttribute(
      'href',
      '/inbox/P-2605-0042',
    );
  });

  it('알 수 없는 action 은 원문을 그대로 보여준다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ action: 'future.event', entityType: null, entityId: null })]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('future.event')).toBeInTheDocument();
  });

  it('viaMaster 행위는 운영자 배지를 보여주고, 일반 행위는 보여주지 않는다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[
          log({ id: 'm', actorName: '운영팀', viaMaster: true }),
          log({ id: 'n', actorName: '김선정', viaMaster: false }),
        ]}
        initialNextCursor={null}
      />,
    );
    // 운영자 배지는 master 행에만 1개.
    expect(screen.getAllByText('운영자')).toHaveLength(1);
  });

  it('로그가 없으면 빈 상태 문구를 보여준다', () => {
    render(
      <AuditLogPanel workspaceType="buyer" initialLogs={[]} initialNextCursor={null} />,
    );
    expect(screen.getByText('아직 기록된 활동이 없어요.')).toBeInTheDocument();
  });

  it('nextCursor 가 없으면 더 보기 버튼을 렌더하지 않는다', () => {
    render(
      <AuditLogPanel workspaceType="buyer" initialLogs={[log()]} initialNextCursor={null} />,
    );
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('더 보기 클릭 시 커서로 다음 페이지를 받아 목록에 덧붙인다', async () => {
    const user = userEvent.setup();
    const cursor = { createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' };
    listAuditLogsAction.mockResolvedValue({
      ok: true,
      logs: [log({ id: 'a-2', action: 'rfp.cancel', actorName: '박취소', entityId: 'P-2605-0001' })],
      nextCursor: null,
    });

    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'a-1' })]}
        initialNextCursor={cursor}
      />,
    );

    await user.click(screen.getByRole('button', { name: '더 보기' }));

    await waitFor(() => {
      expect(screen.getByText('박취소')).toBeInTheDocument();
    });
    expect(listAuditLogsAction).toHaveBeenCalledWith({ before: cursor });
    expect(screen.getByText('견적 요청을 취소했어요')).toBeInTheDocument();
    // 더 보기 버튼은 nextCursor null 이 되며 사라진다.
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });
});
