// isUnread — "안 읽음" 판정식의 단일 출처.
//
// 이 술어가 생기기 전에는 판정식이 셋으로 갈려 있었다: 알림 페이지 헤더는
// `status !== 'read'`(= failed 포함), 사이드바 배지 훅은 `pending|sent`,
// markAllRead 리포는 `read_at IS NULL`. 그래서 헤더 숫자와 사이드바 배지가
// 서로 다른 것을 셀 수 있었다.
//
// `failed` 를 제외하는 것이 핵심 결정이다 — 목록 행의 상태 칩이 failed 를
// `미읽음` 이 아니라 `실패` 로 라벨링하므로, failed 를 미읽음으로 세면 헤더
// 숫자가 바로 아래 칩들과 어긋난다.
import { describe, expect, it } from 'vitest';

import {
  UNREAD_LABEL,
  canMarkRead,
  isUnread,
  unreadCountLabel,
  type NotificationStatus,
} from '../notification';

describe('isUnread', () => {
  it('아직 읽지 않은 상태(pending·sent)를 미읽음으로 센다', () => {
    expect(isUnread({ status: 'pending' })).toBe(true);
    expect(isUnread({ status: 'sent' })).toBe(true);
  });

  it('읽은 알림은 미읽음이 아니다', () => {
    expect(isUnread({ status: 'read' })).toBe(false);
  });

  // 전달 실패는 "안 읽음"이 아니라 "실패"다 — 행 상태 칩이 그렇게 라벨링한다.
  it('전달 실패(failed)는 미읽음으로 세지 않는다', () => {
    expect(isUnread({ status: 'failed' })).toBe(false);
  });

  // 상태가 늘어나도 판정이 빠짐없이 정의돼 있어야 한다.
  it('모든 상태에 대해 판정이 정의돼 있다', () => {
    const all: NotificationStatus[] = ['pending', 'sent', 'failed', 'read'];
    const unread = all.filter((status) => isUnread({ status }));
    expect(unread).toEqual(['pending', 'sent']);
  });
});

// 술어는 하나가 아니라 둘이다. 하나로 묶으려다 오히려 틀린 코드를 만든 적이 있어
// (markAllReadLocal 이 pending|sent 만 패치하는데 SQL 은 read_at IS NULL 을 전부
// 지워, 실패 알림이 서버에서는 읽음인데 화면에서는 안 읽음으로 남았다) 두 개를
// 나란히 둔다.
describe('canMarkRead', () => {
  it('아직 읽음 처리되지 않은 것은 전부 true — 전달 실패도 포함한다', () => {
    expect(canMarkRead({ status: 'pending' })).toBe(true);
    expect(canMarkRead({ status: 'sent' })).toBe(true);
    // 실패는 "안 읽음"으로 세지는 않지만(칩이 `실패` 라고 말한다) 사용자가
    // 치울 수는 있어야 한다. markAllRead 의 SQL(`read_at IS NULL`)도 이걸 지운다.
    expect(canMarkRead({ status: 'failed' })).toBe(true);
  });

  it('이미 읽은 것은 false', () => {
    expect(canMarkRead({ status: 'read' })).toBe(false);
  });

  // 이 한 줄이 두 술어가 왜 따로인지를 못박는다 — 같아지면 하나로 합쳐야 한다.
  it('failed 에서만 isUnread 와 갈린다', () => {
    const all: NotificationStatus[] = ['pending', 'sent', 'failed', 'read'];
    const diverging = all.filter((status) => isUnread({ status }) !== canMarkRead({ status }));
    expect(diverging).toEqual(['failed']);
  });
});

describe('UNREAD_LABEL', () => {
  it('사용자에게 보이는 미확인 문구의 단일 출처다', () => {
    expect(UNREAD_LABEL).toBe('안 읽음');
  });

  it('개수 표기는 "안 읽음 N건"', () => {
    expect(unreadCountLabel(3)).toBe('안 읽음 3건');
    expect(unreadCountLabel(0)).toBe('안 읽음 0건');
  });
});
