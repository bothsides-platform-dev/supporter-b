'use client';

import { useEffect, useState } from 'react';
import { Chip } from '@/components/primitives/Chip';
import { verifyContractDocAction } from '@/lib/server/actions/contract';

export type IntegrityBadgeProps = { docId: string };

type VerifyState = 'checking' | 'intact' | 'failed';

/** completed 문서 전용 — 마운트 시 base(완료본) PDF SHA-256 을 재계산해 위변조 여부를 배지로 표시. */
export function IntegrityBadge({ docId }: IntegrityBadgeProps) {
  const [state, setState] = useState<VerifyState>('checking');

  const runCheck = () => {
    setState('checking');
    void verifyContractDocAction({ docId }).then((r) => {
      setState(r.ok && r.intact ? 'intact' : 'failed');
    });
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/문서 전환 시 1회 자동 검증(로딩→결과)을 트리거하는 의도된 동기화.
  useEffect(runCheck, [docId]);

  if (state === 'checking') {
    return (
      <span
        aria-hidden
        className="inline-block h-6 w-24 animate-pulse rounded-[var(--md-sys-shape-extra-small)] bg-[var(--md-sys-color-surface-container-high)]"
      />
    );
  }

  if (state === 'intact') {
    return <Chip color="tertiary" label="위변조 없음" />;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Chip color="error" label="검증 실패" />
      <button
        type="button"
        onClick={runCheck}
        className="text-[12px] text-[var(--md-sys-color-primary)] hover:underline"
      >
        다시 확인
      </button>
    </span>
  );
}
