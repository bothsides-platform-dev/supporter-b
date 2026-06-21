// 말풍선 묶음/날짜 구분선 파생 — 상대방(ThreadView)·팀(TeamThreadView) 채팅 공용 순수 로직.
// 두 뷰가 render map 안에서 동일하게 복제하던 계산의 단일 출처.
// 발신자 비교 키는 둘 다 authorUserId(같은 회사라도 담당자가 다르면 묶음 분리).
// self 헤더 노출 정책은 뷰마다 다르므로(ThreadView=양쪽, TeamThreadView=상대만)
// 여기서는 groupedWithPrev 까지만 계산하고, 헤더 결정은 호출부가 한다.

import { formatDayLabel, withinGroupWindow } from './format';

export type GroupableMessage = { createdAt: string; authorUserId: string };

export type MessageGrouping = {
  /** 직전 메시지와 다른 날 → 중앙 날짜 구분선을 그린다. */
  showDivider: boolean;
  /** 구분선에 표시할 날짜 라벨. */
  dayLabel: string;
  /** 같은 작성자·윈도 이내·같은 날 → 작성자 헤더 생략 대상. */
  groupedWithPrev: boolean;
};

export function computeMessageGrouping(messages: GroupableMessage[]): MessageGrouping[] {
  return messages.map((m, i) => {
    const dayLabel = formatDayLabel(m.createdAt);
    const prev = i > 0 ? messages[i - 1] : null;
    const prevDayLabel = prev ? formatDayLabel(prev.createdAt) : null;
    const showDivider = dayLabel !== prevDayLabel;
    const groupedWithPrev =
      prev !== null &&
      prev.authorUserId === m.authorUserId &&
      !showDivider &&
      withinGroupWindow(prev.createdAt, m.createdAt);
    return { showDivider, dayLabel, groupedWithPrev };
  });
}
