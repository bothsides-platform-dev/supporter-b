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

import { isUnread, type NotificationStatus } from '../notification';

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
