'use client';

/**
 * useNotifications — Sidebar 배지와 알림 페이지 리스트가 같은 알림 상태를
 * 공유하는 클라이언트 훅. 핵심 결정(advisor):
 *
 *   1) **module-scoped Zustand store** — 같은 페이지에 여러 consumer(Sidebar
 *      배지 + 알림 리스트)가 있어도 상태는 단일 인스턴스.
 *   2) **EventSource ref-count singleton** — 첫 mount 시 1회 open, 마지막
 *      consumer가 unmount 될 때 close. 탭당 SSE 연결 1개 보장.
 *      cookie 자동 동봉(advisor pin 7: same-origin) — auth 별도 처리 불필요.
 *   3) **GET /api/notifications**로 history hydrate, **EventSource**로 신규
 *      prepend (advisor pin 5).
 *   4) 액션은 'use server' import 그대로 호출 — payload는 작아 전송 비용 무시.
 */
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import type { Notification } from '@/lib/types/notification';
import { http } from '@/lib/http';
import { toast } from '@/lib/toast';
import { markNotificationReadAction } from '@/lib/server/actions/notifications/markNotificationReadAction';
import { markAllReadAction } from '@/lib/server/actions/notifications/markAllReadAction';
import { retryEmailNotificationAction } from '@/lib/server/actions/notifications/retryEmailNotificationAction';

type NotifStore = {
  notifications: Notification[];
  status: 'idle' | 'loading' | 'live' | 'error';
  setAll: (list: Notification[]) => void;
  prepend: (n: Notification) => void;
  setStatus: (s: NotifStore['status']) => void;
  patchOne: (id: string, patch: Partial<Notification>) => void;
  markAllReadLocal: () => void;
};

const useStore = create<NotifStore>((set) => ({
  notifications: [],
  status: 'idle',
  setAll: (list) => set({ notifications: list }),
  prepend: (n) =>
    set((s) => ({
      // dedupe — 동일 id가 이미 있으면 무시(서버 재구독 race 등).
      notifications: s.notifications.some((x) => x.id === n.id)
        ? s.notifications
        : [n, ...s.notifications],
    })),
  setStatus: (status) => set({ status }),
  patchOne: (id, patch) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, ...patch } : n,
      ),
    })),
  markAllReadLocal: () =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.status === 'pending' || n.status === 'sent'
          ? { ...n, status: 'read', readAt: new Date().toISOString() }
          : n,
      ),
    })),
}));

// ── Singleton EventSource + history fetch (ref-counted) ────────────────
let subscribers = 0;
let eventSource: EventSource | null = null;
let historyLoaded = false;
// 현재 싱글톤이 들고 있는 워크스페이스. 워크스페이스를 전환하면 이전 ws의
// 알림/구독이 그대로 남아 stale 해지므로(Phase 7b 버그), 키가 바뀔 때 리셋한다.
let activeWorkspaceId: string | undefined;

async function loadHistory(): Promise<void> {
  if (historyLoaded) return;
  historyLoaded = true;
  // 이 fetch 가 속한 워크스페이스를 고정한다. 전환 중이면 이전 ws 요청이 아직
  // in-flight 인 채로 새 ws fetch 가 시작되고, 둘이 역순으로 도착할 수 있다.
  // 응답이 돌아왔을 때 activeWorkspaceId 가 바뀌었으면 stale 응답이므로 버린다
  // (안 그러면 늦게 온 이전 ws 알림이 새 ws 를 덮어써 다시 stale 해진다 — TOCTOU).
  const fetchWorkspaceId = activeWorkspaceId;
  try {
    useStore.getState().setStatus('loading')
    const data = await http
      .get('/api/notifications')
      .json<{ notifications: Notification[] }>()
    if (activeWorkspaceId !== fetchWorkspaceId) return;
    useStore.getState().setAll(data.notifications)
  } catch {
    if (activeWorkspaceId !== fetchWorkspaceId) return;
    useStore.getState().setStatus('error')
    historyLoaded = false
  }
}

function openStream(): void {
  if (eventSource) return;
  // EventSource는 same-origin이면 cookie 자동 동봉(withCredentials는 cross-
  // origin에서만 의미). 401이면 onerror에서 status 갱신 후 close.
  const es = new EventSource('/api/notifications/stream');
  eventSource = es;
  es.onopen = () => useStore.getState().setStatus('live');
  es.onmessage = (ev) => {
    try {
      const n = JSON.parse(ev.data) as Notification;
      // 재구독 race 등으로 동일 id가 다시 올 수 있다. prepend 는 자체 dedupe 하므로,
      // 중복일 때 toast 가 발화하지 않도록 prepend 전에 신규 여부를 판정한다.
      // (history hydrate 는 setAll 경로라 이 핸들러를 거치지 않아 자연히 toast 되지 않는다.)
      const isNew = !useStore
        .getState()
        .notifications.some((x) => x.id === n.id);
      useStore.getState().prepend(n);
      if (isNew) toast(n.title);
    } catch {
      // ignore malformed payload
    }
  };
  es.onerror = () => {
    useStore.getState().setStatus('error');
    // 브라우저가 자동 재연결 시도하므로 close 안 함. 단, 서버가 401로
    // 응답한 경우 onerror 후 readyState===CLOSED — 그 경우만 정리.
    if (es.readyState === EventSource.CLOSED) {
      es.close();
      if (eventSource === es) eventSource = null;
    }
  };
}

function closeStream(): void {
  if (!eventSource) return;
  eventSource.close();
  eventSource = null;
  historyLoaded = false;
  useStore.getState().setStatus('idle');
}

// 워크스페이스가 바뀌면 이전 ws의 캐시·구독을 버리고 깨끗한 상태로 되돌린다.
// (ref-count 는 건드리지 않는다 — 같은 mount들이 새 ws로 다시 hydrate 한다.)
function resetForWorkspace(workspaceId: string | undefined): void {
  if (workspaceId === activeWorkspaceId) return;
  activeWorkspaceId = workspaceId;
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  historyLoaded = false;
  useStore.getState().setAll([]);
  useStore.getState().setStatus('idle');
}

export function useNotifications(workspaceId?: string) {
  const notifications = useStore((s) => s.notifications);
  const status = useStore((s) => s.status);

  useEffect(() => {
    // 워크스페이스 전환 감지 → 싱글톤 리셋 후 새 ws용으로 다시 hydrate.
    if (workspaceId !== undefined) resetForWorkspace(workspaceId);
    subscribers += 1;
    void loadHistory();
    openStream();
    return () => {
      subscribers -= 1;
      if (subscribers <= 0) {
        subscribers = 0;
        closeStream();
      }
    };
  }, [workspaceId]);

  const markRead = useCallback(async (id: string) => {
    // optimistic — server roundtrip 후 실패하면 최악으로도 unread 복구는
    // 다음 history fetch에서 자연 정정됨.
    useStore.getState().patchOne(id, {
      status: 'read',
      readAt: new Date().toISOString(),
    });
    await markNotificationReadAction({ notificationId: id });
  }, []);

  const markAllRead = useCallback(async () => {
    useStore.getState().markAllReadLocal();
    await markAllReadAction();
  }, []);

  const retryEmail = useCallback(async (id: string) => {
    return retryEmailNotificationAction({ notificationId: id });
  }, []);

  const unreadCount = notifications.filter(
    (n) => n.status === 'pending' || n.status === 'sent',
  ).length;

  return {
    notifications,
    unreadCount,
    status,
    markRead,
    markAllRead,
    retryEmail,
  };
}
