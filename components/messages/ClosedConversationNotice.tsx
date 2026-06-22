// 선정(award)이 끝난 견적에서 미선정 PG 와의 상대방 채팅을 닫을 때 컴포저 위에
// 띄우는 안내 문구. 입력·전송 비활성과 함께 노출한다. SampleSendDisabledNotice 와
// 같은 시각 언어(상단 보더 + 12px 보조색).
export function ClosedConversationNotice() {
  return (
    <p className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
      견적 선정이 끝나 이 대화는 종료됐어요.
    </p>
  );
}
