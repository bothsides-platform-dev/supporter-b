'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import { CheckIcon } from '@/components/icons';
import { Chip } from '@/components/primitives/Chip';

type Step = { n: number; title: string; desc: string };
type Field = { label: string; value: string; mono?: boolean };

const STEPS: Step[] = [
  { n: 1, title: '사업자 정보 확인', desc: 'PG사 견적 제안을 받기 위해 기본적인 사업자 정보를 입력해주세요.' },
  { n: 2, title: '견적 내용 입력', desc: 'PG사 견적을 받기 위한 기본 정보를 입력해주세요.' },
  { n: 3, title: 'PG 선택', desc: '견적을 받고 싶은 PG사를 선택해주세요.' },
  { n: 4, title: '최종 견적 요청 정보 확인', desc: '입력한 정보를 확인한 뒤 견적 요청을 제출합니다.' },
  { n: 5, title: 'PG사 비교 견적', desc: '다수의 PG사의 견적을 비교하고 추가 협의를 진행합니다.' },
  { n: 6, title: '최종 PG사 선정', desc: '최종 견적을 협의하고 계약을 진행합니다.' },
];

const STEP1_FIELDS: Field[] = [
  { label: '상호명', value: '(주)서포터비' },
  { label: '사업자번호', value: '123-45-67890', mono: true },
  { label: '과세유형', value: '일반과세자' },
  { label: '사업자 상태', value: '계속사업자' },
];
const STEP2_FIELDS: Field[] = [
  { label: '월 거래액', value: '2.4억 원', mono: true },
  { label: '평균 결제수단', value: '카드 · 간편결제' },
  { label: '주요 매출 채널', value: '자사몰' },
  { label: '희망 정산주기', value: 'D+1', mono: true },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// 예시 view를 실제 사용자가 입력하는 것처럼 연출하기 위한 훅들.
// `play`(뷰에 들어옴) 전에는 초기 상태, 동작 줄이기/SSR/테스트에서는 즉시 최종 상태.

// 폼 필드를 위에서부터 한 칸씩 타이핑한다.
function useTypedFields(fields: Field[], play: boolean) {
  const [typed, setTyped] = useState<string[]>(() => fields.map(() => ''));
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    // 탭 전환 시 ProcessMock 이 key 로 remount 되며 typed/activeIdx 는 초기값으로
    // 리셋되므로, 이펙트 본문에서 동기 리셋이 필요 없다(동기 setState 회피).
    if (!play) return;
    if (prefersReducedMotion()) {
      /* eslint-disable react-hooks/set-state-in-effect -- 동작 줄이기: 1회 즉시 채움(이펙트는 클라이언트 전용) */
      setTyped(fields.map((f) => f.value));
      setActiveIdx(-1);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const CHAR_MS = 78;
    const FIELD_GAP_MS = 320;
    let fi = 0;
    let ci = 0;
    let timer = 0;
    const step = () => {
      if (fi >= fields.length) return;
      const value = fields[fi].value;
      ci += 1;
      // setTyped 업데이터는 지연 실행(다음 렌더)된다. 그 안에서 클로저 fi/ci 를 직접
      // 읽으면 아래에서 증가시킨 값을 읽어 범위를 벗어난다 → 호출 시점 값을 캡처해 사용.
      const fieldIdx = fi;
      const charCount = ci;
      setTyped((prev) => {
        const next = [...prev];
        next[fieldIdx] = value.slice(0, charCount);
        return next;
      });
      if (ci >= value.length) {
        fi += 1;
        ci = 0;
        if (fi >= fields.length) {
          setActiveIdx(-1);
          return;
        }
        setActiveIdx(fi);
        timer = window.setTimeout(step, FIELD_GAP_MS);
      } else {
        timer = window.setTimeout(step, CHAR_MS);
      }
    };
    timer = window.setTimeout(step, FIELD_GAP_MS);
    return () => window.clearTimeout(timer);
  }, [fields, play]);

  return { typed, activeIdx };
}

// 0 → total 로 항목을 하나씩 드러낸다(칩 선택·응답 도착·행 노출 공용).
function useRevealCount(total: number, intervalMs: number, play: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!play) return;
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 동작 줄이기: 1회 즉시 채움
      setN(total);
      return;
    }
    let c = 0;
    const id = window.setInterval(() => {
      c += 1;
      setN(c);
      if (c >= total) window.clearInterval(id);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [total, intervalMs, play]);
  return n;
}

const AUTO_ADVANCE_MS = 5000;

export function ProcessSection() {
  const [active, setActive] = useState(1);
  const [autoOn, setAutoOn] = useState(true);
  const step = STEPS[active - 1];

  const detailRef = useRef<HTMLDivElement>(null);
  const inView = useInView(detailRef, { once: true, amount: 0.3 });

  // 화면에 들어오면 단계가 자동으로 순환되어 "눌러서 넘기는 탭"임을 자연스럽게 알린다.
  // 사용자가 한 번이라도 직접 누르면 자동 전환을 멈추고 제어권을 넘긴다.
  useEffect(() => {
    if (!inView || !autoOn || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setActive((a) => (a % STEPS.length) + 1);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [inView, autoOn]);

  function selectStep(n: number) {
    setActive(n);
    setAutoOn(false);
  }

  return (
    <div className="flex flex-col gap-[var(--s-8)]">
      {/* ── Stepper: clickable tabs with uniform bordered boxes ── */}
      <div className="flex flex-col gap-[var(--s-3)]">
        <ol className="flex flex-col md:flex-row md:items-stretch gap-[var(--s-2)]">
          {STEPS.map((s) => {
            const isActive = s.n === active;
            const isDone = s.n < active;
            return (
              <li key={s.n} className="flex-1 flex">
                <button
                  type="button"
                  onClick={() => selectStep(s.n)}
                  aria-current={isActive ? 'step' : undefined}
                  className={[
                    'group relative w-full overflow-hidden flex items-center gap-3 rounded-md border px-3 py-2.5 text-left cursor-pointer transition-colors duration-[140ms]',
                    isActive
                      ? 'border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-high)]'
                      : 'border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-low)] hover:border-[var(--md-sys-color-outline)]',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className={[
                      'shrink-0 grid place-items-center h-6 w-6 rounded-full text-[var(--text-2xs)] md-numeric',
                      isActive
                        ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
                        : isDone
                          ? 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)]'
                          : 'border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]',
                    ].join(' ')}
                  >
                    {isDone ? <CheckIcon size={13} /> : pad(s.n)}
                  </span>
                  <span
                    className={[
                      'text-[var(--text-sm)] tracking-[-0.006em] leading-tight',
                      isActive
                        ? 'text-[var(--md-sys-color-on-surface)] font-medium'
                        : 'text-[var(--md-sys-color-on-surface-variant)]',
                    ].join(' ')}
                  >
                    {s.title}
                  </span>
                  {isActive && autoOn && (
                    <span
                      key={active}
                      aria-hidden
                      className="process-progress absolute bottom-0 left-0 right-0 h-0.5 origin-left bg-[var(--md-sys-color-primary)]"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
        <span className="inline-flex items-center gap-1.5 font-mono text-[var(--text-2xs)] tracking-[0.08em] uppercase text-[var(--md-sys-color-outline)]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 11V6a2 2 0 0 1 4 0v5" />
            <path d="M13 7a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-2-3a1.5 1.5 0 0 1 2.6-1.6L7 13" />
          </svg>
          단계를 눌러 직접 살펴보세요
        </span>
      </div>

      {/* ── Detail: static description + animated example view (stable height) ── */}
      <div
        ref={detailRef}
        className="grid grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr] gap-[var(--s-7)] md:gap-[var(--s-9)] items-start"
      >
        <div className="flex flex-col gap-[var(--s-4)]">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-outline)]">
            STEP {pad(step.n)} / {pad(STEPS.length)}
          </span>
          <h3 className="text-[clamp(20px,2.4vw,28px)] leading-[1.15] tracking-[-0.02em] font-medium text-[var(--md-sys-color-on-surface)]">
            {step.title}
          </h3>
          <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)] min-h-[5.1em]">
            {step.desc}
          </p>
        </div>

        <motion.div
          key={`mock-${active}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          <ProcessMock step={active} play={inView} />
        </motion.div>
      </div>
    </div>
  );
}

/* ── Animated product mocks — 실제 입력처럼 보이는 예시 view.
   모든 카드는 동일한 min-height로 고정해 탭 전환 시 레이아웃 점프를 없앤다. */

function MockCard({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="min-h-[260px] rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] overflow-hidden">
      <div className="flex items-center justify-between px-[var(--s-5)] py-[var(--s-3)] border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
        <span className="font-mono text-[var(--text-2xs)] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
          {caption}
        </span>
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
          <span className="h-2 w-2 rounded-full bg-[var(--md-sys-color-outline-variant)]" />
        </span>
      </div>
      <div className="p-[var(--s-5)]">{children}</div>
    </div>
  );
}

function AnimatedForm({ caption, fields, play }: { caption: string; fields: Field[]; play: boolean }) {
  const { typed, activeIdx } = useTypedFields(fields, play);
  return (
    <MockCard caption={caption}>
      <div className="grid grid-cols-2 gap-[var(--s-4)]">
        {fields.map((f, i) => (
          <div key={f.label} className="flex flex-col gap-1.5">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              {f.label}
            </span>
            <div
              className={[
                'h-9 flex items-center px-3 rounded-md border bg-[var(--md-sys-color-surface)] transition-colors duration-150',
                i === activeIdx
                  ? 'border-[var(--md-sys-color-primary)]'
                  : 'border-[var(--md-sys-color-outline-variant)]',
              ].join(' ')}
            >
              <span className={`text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] ${f.mono ? 'md-numeric' : ''}`}>
                {typed[i]}
              </span>
              {i === activeIdx && (
                <span aria-hidden className="ml-px h-4 w-px bg-[var(--md-sys-color-primary)] blink-cursor" />
              )}
            </div>
          </div>
        ))}
      </div>
    </MockCard>
  );
}

const STEP3_CHIPS = ['PG A', 'PG B', 'PG C', 'PG D'];

function AnimatedSelect({ play }: { play: boolean }) {
  const selected = useRevealCount(2, 520, play);
  return (
    <MockCard caption="새 견적 요청 · PG 선택">
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex flex-wrap gap-2">
          {STEP3_CHIPS.map((c, i) => (
            <Chip key={c} label={c} color={i < selected ? 'primary' : 'surface'} />
          ))}
        </div>
        <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
          {selected}개 선택됨
        </span>
      </div>
    </MockCard>
  );
}

const STEP4_ROWS: [string, string][] = [
  ['상호명', '(주)서포터비'],
  ['월 거래액', '2.4억 원'],
  ['선택 PG', '2곳 (PG A, PG B)'],
  ['희망 정산주기', 'D+1'],
];

function AnimatedConfirm({ play }: { play: boolean }) {
  const shown = useRevealCount(STEP4_ROWS.length, 300, play);
  return (
    <MockCard caption="새 견적 요청 · 보내기 확인">
      <dl className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)]">
        {STEP4_ROWS.map(([k, v], i) => (
          <div
            key={k}
            className="flex items-center justify-between py-2.5 transition-opacity duration-300"
            style={{ opacity: i < shown ? 1 : 0 }}
          >
            <dt className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{k}</dt>
            <dd className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] md-numeric">{v}</dd>
          </div>
        ))}
      </dl>
    </MockCard>
  );
}

const STEP5_ROWS = [
  { pg: 'PG A', fee: '1.85%', settle: 'D+1', best: true },
  { pg: 'PG B', fee: '1.95%', settle: 'D+1', best: false },
  { pg: 'PG C', fee: '2.10%', settle: 'D+2', best: false },
];

function AnimatedCompare({ play }: { play: boolean }) {
  const arrived = useRevealCount(STEP5_ROWS.length, 640, play);
  return (
    <MockCard caption="견적 비교">
      <div className="flex flex-col">
        {STEP5_ROWS.map((r, i) => {
          const shown = i < arrived;
          return (
            <div
              key={r.pg}
              className={[
                'flex items-center justify-between py-2.5 px-3 rounded-md transition-colors duration-300',
                shown && r.best ? 'bg-[var(--md-sys-color-tertiary-container)]/40' : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-2 text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">
                {r.pg}
                {shown && r.best && <Chip label="최저" color="tertiary" />}
              </span>
              {shown ? (
                <span className="flex items-center gap-4">
                  <span className="md-numeric text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">{r.fee}</span>
                  <span className="md-numeric text-[var(--text-2xs)] text-[var(--md-sys-color-on-surface-variant)]">{r.settle}</span>
                </span>
              ) : (
                <span className="font-mono text-[var(--text-2xs)] tracking-[0.08em] text-[var(--md-sys-color-outline)]">
                  응답 대기…
                </span>
              )}
            </div>
          );
        })}
      </div>
    </MockCard>
  );
}

function AnimatedAward({ play }: { play: boolean }) {
  const shown = useRevealCount(2, 360, play);
  return (
    <MockCard caption="최종 선정">
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-base)] font-medium text-[var(--md-sys-color-on-surface)]">PG A</span>
          {shown >= 1 && <Chip label="계약 진행" color="tertiary" />}
        </div>
        <div
          className="flex items-center gap-[var(--s-6)] transition-opacity duration-300"
          style={{ opacity: shown >= 2 ? 1 : 0 }}
        >
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">최종 수수료</span>
            <span className="md-numeric text-[var(--text-xl)] text-[var(--md-sys-color-on-surface)]">1.85%</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">정산주기</span>
            <span className="md-numeric text-[var(--text-xl)] text-[var(--md-sys-color-on-surface)]">D+1</span>
          </div>
        </div>
      </div>
    </MockCard>
  );
}

function ProcessMock({ step, play }: { step: number; play: boolean }) {
  switch (step) {
    case 1:
      return <AnimatedForm caption="새 견적 요청 · 사업자 정보" fields={STEP1_FIELDS} play={play} />;
    case 2:
      return <AnimatedForm caption="새 견적 요청 · 견적 내용" fields={STEP2_FIELDS} play={play} />;
    case 3:
      return <AnimatedSelect play={play} />;
    case 4:
      return <AnimatedConfirm play={play} />;
    case 5:
      return <AnimatedCompare play={play} />;
    default:
      return <AnimatedAward play={play} />;
  }
}
