// 낙관적 전송 reconcile — 상대방·팀 채팅 공용 순수 로직.
// 두 뷰의 메시지 뷰모델은 다르지만(ThreadMessage vs TeamThreadMessage)
// 여기서 만지는 건 id/pending/createdAt 뿐이라 제네릭으로 공유한다.
// 상태 소유·채널 구독·전송 액션·실패 복원 순서·말풍선 build 는 각 뷰가 그대로 보유한다.

type Reconcilable = { id: string; pending?: boolean; createdAt: string };

// 전송 성공: 임시(pending) 말풍선을 서버 권위 id 로 승격한다. 단, 라이브 echo 가
// 먼저 같은 실 id 를 추가했다면 임시 행을 버린다(중복 방지). `patch` 는 승격 시
// 덮어쓸 추가 필드 — 팀 채팅은 서버 첨부(`attachments`)로 교체한다.
export function promoteSentMessage<M extends Reconcilable>(
  messages: M[],
  tempId: string,
  realId: string,
  createdAt: string | undefined,
  patch?: Partial<M>,
): M[] {
  const hasReal = messages.some((m) => m.id === realId);
  return messages.flatMap((m) =>
    m.id === tempId
      ? hasReal
        ? []
        : [{ ...m, id: realId, pending: false, createdAt: createdAt ?? m.createdAt, ...patch }]
      : [m],
  );
}

// 전송 실패: 임시 말풍선 제거(드래프트·첨부 복원은 호출처가 담당).
export function removeMessage<M extends { id: string }>(messages: M[], tempId: string): M[] {
  return messages.filter((m) => m.id !== tempId);
}

// 라이브 echo 수신: 같은 id 가 이미 있으면 원본 배열 그대로 반환(중복 무시 → React bail).
// 본인 echo 면 진행 중 pending 말풍선을 확정 승격(append 하면 중복). 둘 다 아니면
// null 반환 → 호출처가 자기 뷰모델로 새 메시지를 append.
export function applyLiveEcho<M extends Reconcilable>(
  messages: M[],
  realId: string,
  isSelf: boolean,
  createdAt: string,
): M[] | null {
  if (messages.some((m) => m.id === realId)) return messages;
  if (isSelf) {
    const idx = messages.findIndex((m) => m.pending);
    if (idx >= 0) {
      const next = messages.slice();
      // 서버 권위 타임스탬프 채택 — 리로드 후 로더 렌더와 일치.
      next[idx] = { ...next[idx], id: realId, pending: false, createdAt: createdAt ?? next[idx].createdAt };
      return next;
    }
  }
  return null;
}
