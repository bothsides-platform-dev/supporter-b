'use client';

/**
 * SigningTimeline — 세로 서명 타임라인(표시 전용).
 *
 * 노드는 항상 `시작 → 사람/단계 → 사람/단계 → 종결` 4개. 마일스톤은 10px 점,
 * 사람은 28px 이니셜 디스크로 그려 "사람이 본체"라는 위계를 크기로 드러낸다.
 * 완료 구간의 연결선은 실선, 대기 구간은 점선.
 */
import { Chip } from '@/components/primitives/Chip';
import { LocalTime } from '@/components/primitives/LocalTime';
import { nodeStatusLabel, type SigningNode } from './signing-view-model';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

const discClass: Record<SigningNode['state'], string> = {
  done: 'bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]',
  active:
    'text-[var(--md-sys-color-on-surface-variant)] shadow-[inset_0_0_0_1.5px_var(--md-sys-color-primary)]',
  pending:
    'text-[var(--md-sys-color-on-surface-variant)] shadow-[inset_0_0_0_1.5px_var(--md-sys-color-outline)]',
  failed: 'bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]',
  ended:
    'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]',
};

// ended(취소)는 일어난 일이므로 pending 의 빈 링이 아니라 중립색으로 채운다.
const markClass: Record<SigningNode['state'], string> = {
  done: 'bg-[var(--md-sys-color-tertiary)]',
  active: 'bg-[var(--md-sys-color-warning)]',
  pending: 'shadow-[inset_0_0_0_1.5px_var(--md-sys-color-outline)]',
  failed: 'bg-[var(--md-sys-color-error)]',
  ended: 'bg-[var(--md-sys-color-outline)]',
};

export function SigningTimeline({ nodes }: { nodes: SigningNode[] }) {
  return (
    <ol className="px-4 pt-1.5 pb-2.5">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        const connected = n.state === 'done';
        return (
          <li key={n.key} className="flex min-h-[38px] gap-3">
            <div className="flex w-7 flex-none flex-col items-center">
              {n.kind === 'person' ? (
                <span
                  aria-hidden
                  className={
                    'mt-0.5 grid size-7 flex-none place-items-center rounded-full text-[11.5px] font-semibold ' +
                    discClass[n.state]
                  }
                >
                  {n.initial}
                </span>
              ) : (
                <span
                  aria-hidden
                  className={'mt-[9px] size-2.5 flex-none rounded-full ' + markClass[n.state]}
                />
              )}
              {!last && (
                <span
                  aria-hidden
                  className={
                    'my-[3px] w-0 flex-1 border-l-[1.5px] ' +
                    (connected
                      ? 'border-solid border-[var(--md-sys-color-tertiary)]'
                      : 'border-dotted border-[var(--md-sys-color-outline)]')
                  }
                />
              )}
            </div>
            <div className="flex flex-1 items-start gap-2.5 pt-1.5 pb-2.5">
              <div className="min-w-0 flex-1">
                <div
                  className={
                    'text-[13px] ' +
                    (n.kind === 'person' || n.state !== 'pending'
                      ? 'font-medium'
                      : 'font-normal ' + dim)
                  }
                >
                  {n.label}
                  {n.kind === 'person' && n.detail && (
                    <span className={'font-normal ' + dim}> · {n.detail}</span>
                  )}
                </div>
                {n.kind === 'milestone' && n.detail && (
                  <div className={'mt-px text-[12px] ' + dim}>{n.detail}</div>
                )}
                {n.sub && <div className={'mt-px truncate text-[12px] ' + dim}>{n.sub}</div>}
              </div>
              <div className="flex flex-none flex-col items-end gap-1">
                {/* 점·디스크는 aria-hidden 이라 Chip 이 없는 노드(마일스톤)는 상태가
                    색으로만 전달된다 — 상태어를 sr-only 로 보완한다. */}
                {n.chip ? (
                  <Chip color={n.chip.color} label={n.chip.label} />
                ) : (
                  <span className="sr-only">{nodeStatusLabel(n.state)}</span>
                )}
                {n.at && (
                  <span className={'md-numeric text-[11.5px] ' + dim}>
                    <LocalTime iso={n.at} format="MM-dd HH:mm" />
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
