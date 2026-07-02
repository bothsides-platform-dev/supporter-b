'use client';

// 데모 메시지 — 실시간(Centrifugo) 의존 없이 고정 대화로 채팅 기능을 보여준다.
const THREADS = [
  { id: 't1', name: '와이즐리컴퍼니', preview: '정산주기 조건만 확인 부탁드려요.', active: true, unread: true },
  { id: 't2', name: '글로우서울', preview: '제안서 잘 받았습니다. 검토할게요.', active: false, unread: false },
] as const;

const MESSAGES = [
  { id: 'm1', mine: false, who: '와이즐리컴퍼니', text: '안녕하세요, 견적 잘 봤어요. 정산주기 D+2도 가능할까요?' },
  { id: 'm2', mine: true, who: '나', text: '네, D+2 가능합니다. 보증보험도 면제 조건으로 제안드릴게요.' },
  { id: 'm3', mine: false, who: '와이즐리컴퍼니', text: '좋아요. 그럼 그 조건으로 검토해볼게요. 감사합니다!' },
] as const;

export function PgMessagesPageHost() {
  return (
    <div className="relative flex h-full min-h-0 flex-col px-6 py-6">
      <h1 className="mb-4 text-[18px] font-medium tracking-[-0.01em] text-[var(--md-sys-color-on-surface)]">
        메시지
      </h1>
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--md-sys-color-outline-variant)]">
        {/* thread list */}
        <div className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--md-sys-color-outline-variant)] sm:flex">
          {THREADS.map((t) => (
            <div
              key={t.id}
              className={`flex flex-col gap-0.5 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-left ${
                t.active ? 'bg-[var(--md-sys-color-surface-container-high)]' : ''
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{t.name}</span>
                {t.unread && <span className="size-1.5 shrink-0 rounded-full bg-[var(--md-sys-color-primary)]" />}
              </div>
              <span className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{t.preview}</span>
            </div>
          ))}
        </div>

        {/* conversation */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center border-b border-[var(--md-sys-color-outline-variant)] px-4 text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">
            와이즐리컴퍼니
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            {MESSAGES.map((m) => (
              <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[78%] rounded-lg px-3 py-2 text-[13px] leading-[1.55] ${
                    m.mine
                      ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                      : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]'
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-3">
            <div className="flex h-9 flex-1 items-center rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-3 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
              메시지를 입력하세요…
            </div>
            <span
              data-demo-cursor
              className="grid h-9 w-9 place-items-center rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
            >
              ↑
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
