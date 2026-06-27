// 세션 만료 안내 — /logout 회로차단기가 루프를 끊고 `/login?reason=session` 으로
// 보낸 경우에만 노출한다. 유저는 로그아웃된 게 아니라 "막힌 세션이 정리됐으니 다시
// 로그인하면 된다"는 맥락이므로, 로그아웃 단정 대신 재로그인 안내로 표현한다.
// Linear: 저대비 보더, 일러스트/스피너 없음.
export function SessionExpiredNotice({ reason }: { reason: string | null }) {
  if (reason !== 'session') return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-[var(--s-4)]"
    >
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
        로그인 정보가 만료되어 다시 로그인해 주세요.
      </p>
    </div>
  );
}
