'use client';

import { CurrencyInput, DayOffsetInput } from '@/components/forms/inputs';
import { formatSettleCycle, SETTLE_CYCLE_PARSE_RE } from '@/lib/utils/settle-cycle';
import { isCycleValid, isSettleLimitValid } from './bid-wizard-validation';
import { markerState } from '@/lib/rfp/required-fields';
import { ConditionChoice } from './ConditionChoice';
import type { ConditionState } from '@/lib/quote/terms';
import type { SetBidField } from './types';

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  onField: SetBidField;
  conditionStates?: Record<string, ConditionState>;
  onCondition?: (key: string, state: ConditionState) => void;
  /** 제출 시도 후 true — 정산주기 미입력을 빨강으로 escalate(구매사 attempted 모델 미러). */
  attempted?: boolean;
};

export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  signupFee,
  onField,
  attempted = false,
  conditionStates,
  onCondition,
}: Props) {
  const cycleValue = cycleNum ? formatSettleCycle(cycleUnit, Number(cycleNum)) : '';
  const cycleValid = isCycleValid(cycleNum);
  const settleLimitValid = isSettleLimitValid(settleLimit);

  function handleCycleChange(v: string) {
    const m = v.match(SETTLE_CYCLE_PARSE_RE);
    if (m) {
      onField('cycleUnit', m[1] as 'D' | 'W' | 'M');
      onField('cycleNum', m[2]);
    } else {
      onField('cycleNum', '');
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5">
        <div className="col-span-2" data-bid-input="cycle">
          <DayOffsetInput
            label="정산 주기"
            infoTerm="정산주기"
            value={cycleValue}
            onChange={handleCycleChange}
            placeholder="1"
            markerState={markerState({ valid: cycleValid, attempted })}
            error={attempted && !cycleValid ? '정산 주기를 입력해주세요' : undefined}
          />
        </div>
        <div data-bid-input="limit">
          <CurrencyInput
            label="정산한도 (원/월)"
            infoTerm="정산한도"
            value={settleLimit}
            onChange={(v) => onField('settleLimit', v)}
            placeholder="50,000,000"
            markerState={markerState({ valid: settleLimitValid, attempted })}
            error={attempted && !settleLimitValid ? '정산한도를 입력해주세요' : undefined}
          />
        </div>
        {(['guaranteeInsurance', 'signupFee'] as const).map((key) => {
          const value = key === 'signupFee' ? signupFee : guaranteeInsurance;
          const state = conditionStates?.[key] ?? (value !== '' ? 'confirmed' : 'unset');
          const label = key === 'signupFee' ? '가입비 (원·최초 1회)' : '보증보험 금액(원)';
          return (
            <div key={key} data-bid-input={key}>
              {onCondition && <p className="mb-2 text-[14px] font-medium">{label}</p>}
              {onCondition && (
                <ConditionChoice
                  label={label}
                  value={state}
                  onChange={(v) => onCondition(key, v)}
                />
              )}
              {(state === 'confirmed' || state === 'unset' || !onCondition) && (
                <CurrencyInput
                  label={
                    onCondition ? `${key === 'signupFee' ? '가입비' : '보증보험'} 입력 금액` : label
                  }
                  value={value}
                  onChange={(v) => onField(key, v)}
                  placeholder="금액 입력"
                />
              )}
              {attempted && state === 'unset' && (
                <p className="text-[14px] text-[var(--md-sys-color-error)]">
                  금액 입력·협의 필요·해당 없음 중에서 선택해요
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
