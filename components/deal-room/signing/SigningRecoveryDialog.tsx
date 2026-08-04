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
import { useCallback, useEffect, useRef, useState } from 'react';

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
  /**
   * 후보를 훑는다. **뺏기 인자는 없다** — 스캔은 읽기이고, 동료의 작성물을 없애는
   * 이어받기는 임베드('계약서 올리기') 진입점이 소유한다.
   */
  scan: () => Promise<ScanResult>;
  /** 고른 계약을 이 딜에 연결한다. 실패 코드는 화면이 분기한다. */
  confirm: (providerContractId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onLinked?: () => void;
}) {
  // 'held' = 동료가 발송 리스를 쥐고 있어 스캔이 막힌 상태. 중첩 다이얼로그 대신
  // 같은 상태 기계의 한 단계로 둔다(오버레이·포커스 트랩이 둘이 되는 걸 피한다).
  const [phase, setPhase] = useState<'scanning' | 'done' | 'failed' | 'held'>('scanning');
  const [candidates, setCandidates] = useState<SigningRecoveryCandidate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 완료 고아는 연결 전에 한 번 더 묻는다. 중첩 다이얼로그 대신 같은 상태 기계의
  // 한 단계로 둔다(이 파일의 'held' 와 같은 관례 — 오버레이·포커스 트랩을 둘로 만들지 않는다).
  const [confirming, setConfirming] = useState(false);

  // 결과 반영은 한 곳에서 — 최초 스캔(effect)과 다시 확인(클릭)이 같은 전이를 쓴다.
  const applyResult = useCallback((r: ScanResult) => {
    if (!r.ok) {
      // 막힌 건 '실패'가 아니라 선택지다 — 여기서 이어받기를 제안한다. 자리를 비운
      // 탭은 하트비트로 리스를 무한 연장하므로, 안내만 하면 사용자가 할 게 없다.
      if (r.error === 'SEND_HELD_BY_TEAMMATE') {
        setError(null);
        setPhase('held');
        return;
      }
      // 제목이 이미 '보낸 계약서를 확인하지 못했어요' 다 — 같은 문장을 alert 로 한 번
      // 더 말하면 화면에 같은 글이 둘이 된다. 코드별 구체 문구가 있을 때만 덧붙인다.
      setError(signingErrorMessage(r.error, '') || null);
      setPhase('failed');
      return;
    }
    setCandidates(r.candidates);
    setTruncated(r.truncated);
    // 하나뿐이면 미리 골라 둔다 — 라디오를 누르게 할 이유가 없다. **단 완료 고아는
    // 예외**: 미리 골라 두면 아래 확인창이 형식이 된다(누르던 자리에서 바로 확인이 뜬다).
    const only = r.candidates.length === 1 ? r.candidates[0] : undefined;
    setSelected(only && !only.alreadyCompleted ? only.providerContractId : null);
    setPhase('done');
  }, []);

  // 부모(SigningTab)가 `scan` 을 JSX 인라인 화살표로 넘겨 **매 렌더 새 함수**다.
  // 그 identity 를 effect 의존성에 두면 부모가 리렌더될 때마다 스캔이 다시 나간다 —
  // 클릭당 최대 16회 예산이 배수로 불어나는 데다, 두 번째 스캔이 자기가 방금 잡은
  // 발송 리스에 막혀 화면이 **자기 자신에게** 이어받기를 권한다. 부모는 이 다이얼로그를
  // 조건부로 마운트하므로(mount === open) 마운트 1회로 고정하는 것이 옳다.
  const scanRef = useRef(scan);
  // 렌더 중에 ref 를 쓰면 안 된다(react-hooks/refs) — 커밋 후에 동기화한다.
  // 마운트 스캔은 초기값을 쓰고, 이후 '다시 확인'·'이어받기' 는 최신 것을 쓴다.
  useEffect(() => {
    scanRef.current = scan;
  });

  // 서버 액션은 reject 할 수 있다(네트워크·digest·데드라인 밖 예외). catch 가 없으면
  // phase 가 'scanning' 에 영구 고정돼 **마지막 수단인 이 화면이 조용히 죽는다** —
  // 그러면 PG 는 '계약서 올리기'로 돌아가 두 번째 계약을 발송한다.
  const runScan = useCallback(
    (alive: () => boolean) => {
      scanRef
        .current()
        .then((r) => {
          if (alive()) applyResult(r);
        })
        .catch(() => {
          if (alive()) applyResult({ ok: false, error: 'SCAN_FAILED' });
        });
    },
    [applyResult],
  );

  useEffect(() => {
    let alive = true;
    runScan(() => alive);
    return () => {
      alive = false;
    };
  }, [runScan]);

  function rescan() {
    // 진행 중이면 겹치지 않는다. 두 번째 스캔은 자기가 방금 잡은 발송 리스에 막혀
    // (claimForSend 에 소유자 예외가 없다) 화면이 **자기 자신에게** 이어받기를 권하고,
    // 매 클릭이 공유 rate limit 을 한 번 더 태운다.
    if (phase === 'scanning') return;
    setPhase('scanning');
    setError(null);
    // 선택만 되돌린다. `truncated`·`candidates` 는 **지우지 않는다** — 지우면
    // '다시 확인해요' 의 렌더 조건이 무너져 스캔 도는 동안 버튼이 통째로 사라진다
    // (비활성이 아니라 사라지면 사용자는 눌렀다가 실패한 줄 안다). 옛 결과가 화면에
    // 남는 문제는 아래에서 phase 로 가린다.
    setSelected(null);
    setConfirming(false);
    runScan(() => true);
  }

  async function handleConfirm() {
    // `submitting` 재확인은 두지 않는다 — 유일한 트리거인 버튼이 그동안 disabled 라
    // 어떤 변이로도 실패시킬 수 없는 도달 불가 코드였다(리렌더 전 연타도 disabled 가
    // 먼저 막는다). 중복 요청을 막는 건 아래 disabled 이고, 테스트가 그걸 고정한다.
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      // confirm 도 reject 할 수 있다 — 삼키면 사용자는 눌렀는데 아무 일도 안 일어난
      // 화면을 보고, 되던 경로였는지조차 알 수 없다. 화면은 열어 둔 채 알린다.
      const r = await confirm(selected).catch(() => ({ ok: false as const, error: 'LINK_FAILED' }));
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
      // 호출 자체가 실패한 경우는 재시도가 의미 있다 — 닫지 않는다.
      if (r.error === 'LINK_FAILED') {
        setError(signingErrorMessage(r.error, '연결하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        return;
      }
      // 그 밖(ALREADY_SENT·CONTRACT_CHANGED·권한 등)은 이 화면이 더 할 일이 없다.
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  const live = candidates.filter((c) => !c.alreadyCompleted);
  const finished = candidates.filter((c) => c.alreadyCompleted);
  const selectedCandidate = candidates.find((c) => c.providerContractId === selected);
  // 완료본이 걸린 선택이라 한 단 더 확인한다.
  const needsConfirm = !!selectedCandidate?.alreadyCompleted;
  const many = candidates.length > 1;
  const title =
    phase === 'scanning'
      ? '보낸 계약서를 찾고 있어요'
      : phase === 'held'
        ? '다른 담당자가 계약서를 작성하고 있어요'
      : phase === 'failed'
        ? '보낸 계약서를 확인하지 못했어요'
        : candidates.length === 0
        ? '보낸 계약서를 찾지 못했어요'
        : many
          ? '어떤 계약서를 연결할까요?'
          : '이 계약서를 연결할까요?';

  function renderGroup(
    rows: SigningRecoveryCandidate[],
    legend: string,
    heading: string | null,
  ) {
    return (
      <fieldset className="space-y-1.5">
        <legend className={heading ? 'md-label-small ' + dim : 'sr-only'}>
          {heading ?? legend}
        </legend>
        {rows.map((c) => (
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
              onChange={() => {
                setSelected(c.providerContractId);
                // 선택이 바뀌면 확인 단계는 처음부터 — 다른 계약을 확인 없이 붙이면 안 된다.
                setConfirming(false);
              }}
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
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {phase === 'scanning'
              ? '스노우싸인에서 이 딜로 보낸 계약서를 확인하고 있어요. 잠시만 기다려요.'
              : phase === 'held'
                ? '지금은 보낸 계약서를 확인할 수 없어요. 그 담당자가 끝내면 다시 확인해요. 급하면 이 창을 닫고 \'계약서 올리기\'로 이어받을 수 있어요 — 다만 그 담당자가 올리던 계약서는 사라져요.'
                : phase === 'failed'
                ? '잠시 후 다시 확인해 보세요. 계속 안 되면 문의해 주세요.'
                : candidates.length === 0
                ? "구매사 담당자와 이 딜의 담당자가 모두 수신자로 들어간 계약서만 찾아요. 아직 발송을 마치지 않았다면 '계약서 올리기'로 이어서 보내면 돼요."
                : many
                  ? '구매사 담당자와 이 딜의 담당자가 모두 수신자로 들어간 계약서예요. 이 딜로 보낸 것을 하나만 골라요.'
                  : '연결하면 딜룸이 서명 진행 중으로 바뀌고 양측에 알림이 가요.'}
          </DialogDescription>
        </DialogHeader>

        {/* 스캔은 최대 12초다 — 표시가 없으면 사용자는 5초쯤에 멈춘 줄 알고 닫는다. */}
        {phase === 'scanning' && (
          <p role="status" className={'text-[12.5px] ' + dim}>
            확인하는 중이에요… 최대 12초쯤 걸려요.
          </p>
        )}

        {phase !== 'scanning' && live.length > 0 && renderGroup(live, '보낸 계약서 후보', null)}
        {phase !== 'scanning' && finished.length > 0 &&
          renderGroup(
            finished,
            '이미 서명이 끝난 계약서',
            '이미 서명이 끝난 계약서',
          )}

        {phase !== 'scanning' && truncated && (
          <p className={'text-[12.5px] ' + dim}>
            {candidates.length === 0
              ? // 0건인데 잘렸다면 "없다"가 아니라 "못 봤다"이다. 같은 문구로 뭉개면
                // 사용자가 없다고 믿고 '계약서 올리기'로 가 두 번째 계약을 보낸다.
                '확인하지 못한 계약이 있어요. 일부를 못 본 채 끝나서 결과가 비어 있을 수 있어요 — 다시 확인해요.'
              : '계약이 많아 최근 것부터 확인했어요. 찾는 계약서가 없으면 다시 확인해요.'}
          </p>
        )}

        {confirming && (
          // 누르는 순간 버튼 이름만 조용히 '연결할게요' 로 바뀌면, 스크린리더 사용자는
          // 아무 것도 못 듣고 한 번 더 눌러 되돌릴 수 없는 연결을 마친다 — 이 단계가
          // 늦추려던 바로 그 동작이다. 형제 error <p> 와 같은 규약으로 알린다.
          <p role="alert" className="md-label-small text-[var(--md-sys-color-error)]">
            이미 서명이 끝난 계약서예요. 연결하면 이 딜룸이 바로 완료로 바뀌고 양측이 완료본을
            받아요 — 이 딜의 계약이 맞는지 한 번만 더 확인해 주세요.
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
          {(truncated || phase === 'failed' || phase === 'held' || (phase === 'done' && candidates.length === 0)) && (
            <Button
              variant="text"
              size="sm"
              onClick={() => rescan()}
              disabled={submitting || phase === 'scanning'}
            >
              다시 확인해요
            </Button>
          )}
          {candidates.length > 0 && (
            <Button
              size="sm"
              onClick={() => {
                // 완료 고아는 한 번 더 묻고 나서야 붙는다.
                if (needsConfirm && !confirming) {
                  setConfirming(true);
                  return;
                }
                void handleConfirm();
              }}
              disabled={!selected || submitting}
            >
              {submitting ? 'LOADING…' : confirming ? '연결할게요' : '이 계약서로 연결해요'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
