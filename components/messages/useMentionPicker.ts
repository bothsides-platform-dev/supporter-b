'use client';

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  detectMentionQuery,
  buildMentionItems,
  applyMentionSelection,
  resolveMentionsToBody,
  type MentionCandidate,
  type MentionItem,
  type MentionQuery,
  type TrackedMention,
} from './mention-input';

// TeamThreadView @멘션 컨트롤러 — mention-input.ts 순수 함수를 감싸 상태/키보드 네비/선택/
// 캐럿 복원을 다룬다. textarea·draft·setDraft 는 호출처가 소유하고 주입한다.
export function useMentionPicker({
  teamMembers,
  viewerUserId,
  textareaRef,
  draft,
  setDraft,
}: {
  teamMembers: MentionCandidate[];
  viewerUserId: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  setDraft: (value: string) => void;
}) {
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const trackedRef = useRef<TrackedMention[]>([]);
  const caretRef = useRef<number | null>(null);

  // 렌더용 이름 맵 + 동명이인 집합(전체 로스터 기준).
  const nameById = useMemo(
    () => new Map(teamMembers.map((m) => [m.userId, m.name])),
    [teamMembers],
  );
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of teamMembers) seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  }, [teamMembers]);
  // 본인 제외 후보(드롭다운).
  const candidates = useMemo(
    () => teamMembers.filter((m) => m.userId !== viewerUserId),
    [teamMembers, viewerUserId],
  );

  // applyMentionSelection 이 설정한 caret 위치로 복원(draft 반영 후).
  useEffect(() => {
    if (caretRef.current !== null && textareaRef.current) {
      const pos = caretRef.current;
      textareaRef.current.setSelectionRange(pos, pos);
      caretRef.current = null;
    }
  }, [draft, textareaRef]);

  function closeMenu(): void {
    setMentionQuery(null);
    setMentionItems([]);
  }

  // textarea 변경 시 호출 — @쿼리를 감지해 드롭다운을 연다.
  function onTextChange(value: string, caret: number): void {
    const q = detectMentionQuery(value, caret);
    if (q) {
      const items = buildMentionItems(candidates, q.query);
      setMentionQuery(items.length > 0 ? q : null);
      setMentionItems(items);
      setMentionIndex(0);
    } else {
      closeMenu();
    }
  }

  function pick(item: MentionItem): void {
    if (!mentionQuery) return;
    const sel =
      item.kind === 'all'
        ? ({ kind: 'all' } as const)
        : ({ kind: 'member', userId: item.userId, name: item.name } as const);
    const out = applyMentionSelection(draft, mentionQuery, sel);
    trackedRef.current = [...trackedRef.current, out.tracked];
    caretRef.current = out.caret;
    setDraft(out.text);
    closeMenu();
  }

  // 드롭다운이 열려 있을 때만 키를 처리. 반환값 true=소비됨(호출처는 Enter 전송 안 함).
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!mentionQuery || mentionItems.length === 0) return false;
    if (e.nativeEvent.isComposing) return true;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionItems.length);
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionItems.length) % mentionItems.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(mentionItems[mentionIndex]);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return true;
    }
    return false;
  }

  // 전송 본문 — 표시용 평문 + 추적된 멘션을 구조화 토큰으로 환원.
  function resolveBody(text: string): string {
    return resolveMentionsToBody(text, trackedRef.current);
  }

  // 전송 후 초기화 — 추적 멘션을 비우고 드롭다운을 닫는다.
  function reset(): void {
    trackedRef.current = [];
    closeMenu();
  }

  return {
    items: mentionItems,
    activeIndex: mentionIndex,
    dropdownVisible: !!mentionQuery && mentionItems.length > 0,
    onHover: setMentionIndex,
    nameById,
    duplicateNames,
    onTextChange,
    onKeyDown,
    pick,
    resolveBody,
    reset,
  };
}
