// ThreadPane — Suspense 기반 대화 스레드 페인.
// 핵심 계약: conversationId 변경/unmount 시 thread-cache 엔트리를 무효화해
// 재방문 시 스테일 스냅샷이 아닌 신선한 스레드를 보여준다.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Suspense } from 'react';

// vi.mock 은 호이스팅되므로, 감시 함수를 vi.hoisted() 로 미리 선언한다.
const { invalidateThread, getThreadPromise } = vi.hoisted(() => ({
  invalidateThread: vi.fn(),
  getThreadPromise: vi.fn((id: string) =>
    Promise.resolve({
      ok: true as const,
      counterparty: { name: '상대', type: 'pg' as const, workspaceId: 'ws-pg', logoUpdatedAt: null },
      messages: [],
      viewer: { userId: 'u-me', name: '나' },
      rfpById: undefined,
      _cid: id,
    }),
  ),
}));

vi.mock('../thread-cache', () => ({ invalidateThread, getThreadPromise }));

vi.mock('../ThreadView', () => ({
  ThreadView: ({ conversationId }: { conversationId: string }) => (
    <div data-testid={`thread-${conversationId}`} />
  ),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ThreadPane } from '../ThreadPane';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeProps(conversationId: string) {
  return {
    conversationId,
    counterpartyFallback: { workspaceId: 'ws-pg', name: '상대', type: 'pg' as const, logoUpdatedAt: null },
  };
}

describe('ThreadPane', () => {
  it('invalidates the thread cache on unmount', async () => {
    let unmount!: () => void;

    // act(async) 으로 render 를 감싸면 use()+Suspense 의 마이크로태스크
    // 사이클을 React 스케줄러가 flush 해 ThreadView 가 실제로 마운트된다.
    await act(async () => {
      ({ unmount } = render(
        <Suspense fallback={<div data-testid="loading" />}>
          <ThreadPane {...makeProps('conv-1')} />
        </Suspense>,
      ));
    });

    expect(screen.getByTestId('thread-conv-1')).toBeInTheDocument();

    unmount();

    expect(invalidateThread).toHaveBeenCalledWith('conv-1');
  });

  it('invalidates old conversationId when conversationId prop changes', async () => {
    let rerender!: (ui: React.ReactElement) => void;

    await act(async () => {
      ({ rerender } = render(
        <Suspense fallback={<div data-testid="loading" />}>
          <ThreadPane {...makeProps('conv-1')} />
        </Suspense>,
      ));
    });

    expect(screen.getByTestId('thread-conv-1')).toBeInTheDocument();

    await act(async () => {
      rerender(
        <Suspense fallback={<div data-testid="loading" />}>
          <ThreadPane {...makeProps('conv-2')} />
        </Suspense>,
      );
    });

    expect(screen.getByTestId('thread-conv-2')).toBeInTheDocument();

    // conv-1 → conv-2 전환 시 conv-1 캐시가 무효화돼야 한다.
    expect(invalidateThread).toHaveBeenCalledWith('conv-1');
  });
});
