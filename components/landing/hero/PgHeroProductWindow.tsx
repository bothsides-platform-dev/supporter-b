import { Chip, type ChipColor } from '@/components/primitives/Chip';

// PG 히어로 '제품 창' — 구매사 히어로의 견적 비교표(HeroProductWindow) 자리를 PG 관점의
// '받은 견적 요청' 인박스로 대체한다(파트너의 핵심 가치 = 검증된 인바운드 수신).
// 창 크롬은 HeroProductWindow 와 같은 계열. 장식용이라 인터랙션·접근성 트리에서 제외한다.
//
// ⚠ 내용물은 전부 결정적 리터럴이어야 한다 — pg-demo-fixtures / InboxList 는 모듈 스코프
// Date.now() 로 마감일을 계산하는 hydration mismatch 지뢰라 임베드 금지(HeroProductWindow
// 헤더 주석과 같은 규칙).
type InboxRow = {
  title: string;
  buyer: string;
  dday: string;
  status: { label: string; color: ChipColor };
};

const ROWS: InboxRow[] = [
  {
    title: '2026 결제 인프라 견적 요청',
    buyer: '브링콘파트너스',
    dday: 'D-3',
    status: { label: '새 요청', color: 'primary' },
  },
  {
    title: '정기결제(빌링) 전환 견적',
    buyer: '미팅학개론',
    dday: 'D-5',
    status: { label: '검토중', color: 'warning' },
  },
  {
    title: '해외카드 수수료 재협상',
    buyer: '보스사이드 커머스',
    dday: 'D-1',
    status: { label: '선정됨', color: 'tertiary' },
  },
];

export function PgHeroProductWindow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-full w-full select-none flex-col overflow-hidden rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)]"
    >
      {/* 창 크롬 — 데모 창과 같은 계열의 미니 탑바 */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
        </span>
        <span className="font-mono text-xs tracking-[0.08em] text-[var(--md-sys-color-on-surface-variant)]">
          받은 견적 요청
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-[var(--s-4)] overflow-hidden p-5 md:p-6">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="text-[15px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
            받은 견적 요청
          </span>
          <Chip label="새 요청 3건" color="primary" />
        </div>

        <div className="flex flex-col gap-[var(--s-2)]">
          {ROWS.map((row) => (
            <div
              key={row.title}
              className="flex items-center justify-between gap-[var(--s-4)] rounded-md border border-[var(--md-sys-color-outline-variant)] px-[var(--s-4)] py-[var(--s-3)]"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
                  {row.title}
                </span>
                <span className="truncate text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {row.buyer}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-[var(--s-3)]">
                <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {row.dday}
                </span>
                <Chip label={row.status.label} color={row.status.color} />
              </div>
            </div>
          ))}
        </div>

        <p className="font-mono text-xs tracking-[0.06em] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
          * 표시 값은 이해를 돕기 위한 예시입니다.
        </p>
      </div>
    </div>
  );
}
