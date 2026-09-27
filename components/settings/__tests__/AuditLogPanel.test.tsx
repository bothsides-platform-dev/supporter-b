import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import type { AuditLogRecord } from '@/lib/server/repositories/types';

const listAuditLogsAction = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/server/actions/workspace/listAuditLogsAction', () => ({
  listAuditLogsAction: (...a: unknown[]) => listAuditLogsAction(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { AuditLogPanel as ActualAuditLogPanel } from '../AuditLogPanel';

type AuditLogPanelProps = Omit<ComponentProps<typeof ActualAuditLogPanel>, 'workspaceId'> & {
  workspaceId?: string;
};

function AuditLogPanel({ workspaceId = 'workspace-1', ...props }: AuditLogPanelProps) {
  return <ActualAuditLogPanel workspaceId={workspaceId} {...props} />;
}

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
  refresh.mockReset();
});

describe('AuditLogPanel', () => {
  it('견적 수정 요청 기록을 현재 화면 용어로 보여준다', () => {
    render(<AuditLogPanel workspaceType="buyer" initialLogs={[log({ action: 'rfp.requote' })]} initialNextCursor={null} />);
    expect(screen.getByText('견적 수정을 요청했어요')).toBeInTheDocument();
  });

  it('행위자 이름 + 한국어 행위 라벨 + 견적 코드 링크를 렌더한다 (buyer → /rfp/코드)', () => {
    render(
      <AuditLogPanel
        workspaceId="workspace-1"
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

  it('이름 변경 요청 감사 코드를 사용자 문구로 보여준다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ action: 'workspace.name_change_request', entityType: 'workspace', entityId: 'ws-1' })]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('회사 이름 변경을 요청했어요')).toBeInTheDocument();
    expect(screen.queryByText('workspace.name_change_request')).not.toBeInTheDocument();
  });

  it('초대 재전송·취소 감사 코드를 사용자 문구로 보여준다', () => {
    const labels: Record<string, string> = {
      'workspace.member_invite_resend': '초대 메일을 다시 보냈어요',
      'workspace.member_invite_cancel': '초대를 취소했어요',
    };
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={Object.keys(labels).map((action, i) =>
          log({ id: `invite-${i}`, action, entityType: 'workspace', entityId: 'ws-1' }),
        )}
        initialNextCursor={null}
      />,
    );

    for (const [action, label] of Object.entries(labels)) {
      expect(screen.getByText(label), action).toBeInTheDocument();
      expect(screen.queryByText(action)).not.toBeInTheDocument();
    }
  });

  it('전자서명 action 전부에 한국어 라벨이 있다 — raw 코드가 사용자에게 새지 않는다', () => {
    const signingLabels: Record<string, string> = {
      'signing.awaiting_template': '계약서 준비를 시작했어요',
      'signing.sent': '계약서를 보냈어요',
      'signing.send_claim_taken': '계약서 작성을 이어받았어요',
      'signing.completed': '전자서명이 완료됐어요',
      'signing.canceled': '전자서명을 취소했어요',
      'signing.canceled_by_provider': '전자서명이 외부에서 취소됐어요',
      'signing.declined': '전자서명이 거절됐어요',
      'signing.expired': '전자서명 기한이 지났어요',
      'signing.resent': '전자서명을 다시 시작했어요',
      'signing.reminded': '서명 리마인더를 보냈어요',
    };
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={Object.keys(signingLabels).map((action, i) =>
          log({ id: `s-${i}`, action }),
        )}
        initialNextCursor={null}
      />,
    );
    for (const [action, label] of Object.entries(signingLabels)) {
      expect(screen.getByText(label), action).toBeInTheDocument();
      expect(screen.queryByText(action)).not.toBeInTheDocument();
    }
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
    expect(listAuditLogsAction).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      before: cursor,
    });
    expect(screen.getByText('견적 요청을 취소했어요')).toBeInTheDocument();
    // 더 보기 버튼은 nextCursor null 이 되며 사라진다.
    expect(screen.queryByRole('button', { name: '더 보기' })).not.toBeInTheDocument();
  });

  it('더 보기 실패를 알리고 기존 기록과 커서를 유지해 다시 시도한다', async () => {
    const user = userEvent.setup();
    const cursor = { createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' };
    listAuditLogsAction
      .mockResolvedValueOnce({ ok: false, error: 'TEMPORARY' })
      .mockResolvedValueOnce({ ok: true, logs: [log({ id: 'a-2', actorName: '박추가' })], nextCursor: null });

    render(
      <AuditLogPanel workspaceType="buyer" initialLogs={[log({ id: 'a-1' })]} initialNextCursor={cursor} />,
    );
    await user.click(screen.getByRole('button', { name: '더 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('활동 기록을 더 불러오지 못했어요');
    expect(screen.getByText('김선정')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('박추가')).toBeInTheDocument();
    expect(listAuditLogsAction).toHaveBeenNthCalledWith(2, { workspaceId: 'workspace-1', before: cursor });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('더 보기 요청이 예외를 던져도 재시도할 수 있다', async () => {
    const user = userEvent.setup();
    listAuditLogsAction.mockRejectedValueOnce(new Error('network'));
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'a-1' })]}
        initialNextCursor={{ createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' }}
      />,
    );
    await user.click(screen.getByRole('button', { name: '더 보기' }));
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeEnabled();
  });

  it('워크스페이스 전환 오류에서 기존 기록을 보존하고 새 화면으로 새로고침한다', async () => {
    const user = userEvent.setup();
    listAuditLogsAction.mockResolvedValue({ ok: false, error: 'WORKSPACE_CHANGED' });
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'a-1' })]}
        initialNextCursor={{ createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '더 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다른 워크스페이스로 전환됐어요.');
    expect(screen.getByText('견적을 선정했어요')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '새로고침' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(listAuditLogsAction).toHaveBeenCalledOnce();
  });

  it('관리자 권한을 잃으면 기록을 유지하되 재시도를 제공하지 않는다', async () => {
    const user = userEvent.setup();
    listAuditLogsAction.mockResolvedValue({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'a-1' })]}
        initialNextCursor={{ createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '더 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('활동 기록을 볼 권한이 없어요.');
    expect(screen.getByText('견적을 선정했어요')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('인증 확인 실패에는 재시도와 로그인 경로를 함께 제공한다', async () => {
    const user = userEvent.setup();
    listAuditLogsAction.mockResolvedValue({ ok: false, error: 'UNAUTHENTICATED' });
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'a-1' })]}
        initialNextCursor={{ createdAt: '2026-06-12T03:00:00.000Z', id: 'a-1' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: '더 보기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('다시 시도하거나 로그인해 주세요.');
    expect(screen.getByRole('link', { name: '다시 로그인' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled();
  });

  it('저장된 역할·발송 건수·견적 회차를 요약하고 내부 식별자는 숨긴다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[
          log({ id: 'role', action: 'workspace.member_role_change', entityType: 'workspace', entityId: 'ws-1', metadata: { role: 'admin', targetUserId: 'secret-id' } }),
          log({ id: 'invite', action: 'workspace.member_invite', entityType: 'workspace', entityId: 'ws-1', metadata: { role: 'member', email: 'private@example.com' } }),
          log({ id: 'send', action: 'rfp.send_invitations', metadata: { sentCount: 3 } }),
          log({ id: 'round', action: 'bid.submit', metadata: { round: 2 } }),
        ]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('멤버 역할을 관리자로 바꿨어요')).toBeInTheDocument();
    expect(screen.getByText('멤버 권한으로 초대했어요')).toBeInTheDocument();
    expect(screen.getByText(/3곳/)).toBeInTheDocument();
    expect(screen.getByText(/2차/)).toBeInTheDocument();
    expect(screen.queryByText(/secret-id|private@example.com/)).not.toBeInTheDocument();
  });

  it('metadata가 없거나 잘못된 값이면 기존 사건 문구만 보여준다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[log({ id: 'malformed', action: 'workspace.member_role_change', metadata: { role: 'owner' } })]}
        initialNextCursor={null}
      />,
    );
    expect(screen.getByText('멤버 역할을 바꿨어요')).toBeInTheDocument();
    expect(screen.queryByText(/owner/)).not.toBeInTheDocument();
  });

  it('역할 변경·초대·게시판 공개의 양쪽 상태를 구분한다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[
          log({ id: 'role-member', action: 'workspace.member_role_change', metadata: { role: 'member' } }),
          log({ id: 'invite-admin', action: 'workspace.member_invite', metadata: { role: 'admin' } }),
          log({ id: 'board-on', action: 'rfp.board_visibility', metadata: { visible: true } }),
          log({ id: 'board-off', action: 'rfp.board_visibility', metadata: { visible: false } }),
        ]}
        initialNextCursor={null}
      />,
    );

    expect(screen.getByText('멤버 역할을 멤버로 바꿨어요')).toBeInTheDocument();
    expect(screen.getByText('관리자 권한으로 초대했어요')).toBeInTheDocument();
    expect(screen.getByText('견적 요청을 게시판에 공개했어요')).toBeInTheDocument();
    expect(screen.getByText('견적 요청의 게시판 공개를 껐어요')).toBeInTheDocument();
  });

  it('잘못된 건수와 첫 견적 회차는 검증된 기본 문구로 표시한다', () => {
    render(
      <AuditLogPanel
        workspaceType="buyer"
        initialLogs={[
          log({ id: 'zero', action: 'rfp.send_invitations', metadata: { sentCount: 0 } }),
          log({ id: 'fraction', action: 'rfp.send_invitations', metadata: { sentCount: 1.5 } }),
          log({ id: 'first-round', action: 'bid.submit', metadata: { round: 1 } }),
        ]}
        initialNextCursor={null}
      />,
    );

    expect(screen.getAllByText('견적 요청을 보냈어요')).toHaveLength(2);
    expect(screen.getByText('견적을 제출했어요')).toBeInTheDocument();
    expect(screen.queryByText(/0곳|1.5곳|1차/)).not.toBeInTheDocument();
  });
});
