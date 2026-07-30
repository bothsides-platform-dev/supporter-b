'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
// 설정에서의 사업자번호 *변경*은 저하(미검증 통과) 대상이 아니다 — 이미 승인을
// 통과한 워크스페이스라 관리자 승인이라는 방어선이 없다. 자세한 근거는 nts-lookup.ts.
import { ntsLookupStrict } from '@/components/rfp/nts-lookup';
import { updateWorkspaceBizProfileAction } from '@/lib/server/actions/rfp';
import { toast } from '@/lib/toast';

type Props = {
  /** null = 사업자번호 미등록 (초기 등록 모드로 진입) */
  currentBizNo: string | null;
  /** 초기 등록 성공 후 이동할 URL (biz_required 흐름에서 /rfp-create 등) */
  returnUrl?: string;
  /** 승인된 admin 만 등록정보를 바꿀 수 있다 — 서버 게이트와 짝을 이루는 UI 게이트 */
  canEdit: boolean;
};

// 재시도 가능 여부까지 문구로 구분한다. 종결 판정(BIZ_NOT_FOUND·
// BIZ_STATUS_NOT_ACTIVE·BIZ_UNSUPPORTED_TYPE)에 "잠시 후 다시 시도" 를 붙이면
// 절대 성공하지 않는 동작을 반복하게 만든다 — 폐업 번호는 내일도 폐업이다.
// 서버가 돌려줄 수 있는 코드의 출처는 _resolveBizProfile.ts 와 이 액션이다.
export const ERROR_LABELS: Record<string, string> = {
  FORBIDDEN_NOT_ADMIN: '권한이 없어요. 워크스페이스 관리자에게 변경을 요청해 주세요.',
  FORBIDDEN_BUYER: '구매사 워크스페이스에서만 바꿀 수 있어요.',
  BIZ_PROFILE_REQUIRED: '사업자번호를 먼저 입력해 주세요.',
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요.',
  // ── 종결: 같은 번호로는 다시 시도해도 결과가 같다 ──
  BIZ_NOT_FOUND: '등록되지 않은 사업자번호예요. 번호를 다시 확인해 주세요.',
  BIZ_STATUS_NOT_ACTIVE: '폐업·휴업 상태의 사업자번호는 등록할 수 없어요.',
  BIZ_UNSUPPORTED_TYPE: '지원되지 않는 사업자 유형이에요.',
  // ── 일시적: 재시도가 실제로 통한다 ──
  BIZ_LOOKUP_UNAVAILABLE: '국세청 조회가 어려워요. 잠시 후 다시 시도해 주세요.',
  BIZ_LOOKUP_RATE_LIMITED: '조회 요청이 많아요. 잠시 후 다시 시도해 주세요.',
};

export function WorkspaceBizNoForm({ currentBizNo, returnUrl, canEdit }: Props) {
  // 미등록 상태(null)에서는 곧장 입력 UI 노출 — 별도 '수정' 버튼이 없으므로
  // 디폴트 editing=true. 단 일반 멤버에게는 켜지 않는다: 수정 버튼 게이트를
  // 우회해 다 입력하고 저장에서만 거부당하는 막다른 길이 되기 때문.
  const [editing, setEditing] = useState(currentBizNo === null && canEdit);
  const [next, setNext] = useState<BizLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // `verified` 를 게이트에 포함한다 — ntsLookupStrict 가 저하를 애초에 막지만,
  // 미검증 프로필이 저장되는 경로가 여기에는 없다는 것을 타입 수준에서도 못박는다.
  const dirty = next !== null && next.verified && next.bizNo !== currentBizNo;

  const handleStartEdit = () => {
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setNext(null);
  };

  const handleSubmit = async () => {
    if (!dirty || submitting || !next) return;
    // 미검증(taxType·status 없음) 프로필은 저장하지 않는다 — `dirty` 가 이미
    // 막지만, 액션 페이로드가 optional 을 받지 않으므로 여기서 좁혀 준다.
    if (!next.taxType || !next.status) return;
    setSubmitting(true);
    const r = await updateWorkspaceBizProfileAction({
      bizProfile: {
        bizNo: next.bizNo,
        taxType: next.taxType,
        status: next.status,
      },
    });
    setSubmitting(false);
    if (!r.ok) {
      toast(ERROR_LABELS[r.error] ?? '저장하지 못했어요. 잠시 후 다시 시도해 주세요.', {
        type: 'error',
      });
      return;
    }
    toast('사업자번호를 저장했어요.');
    setEditing(false);
    setNext(null);
    if (isInitialRegistration && returnUrl) {
      startTransition(() => router.push(returnUrl));
    } else {
      startTransition(() => router.refresh());
    }
  };

  const isInitialRegistration = currentBizNo === null;

  return (
    <div className="space-y-4">
      {/* read-only 상태에서만 섹션 헤더 렌더 — edit 상태는 BizLookupField 자체 레이블 사용 */}
      {!editing && <Label size="md" muted={false}>사업자 등록번호</Label>}
      {!editing && currentBizNo !== null ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-y border-[var(--md-sys-color-outline-variant)] py-2.5">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            현재
          </span>
          <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
            <span className="text-[13px] text-[var(--md-sys-color-on-surface)] md-numeric">
              {currentBizNo}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors shrink-0"
              >
                수정
              </button>
            )}
          </div>
        </div>
      ) : !editing ? (
        // 미등록 + 일반 멤버 — 입력 UI 를 열어 봐야 저장에서 거부되므로 안내만 한다.
        // 설명문이라 label-small(메타 라벨 전용) 이 아니라 body-medium 을 쓴다(DESIGN.md §3).
        // "관리자에게 요청하라"는 행동 안내는 패널 헤더 아래 한 줄이 이미 진다 —
        // 여기서 반복하면 같은 말이 20px 간격으로 두 번 나온다. 이 행의 고유 정보는
        // "아직 등록되지 않았다"는 사실뿐이다.
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] border-y border-[var(--md-sys-color-outline-variant)] py-2.5">
          아직 사업자번호가 등록되지 않았어요.
        </p>
      ) : (
        <div className="space-y-4">
          <BizLookupField
            onLookup={ntsLookupStrict}
            onResult={(profile) => setNext(profile)}
            onReset={() => setNext(null)}
            // 가입 폼(BuyerWorkspaceForm)과 같은 차단 목록 — 없으면 정상 사업자로
            // 가입한 뒤 이 화면에서 폐업·휴업 번호로 갈아끼울 수 있다.
            blockedStatuses={['closed', 'suspended']}
          />

          {next && next.bizNo === currentBizNo && (
            <p
              role="status"
              className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
            >
              현재 사업자번호와 동일합니다.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              disabled={!dirty || submitting}
              onClick={handleSubmit}
            >
              {submitting
                ? '저장 중…'
                : isInitialRegistration
                  ? '사업자번호 등록'
                  : '변경 적용'}
            </Button>
            {!isInitialRegistration && (
              <button
                type="button"
                onClick={handleCancel}
                className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
              >
                취소
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
