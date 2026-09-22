// 랜딩 데모(비로그인)에서 컴포저를 잠글 때 띄우는 안내. 실제 스레드 뷰를 그대로
// 쓰므로 입력창 모양은 같고, 전송만 막고 이유를 밝힌다(무반응 입력 금지).
export function GuestConversationNotice() {
  return (
    <p className="shrink-0 border-t border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
      가입하면 구매사와 바로 대화할 수 있어요.
    </p>
  );
}
