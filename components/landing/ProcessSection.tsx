'use client';

import { useState, type ReactNode } from 'react';
import { CheckIcon } from '@/components/icons';
import { Chip } from '@/components/primitives/Chip';

type Step = {
  n: number;
  title: string;
  desc: string;
};

const STEPS: Step[] = [
  { n: 1, title: '사업자 정보 확인', desc: 'PG사 견적 제안을 받기 위해 기본적인 사업자 정보를 입력해주세요.' },
  { n: 2, title: '견적 내용 입력', desc: 'PG사 견적을 받기 위한 기본 정보를 입력해주세요.' },
  { n: 3, title: 'PG 선택', desc: '견적을 받고 싶은 PG사를 선택해주세요.' },
  { n: 4, title: '최종 견적 요청 정보 확인', desc: '입력한 정보를 확인한 뒤 견적 요청을 제출합니다.' },
  { n: 5, title: 'PG사 비교 견적', desc: '다수의 PG사의 견적을 비교하고 추가 협의를 진행합니다.' },
  { n: 6, title: '최종 PG사 선정', desc: '최종 견적을 협의하고 계약을 진행합니다.' },
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function ProcessSection() {
  const [active, setActive] = useState(1);
  const step = STEPS[active - 1];

  return (
    <div className="flex flex-col gap-[var(--s-8)]">
      {/* ── Stepper: vertical (mobile) / horizontal (desktop) ── */}
      <ol className="flex flex-col md:flex-row md:items-stretch gap-[var(--s-2)] md:gap-0">
        {STEPS.map((s) => {
          const isActive = s.n === active;
          const isDone = s.n < active;
          return (
            <li key={s.n} className="flex-1 flex items-center gap-2 md:flex-col md:items-start md:gap-0">
              <button
                type="button"
                onClick={() => setActive(s.n)}
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'group w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-[140ms]',
                  isActive
                    ? 'bg-[var(--md-sys-color-surface-container-high)]'
                    : 'hover:bg-[var(--md-sys-color-surface-container-low)]',
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
              </button>
            </li>
          );
        })}
      </ol>

      {/* ── Detail: description + product mock ── */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,360px)_1fr] gap-[var(--s-7)] md:gap-[var(--s-9)] items-start">
        <div className="flex flex-col gap-[var(--s-4)]">
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.18em] uppercase text-[var(--md-sys-color-outline)]">
            STEP {pad(step.n)} / {pad(STEPS.length)}
          </span>
          <h3 className="text-[clamp(20px,2.4vw,28px)] leading-[1.15] tracking-[-0.02em] font-medium text-[var(--md-sys-color-on-surface)]">
            {step.title}
          </h3>
          <p className="text-[var(--text-md)] leading-[1.68] tracking-[-0.006em] text-[var(--md-sys-color-on-surface-variant)]">
            {step.desc}
          </p>
        </div>

        <ProcessMock step={active} />
      </div>
    </div>
  );
}

/* ── Static product mocks per step (non-interactive previews) ── */

function MockCard({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] overflow-hidden">
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

function MockField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[var(--text-2xs)] tracking-[0.12em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </span>
      <div className="h-9 flex items-center px-3 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)]">
        <span className={`text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] ${mono ? 'md-numeric' : ''}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

function ProcessMock({ step }: { step: number }) {
  if (step === 1) {
    return (
      <MockCard caption="새 견적 요청 · 사업자 정보">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-4)]">
          <MockField label="상호명" value="(주)서포터비" />
          <MockField label="사업자번호" value="123-45-67890" mono />
          <MockField label="과세유형" value="일반과세자" />
          <MockField label="사업자 상태" value="계속사업자" />
        </div>
      </MockCard>
    );
  }
  if (step === 2) {
    return (
      <MockCard caption="새 견적 요청 · 견적 내용">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-4)]">
          <MockField label="월 거래액" value="2.4억 원" mono />
          <MockField label="평균 결제수단" value="카드 · 간편결제" />
          <MockField label="주요 매출 채널" value="자사몰" />
          <MockField label="희망 정산주기" value="D+1" mono />
        </div>
      </MockCard>
    );
  }
  if (step === 3) {
    return (
      <MockCard caption="새 견적 요청 · PG 선택">
        <div className="flex flex-col gap-[var(--s-4)]">
          <div className="flex flex-wrap gap-2">
            <Chip label="PG A" color="primary" />
            <Chip label="PG B" color="primary" />
            <Chip label="PG C" color="surface" />
            <Chip label="PG D" color="surface" />
          </div>
          <span className="font-mono text-[var(--text-2xs)] tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
            2개 선택됨
          </span>
        </div>
      </MockCard>
    );
  }
  if (step === 4) {
    return (
      <MockCard caption="새 견적 요청 · 보내기 확인">
        <dl className="flex flex-col divide-y divide-[var(--md-sys-color-outline-variant)]">
          {[
            ['상호명', '(주)서포터비'],
            ['월 거래액', '2.4억 원'],
            ['선택 PG', '2곳 (PG A, PG B)'],
            ['희망 정산주기', 'D+1'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5">
              <dt className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface-variant)]">{k}</dt>
              <dd className="text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)] md-numeric">{v}</dd>
            </div>
          ))}
        </dl>
      </MockCard>
    );
  }
  if (step === 5) {
    return (
      <MockCard caption="견적 비교">
        <div className="flex flex-col">
          {[
            { pg: 'PG A', fee: '1.85%', settle: 'D+1', best: true },
            { pg: 'PG B', fee: '1.95%', settle: 'D+1' },
            { pg: 'PG C', fee: '2.10%', settle: 'D+2' },
          ].map((r) => (
            <div
              key={r.pg}
              className={[
                'flex items-center justify-between py-2.5 px-3 rounded-md',
                r.best ? 'bg-[var(--md-sys-color-tertiary-container)]/40' : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-2 text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">
                {r.pg}
                {r.best && <Chip label="최저" color="tertiary" />}
              </span>
              <span className="flex items-center gap-4">
                <span className="md-numeric text-[var(--text-sm)] text-[var(--md-sys-color-on-surface)]">{r.fee}</span>
                <span className="md-numeric text-[var(--text-2xs)] text-[var(--md-sys-color-on-surface-variant)]">{r.settle}</span>
              </span>
            </div>
          ))}
        </div>
      </MockCard>
    );
  }
  return (
    <MockCard caption="최종 선정">
      <div className="flex flex-col gap-[var(--s-4)]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--text-base)] font-medium text-[var(--md-sys-color-on-surface)]">PG A</span>
          <Chip label="계약 진행" color="tertiary" />
        </div>
        <div className="flex items-center gap-[var(--s-6)]">
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
