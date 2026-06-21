// 샘플 RFP 상대방 채팅 전송 차단 안내 — 데모 PG 에게 실제로 메시지가 가지 않도록
// 입력·전송을 막을 때 컴포저 위에 띄우는 안내 문구. ThreadView·ChatPanel 공용 단일 출처.
export function SampleSendDisabledNotice() {
  return (
    <p className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
      샘플에서는 메시지를 보낼 수 없어요. 실제 견적 요청을 보내보세요.
    </p>
  );
}
