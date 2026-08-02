'use client';

/**
 * DealRoomCenter — 딜룸 가운데 탭 뷰어. 탭 바(primitives/Tabs) + 활성 탭 본문.
 * 탭 상태는 controlled(부모 = side별 body)라 좌측 액션 레일이 탭을 전환할 수 있다.
 */
import { useState, type ReactNode } from 'react';

import { Tabs } from '@/components/primitives/Tabs';

export type DealRoomTab = {
  id: string;
  label: string;
  content: ReactNode;
  /**
   * 한 번 열리면 비활성이 돼도 언마운트하지 않고 숨긴다(마운트는 여전히 지연된다).
   *
   * 계약 탭이 이걸 쓴다: 안에 스노우싸인 임베드 iframe 이 있고, PG 가 거기에 PDF 를
   * 올리고 서명칸을 배치하는 수작업을 한다. 언마운트하면 그 작업이 통째로 사라진다
   * (리스도 함께 반납된다) — 요청 조건을 다시 읽으러 탭을 옮긴 것뿐인데.
   */
  keepMounted?: boolean;
};

type Props = {
  tabs: DealRoomTab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function DealRoomCenter({ tabs, activeId, onChange }: Props) {
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  // 활성이었던 적이 있는 keepMounted 탭만 계속 살려 둔다 — 열지도 않은 탭을 미리
  // 마운트하면 지연 마운트의 이점(구독·요청)이 사라진다.
  // 렌더 중 상태 조정 — React 가 명시적으로 지원하는 패턴이다(effect 로 미루면 한 프레임
  // 늦게 반영돼, 탭을 옮긴 그 렌더에서 keepMounted 탭이 잠깐 사라진다 = 언마운트).
  const [seen, setSeen] = useState<readonly string[]>([]);
  const openedId = active?.id;
  if (openedId && !seen.includes(openedId)) setSeen([...seen, openedId]);
  // **위치가 곧 정체성이다.** 활성 탭을 따로 렌더하고 kept 를 그 뒤에 붙이면, 탭을 옮기는
  // 순간 같은 컴포넌트가 다른 위치로 이동해 React 가 언마운트→재마운트한다 — keepMounted
  // 가 이름값을 못 한다(실제로 그렇게 짰다가 마운트 카운터 테스트에서 잡혔다).
  // 그래서 활성이든 아니든 **하나의 안정된 keyed 목록**으로 그리고 hidden 만 토글한다.
  const rendered = tabs.filter((t) => t.id === openedId || (t.keepMounted && seen.includes(t.id)));
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--md-sys-color-background)]">
      <div className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-[var(--md-sys-color-outline-variant)] px-4 py-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Tabs
          className="w-max min-w-full border-b-0"
          tabs={tabs.map((t) => ({ id: t.id, label: t.label }))}
          active={activeId}
          onChange={onChange}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {rendered.map((t) => (
          <div key={t.id} hidden={t.id !== openedId}>
            {t.content}
          </div>
        ))}
      </div>
    </div>
  );
}
