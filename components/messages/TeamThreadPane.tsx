'use client';

/**
 * TeamThreadPane — 통합 인박스 'team' 항목 선택 시 마운트하는 팀 스레드 페인.
 *
 * ChatPanel 내부 TeamThreadPane 의 standalone 미러: useEffect 로더 패턴
 * (use(serverAction) 의 render-phase Router 업데이트 경고 회피). unmount/rfpId
 * 변경 시 캐시 무효화 → 재진입마다 신선한 스레드. 자체적으로 로딩 스켈레톤을
 * 관리하므로 호출부에 Suspense 가 필요 없다.
 *
 * onBack — 모바일 뒤로가기 콜백. 인박스에서 전달하며, ChatPanel 처럼 onBack 이
 * 불필요한 맥락에서는 생략한다.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ChevronLeftIcon } from '@/components/icons';
import { TeamThreadView } from './TeamThreadView';
import { ThreadSkeleton } from './ThreadSkeleton';
import { getTeamThreadPromise, invalidateTeamThread } from './team-thread-cache';
import type { LoadTeamThreadResult } from '@/lib/server/actions/chat/teamThreadLoader';

export function TeamThreadPane({ rfpId, onBack }: { rfpId: string; onBack?: () => void }) {
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
    <div className="flex h-full min-h-0 flex-col">
      {onBack && (
        <div className="flex shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] px-3 py-2 md:hidden">
          <button
            type="button"
            aria-label="대화 목록"
            onClick={onBack}
            className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface-variant)] transition-colors hover:bg-[var(--md-sys-color-surface-container)]"
          >
            <ChevronLeftIcon size={18} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <TeamThreadView
          rfpId={result.rfpId}
          workspaceId={result.workspaceId}
          viewerUserId={result.viewerUserId}
          teamMembers={result.teamMembers}
          messages={result.messages}
        />
      </div>
    </div>
  );
}
