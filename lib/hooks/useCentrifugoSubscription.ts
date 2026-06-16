'use client';

/**
 * useCentrifugoSubscription — shared Centrifugo channel-subscription lifecycle.
 *
 * Extracted from useChatChannel / useTeamChannel, which had byte-identical
 * connect/subscribe/cleanup boilerplate. Owns: the graceful no-op when realtime
 * is unconfigured, the getSubscription-or-newSubscription handle, publication
 * routing, connected-state tracking, and the subtle cleanup (unsubscribe +
 * removeSubscription so a remount of the same channel gets a fresh handler set
 * instead of double-registering — fires onPublication twice otherwise).
 *
 * Channel-specific concerns stay with the caller: presence (join/leave/
 * subscribed → presenceStats via `subRef`), typing timers, and client publishes
 * (sendTyping via `subRef`). The caller passes the channel string it computes,
 * so the subscribe effect re-runs exactly when the channel identity changes.
 *
 * Graceful no-op (load-bearing): getCentrifuge() returns null when
 * NEXT_PUBLIC_CENTRIFUGO_WS_URL is unset (dev + every test) — no connect, no
 * subscribe, no throw; connected stays null.
 */
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { PublicationContext, Subscription } from 'centrifuge';

import { getCentrifuge } from '@/lib/realtime/centrifuge-client';

export type CentrifugoSubscriptionOptions = {
  // 구독 핸들 노출 — presence(presenceStats)·publish 등 채널별 동작을 소비처가 수행.
  subRef?: MutableRefObject<Subscription | null>;
  onPublication?: (ctx: PublicationContext) => void;
  // presence 신호 — 제공한 이벤트만 등록한다(team 채널은 presence 없음).
  onSubscribed?: () => void;
  onJoin?: () => void;
  onLeave?: () => void;
};

export type UseCentrifugoSubscriptionResult = {
  connected: boolean | null;
};

export function useCentrifugoSubscription(
  channel: string,
  options: CentrifugoSubscriptionOptions,
): UseCentrifugoSubscriptionResult {
  const [connected, setConnected] = useState<boolean | null>(null);

  // 콜백을 ref 로 들고 매 렌더 갱신 — 핸들러가 바뀌어도 재구독하지 않는다.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const client = getCentrifuge();
    // 미설정 realtime → graceful no-op.
    if (!client) return;

    const sub = client.getSubscription(channel) ?? client.newSubscription(channel);
    const subRef = optionsRef.current.subRef;
    if (subRef) subRef.current = sub;

    sub.on('publication', (ctx: PublicationContext) => optionsRef.current.onPublication?.(ctx));
    // presence 핸들러는 제공된 것만 등록 — team 채널은 join/leave/subscribed 미등록.
    if (optionsRef.current.onSubscribed) sub.on('subscribed', () => optionsRef.current.onSubscribed?.());
    if (optionsRef.current.onJoin) sub.on('join', () => optionsRef.current.onJoin?.());
    if (optionsRef.current.onLeave) sub.on('leave', () => optionsRef.current.onLeave?.());

    const onConnected = () => setConnected(true);
    const onDisconnected = () => setConnected(false);
    client.on('connected', onConnected);
    client.on('disconnected', onDisconnected);

    sub.subscribe();
    client.connect();

    return () => {
      sub.unsubscribe();
      // unsubscribe() 는 상태만 바꾸고 sub 은 레지스트리에 남는다. 제거해 같은
      // 채널 remount 시 newSubscription() 으로 새 sub 을 받게 한다(핸들러 중복
      // 등록 방지 — 안 그러면 onPublication 이 두 번 호출됨). 단일 소비자 모델 하 안전.
      client.removeSubscription(sub);
      client.off('connected', onConnected);
      client.off('disconnected', onDisconnected);
      if (subRef) subRef.current = null;
    };
  }, [channel]);

  return { connected };
}
