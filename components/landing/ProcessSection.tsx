'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { motion, useInView } from 'motion/react';
import { CheckIcon } from '@/components/icons';
import { Chip } from '@/components/primitives/Chip';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';

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

// 실제 제품 화면(새 견적 요청 마법사 · 딜룸)을 충실히 재현하기 위한 고정 데이터.
const BIZ_ROWS: [string, string][] = [
  ['상호명', '노온'],
  ['사업자번호', '205-88-01505'],
  ['과세 유형', '일반과세'],
  ['사업자 상태', '정상'],
];

const STEP2_FIELDS: Field[] = [
  { label: '제목', value: '2026 결제 인프라 견적 요청' },
  { label: '주요 판매 상품', value: '의류' },
  { label: '전년도 연간 거래액', value: '10억 원', mono: true },
  { label: '현재 카드 수수료', value: '3.4 %', mono: true },
];

const PG_OPTIONS = ['KG이니시스', 'NHN KCP', '헥토파이낸셜', '다날', 'KICC(이지페이)', '나이스페이먼츠', '토스페이먼츠'];
const PG_SELECTED = ['KG이니시스', '나이스페이먼츠', '토스페이먼츠'];

const SUMMARY_ROWS: [string, string][] = [
  ['상호명', '노온'],
  ['사업자번호', '205-88-01505'],
  ['제목', '2026 결제 인프라 견적 요청'],
];

// 딜룸 "지금 조건보다 이만큼 좋아져요" diff — before → after.
type DiffRow = { label: string; from: string; to: string; delta: string; dir: 'up' | 'down' | 'same' };
const DIFF_ROWS: DiffRow[] = [
  { label: '정산주기', from: 'D+1', to: 'D+1', delta: '같음', dir: 'same' },
  { label: '월 정산한도', from: '1원', to: '10,000,000원', delta: '↑ 9,999,999원', dir: 'up' },
  { label: '보증보험', from: '1원', to: '0원', delta: '↓ 1원', dir: 'down' },
];

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function pad(n: number): string {
  return n.toString().padStart(2, '0');
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

function MockCard({ caption, footer, children }: { caption: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-[300px] flex flex-col rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] overflow-hidden">
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
      <div className="flex-1 p-[var(--s-5)]">{children}</div>
      {footer && (
        <div className="flex items-center justify-end gap-2 px-[var(--s-5)] py-[var(--s-3)] border-t border-[var(--md-sys-color-outline-variant)]">
          {footer}
        </div>
      )}
    </div>
  );
}

// 비대화형 장식 버튼 — 실제 제품 버튼처럼 보이되 포커스/클릭 대상은 아니다.
function MockButton({ children, variant = 'primary' }: { children: ReactNode; variant?: 'primary' | 'ghost' }) {
  const cls =
    variant === 'primary'
      ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
      : 'border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]';
  return (
    <span
      aria-hidden
      className={`inline-flex items-center h-8 px-3.5 rounded-md text-[var(--text-xs)] font-medium tracking-[-0.006em] ${cls}`}
    >
      {children}
    </span>
  );
}

function MockCheck({ label, desc }: { label: string; desc?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden className="mt-0.5 grid place-items-center h-[18px] w-[18px] rounded-[5px] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]">
        <CheckIcon size={12} />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">{label}</span>
        {desc && <span className="text-[var(--text-2xs)] leading-snug text-[var(--md-sys-color-on-surface-variant)]">{desc}</span>}
      </div>
    </div>
  );
}

// 1 — 사업자 확인: 워크스페이스에 등록된 사업자를 읽기 전용으로 확인하는 표.
function BizConfirmMock({ play }: { play: boolean }) {
  const shown = useRevealCount(BIZ_ROWS.length, 220, play);
  return (
    <MockCard caption="새 견적 요청 · 사업자 확인" footer={<MockButton>다음</MockButton>}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            WORKSPACE — 등록된 사업자
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--md-sys-color-tertiary-container)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-sys-color-on-tertiary-container)]">
            <CheckIcon size={11} /> 확인됨
          </span>
        </div>
        <dl className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)]">
          {BIZ_ROWS.map(([k, v], i) => (
            <div
              key={k}
              className="flex items-center justify-between py-2.5 transition-opacity duration-300"
              style={{ opacity: i < shown ? 1 : 0 }}
            >
              <dt className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{k}</dt>
              <dd className={`text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] ${k === '사업자번호' ? 'md-numeric' : ''}`}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </MockCard>
  );
}

// 2 — 견적 내용: 위에서부터 한 칸씩 타이핑되는 입력 폼 + 수수료 공개 토글.
function QuoteFormMock({ play }: { play: boolean }) {
  const { typed, activeIdx } = useTypedFields(STEP2_FIELDS, play);
  return (
    <MockCard caption="새 견적 요청 · 견적 내용" footer={<><MockButton variant="ghost">이전</MockButton><MockButton>다음</MockButton></>}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            견적 유형
          </span>
          <div className="flex gap-2">
            <Chip label="신규 계약" color="primary" />
            <Chip label="갱신 계약" color="surface" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-[var(--s-4)]">
          {STEP2_FIELDS.map((f, i) => (
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
        <MockCheck label="현재 카드 수수료를 PG사에 공개하기" desc="PG사가 현재 수수료를 참고해 제안해요." />
      </div>
    </MockCard>
  );
}

// 3 — PG 선택: 초대할 PG사를 칩으로 고른다(일부가 차례로 선택됨).
function PgSelectMock({ play }: { play: boolean }) {
  const selected = useRevealCount(PG_SELECTED.length, 460, play);
  const isOn = (name: string) => {
    const idx = PG_SELECTED.indexOf(name);
    return idx > -1 && idx < selected;
  };
  return (
    <MockCard caption="새 견적 요청 · PG 선택" footer={<><MockButton variant="ghost">이전</MockButton><MockButton>다음</MockButton></>}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            PG사 선택
          </span>
          <span className="text-[var(--text-2xs)] text-[var(--md-sys-color-on-surface-variant)]">전체 선택</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {PG_OPTIONS.map((name) => (
            <Chip key={name} label={name} color={isOn(name) ? 'primary' : 'surface'} />
          ))}
        </div>
        <span className="text-[var(--text-2xs)] text-[var(--md-sys-color-primary)]">{selected}개 선택됨</span>
      </div>
    </MockCard>
  );
}

// 4 — 보내기 확인: 오픈 게시판 노출 토글 + 요약 + 초대할 PG사 목록.
function SendConfirmMock({ play }: { play: boolean }) {
  const shown = useRevealCount(SUMMARY_ROWS.length, 220, play);
  return (
    <MockCard caption="새 견적 요청 · 보내기 확인" footer={<><MockButton variant="ghost">이전</MockButton><MockButton>3개 PG사에 보내기</MockButton></>}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <MockCheck label="오픈 게시판에 노출하기" desc="다른 PG사가 이 견적 요청을 발견하고 참여를 요청할 수 있어요." />
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            견적 요청 요약
          </span>
          <dl className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)] rounded-md border border-[var(--md-sys-color-outline-variant)] px-3">
            {SUMMARY_ROWS.map(([k, v], i) => (
              <div
                key={k}
                className="flex items-center justify-between py-2 transition-opacity duration-300"
                style={{ opacity: i < shown ? 1 : 0 }}
              >
                <dt className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{k}</dt>
                <dd className={`text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] ${k === '사업자번호' ? 'md-numeric' : ''}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            초대할 PG사 (3개)
          </span>
          <ol className="flex flex-col gap-1">
            {PG_SELECTED.map((name, i) => (
              <li key={name} className="flex items-center gap-3 text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">
                <span className="md-numeric text-[var(--text-2xs)] text-[var(--md-sys-color-outline)]">{pad(i + 1)}</span>
                {name}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </MockCard>
  );
}

const COMPARE_PG_TABS = ['토스페이먼츠', 'NHN KCP', 'KG이니시스'];

function diffColor(dir: DiffRow['dir']): string {
  return dir === 'same'
    ? 'text-[var(--md-sys-color-on-surface-variant)]'
    : 'text-[var(--md-sys-color-tertiary)]';
}

// 5 — 견적 비교(딜룸): "지금 조건보다 이만큼 좋아져요" before→after diff.
function CompareMock({ play }: { play: boolean }) {
  const shown = useRevealCount(DIFF_ROWS.length, 420, play);
  return (
    <MockCard caption="딜룸 · 견적 비교" footer={<><MockButton variant="ghost">견적 재요청</MockButton><MockButton>이 견적 선정하기 →</MockButton></>}>
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex items-center gap-4 border-b border-[var(--md-sys-color-outline-variant)] pb-2">
          {COMPARE_PG_TABS.map((name) => {
            const active = name === 'KG이니시스';
            return (
              <span
                key={name}
                className={[
                  'text-[var(--text-sm)] pb-1.5 -mb-[9px] border-b-2',
                  active
                    ? 'text-[var(--md-sys-color-on-surface)] font-medium border-[var(--md-sys-color-primary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)] border-transparent',
                ].join(' ')}
              >
                {name}
              </span>
            );
          })}
        </div>
        <span className="text-[var(--text-2xs)] text-[var(--md-sys-color-on-surface-variant)]">지금 조건보다 이만큼 좋아져요</span>
        <div className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)]">
          {DIFF_ROWS.map((r, i) => (
            <div
              key={r.label}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-2.5 transition-opacity duration-300"
              style={{ opacity: i < shown ? 1 : 0 }}
            >
              <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{r.label}</span>
              <span className="flex items-center gap-2.5">
                <span className="md-numeric text-[var(--text-xs)] text-[var(--md-sys-color-outline)]">{r.from}</span>
                <span aria-hidden className="text-[var(--md-sys-color-outline)]">→</span>
                <span className="md-numeric text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] font-medium">{r.to}</span>
                <span className={`md-numeric text-[var(--text-2xs)] ${diffColor(r.dir)}`}>{r.delta}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockCard>
  );
}

// 6 — 최종 선정: 선정 완료 화면.
function AwardMock({ play }: { play: boolean }) {
  const shown = useRevealCount(DIFF_ROWS.length + 1, 240, play);
  return (
    <MockCard caption="딜룸 · 최종 선정" footer={<MockButton>KG이니시스와 메시지 시작 →</MockButton>}>
      <div className="flex flex-col items-center gap-[var(--s-4)] text-center">
        <span
          className="grid place-items-center h-12 w-12 rounded-full bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)] transition-opacity duration-300"
          style={{ opacity: shown >= 1 ? 1 : 0 }}
        >
          <CheckIcon size={24} />
        </span>
        <div className="flex flex-col gap-0.5">
          <span className="text-[var(--text-base)] font-medium text-[var(--md-sys-color-on-surface)]">KG이니시스를 선정했어요</span>
          <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">견적 요청이 마무리됐어요</span>
        </div>
        <div className="w-full flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)] text-left">
          {DIFF_ROWS.map((r, i) => (
            <div
              key={r.label}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 py-2 transition-opacity duration-300"
              style={{ opacity: i + 1 < shown ? 1 : 0 }}
            >
              <span className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{r.label}</span>
              <span className="flex items-center gap-2.5">
                <span className="md-numeric text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] font-medium">{r.to}</span>
                <span className={`md-numeric text-[var(--text-2xs)] ${diffColor(r.dir)}`}>{r.delta}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </MockCard>
  );
}

function ProcessMock({ step, play }: { step: number; play: boolean }) {
  switch (step) {
    case 1:
      return <BizConfirmMock play={play} />;
    case 2:
      return <QuoteFormMock play={play} />;
    case 3:
      return <PgSelectMock play={play} />;
    case 4:
      return <SendConfirmMock play={play} />;
    case 5:
      return <CompareMock play={play} />;
    default:
      return <AwardMock play={play} />;
  }
}
