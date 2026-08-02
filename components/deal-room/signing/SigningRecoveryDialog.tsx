'use client';

/**
 * SigningRecoveryDialog — "보낸 계약서 찾기".
 *
 * 임베드에서 발송을 마쳤는데 완료 신호가 유실되면 계약은 실제로 나갔는데(양측에 서명
 * 메일이 갔다) 딜룸은 대기에 갇힌다. 그 PG 에게 필요한 건 두 번째 계약이 아니라 이미
 * 보낸 것을 찾아 잇는 길이다.
 *
 * **고르는 건 사람이다.** 서버의 상관키(참여자 이메일)는 휴리스틱이라 기계가 틀리면
 * 남의 계약이 이 딜룸에 붙는다. 그래서 이 화면은 후보를 보여줄 뿐 자동으로 채택하지
 * 않는다. 서버가 이미 이 딜의 것만 남겨 보내므로 목록에 남의 계약은 없다.
 *
 * 스캔·연결은 부모가 주입한다(서버 액션 배선은 SigningTab 이 소유) — 이 컴포넌트는
 * 상태 전이와 문구만 책임진다.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/primitives/Button';
import { LocalTime } from '@/components/primitives/LocalTime';
import { signingErrorMessage } from '@/lib/signing/error-messages';
import type { SigningRecoveryCandidate } from '@/lib/types/signing';

type ScanResult =
  | { ok: true; candidates: SigningRecoveryCandidate[]; truncated: boolean }
  | { ok: false; error: string };

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function SigningRecoveryDialog({
  open,
  onOpenChange,
  scan,
  confirm,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scan: () => Promise<ScanResult>;
  /** 고른 계약을 이 딜에 연결한다. 실패 코드는 화면이 분기한다. */
  confirm: (providerContractId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onLinked?: () => void;
}) {
  const [phase, setPhase] = useState<'scanning' | 'done' | 'failed'>('scanning');
  const [candidates, setCandidates] = useState<SigningRecoveryCandidate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 결과 반영은 한 곳에서 — 최초 스캔(effect)과 다시 확인(클릭)이 같은 전이를 쓴다.
  const applyResult = useCallback((r: ScanResult) => {
    if (!r.ok) {
      setError(signingErrorMessage(r.error, '보낸 계약서를 확인하지 못했어요'));
      setPhase('failed');
      return;
    }
    setCandidates(r.candidates);
    setTruncated(r.truncated);
    // 하나뿐이면 미리 골라 둔다 — 라디오를 누르게 할 이유가 없다.
    setSelected(r.candidates.length === 1 ? (r.candidates[0]?.providerContractId ?? null) : null);
    setPhase('done');
  }, []);

  // 마운트 시 한 번 훑는다. 초기 상태가 이미 'scanning' 이라 effect 안에서 상태를
  // 먼저 만질 필요가 없다(그러면 cascading render 가 된다).
  useEffect(() => {
    let alive = true;
    void scan().then((r) => {
      if (alive) applyResult(r);
    });
    return () => {
      alive = false;
    };
  }, [scan, applyResult]);

  function rescan() {
    setPhase('scanning');
    setError(null);
    void scan().then(applyResult);
  }

  async function handleConfirm() {
    // `submitting` 재확인은 두지 않는다 — 유일한 트리거인 버튼이 그동안 disabled 라
    // 어떤 변이로도 실패시킬 수 없는 도달 불가 코드였다(리렌더 전 연타도 disabled 가
    // 먼저 막는다). 중복 요청을 막는 건 아래 disabled 이고, 테스트가 그걸 고정한다.
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await confirm(selected);
      if (r.ok) {
        onLinked?.();
        onOpenChange(false);
        return;
      }
      // 이 후보만 못 쓰게 된 경우는 열어 둔다 — 닫으면 스캔을 처음부터 다시 해야 한다.
      if (r.error === 'PROVIDER_CONTRACT_TAKEN' || r.error === 'CONTRACT_NOT_SENT') {
        setCandidates((prev) => prev.filter((c) => c.providerContractId !== selected));
        setSelected(null);
        setError(signingErrorMessage(r.error, '이 계약서는 연결할 수 없어요'));
        return;
      }
      // 그 밖(ALREADY_SENT·CONTRACT_CHANGED·권한 등)은 이 화면이 더 할 일이 없다.
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const many = candidates.length > 1;
  const title =
    phase === 'scanning'
      ? '보낸 계약서를 찾고 있어요'
      : candidates.length === 0
        ? '보낸 계약서를 찾지 못했어요'
        : many
          ? '어떤 계약서를 연결할까요?'
          : '이 계약서를 연결할까요?';

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {phase === 'scanning'
              ? '스노우싸인에서 이 딜로 보낸 계약서를 확인하고 있어요. 잠시만 기다려요.'
              : candidates.length === 0
                ? "구매사 담당자와 이 딜의 담당자가 모두 수신자로 들어간 계약서만 찾아요. 아직 발송을 마치지 않았다면 '계약서 올리기'로 이어서 보내면 돼요."
                : many
                  ? '구매사 담당자와 이 딜의 담당자가 모두 수신자로 들어간 계약서예요. 이 딜로 보낸 것을 하나만 골라요.'
                  : '연결하면 딜룸이 서명 진행 중으로 바뀌고 양측에 알림이 가요.'}
          </DialogDescription>
        </DialogHeader>

        {candidates.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="sr-only">보낸 계약서 후보</legend>
            {candidates.map((c) => (
              <label
                key={c.providerContractId}
                className="flex cursor-pointer items-start gap-2.5 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-2.5 text-[13px] hover:bg-[var(--md-sys-color-surface-container)]"
              >
                <input
                  type="radio"
                  name="signing-recovery-candidate"
                  className="mt-0.5"
                  aria-label={c.title}
                  checked={selected === c.providerContractId}
                  onChange={() => setSelected(c.providerContractId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{c.title}</span>
                  <span className={'mt-0.5 block text-[12.5px] ' + dim}>
                    {c.sentAt ? (
                      <>
                        <LocalTime iso={c.sentAt} />에 보냈어요
                      </>
                    ) : c.createdAt ? (
                      <>
                        <LocalTime iso={c.createdAt} />에 만들었어요
                      </>
                    ) : null}
                    {' · '}수신자 {c.participantCount}명
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {truncated && (
          <p className={'text-[12.5px] ' + dim}>
            계약이 많아 최근 것부터 확인했어요. 찾는 계약서가 없으면 다시 확인해요.
          </p>
        )}

        {error && (
          <p role="alert" className="md-label-small text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outlined"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            닫기
          </Button>
          {truncated && (
            <Button variant="text" size="sm" onClick={rescan} disabled={submitting}>
              다시 확인해요
            </Button>
          )}
          {candidates.length > 0 && (
            <Button size="sm" onClick={() => void handleConfirm()} disabled={!selected || submitting}>
              {submitting ? 'LOADING…' : '이 계약서로 연결해요'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
