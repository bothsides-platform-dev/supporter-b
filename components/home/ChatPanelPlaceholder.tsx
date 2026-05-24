import { EmptyState } from '@/components/primitives/EmptyState';
import { EnvelopeIcon } from '@/components/icons';

/**
 * 채팅 placeholder — RFP별 비공개 1:N 구조상 채팅의 최종 형태는 RFP별 스레드 목록.
 * 빈 대화 목록 + 비활성 CTA로 그 구조를 미리 텔레그래프(렌더 전용, 백엔드 없음).
 */
export function ChatPanelPlaceholder() {
  return (
    <aside
      aria-label="메시지"
      className="flex h-full min-h-[320px] flex-col rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]"
    >
      <header className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
        메시지
      </header>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          icon={<EnvelopeIcon />}
          title="대화가 아직 없습니다"
          description="구매사·PG 간 메시지가 곧 제공됩니다."
        />
      </div>
      <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="w-full rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] py-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)] opacity-60"
        >
          새 메시지
        </button>
      </div>
    </aside>
  );
}
