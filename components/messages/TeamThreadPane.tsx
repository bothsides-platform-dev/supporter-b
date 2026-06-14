'use client';

/**
 * TeamThreadPane — 통합 인박스 'team' 항목 선택 시 마운트하는 팀 스레드 페인.
 *
 * ChatPanel 내부 TeamThreadPane 의 standalone 미러: useEffect 로더 패턴
 * (use(serverAction) 의 render-phase Router 업데이트 경고 회피). unmount/rfpId
 * 변경 시 캐시 무효화 → 재진입마다 신선한 스레드. 자체적으로 로딩 스켈레톤을
 * 관리하므로 호출부에 Suspense 가 필요 없다.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { TeamThreadView } from './TeamThreadView';
import { ThreadSkeleton } from './ThreadSkeleton';
import { getTeamThreadPromise, invalidateTeamThread } from './team-thread-cache';
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';

export function TeamThreadPane({ rfpId }: { rfpId: string }) {
  const [result, setResult] = useState<LoadTeamThreadResult | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- rfpId/재시도 변경 시 이전 스레드를 즉시 비워 스켈레톤을 보여주는 의도된 리셋
    setResult(null);
    getTeamThreadPromise(rfpId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
      invalidateTeamThread(rfpId);
    };
  }, [rfpId, retry]);

  if (!result) return <ThreadSkeleton />;

  if (!result.ok) {
    return (
      <EmptyState
        title="팀 채팅을 불러오지 못했어요"
        description="네트워크 상태를 확인하고 다시 시도해 주세요."
        className="py-12"
        action={
          <Button
            size="sm"
            onClick={() => {
              invalidateTeamThread(rfpId);
              setRetry((n) => n + 1);
            }}
          >
            다시 시도
          </Button>
        }
      />
    );
  }

  return (
    <TeamThreadView
      rfpId={result.rfpId}
      workspaceId={result.workspaceId}
      viewerUserId={result.viewerUserId}
      messages={result.messages}
    />
  );
}
