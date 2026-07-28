'use client';

import { CurrencyInput, DayOffsetInput } from '@/components/forms/inputs';
import { formatSettleCycle, SETTLE_CYCLE_PARSE_RE } from '@/lib/utils/settle-cycle';
import { isCycleValid, isSettleLimitValid } from './bid-wizard-validation';
import { markerState } from '@/lib/rfp/required-fields';
import type { SetBidField } from './types';

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  signupFee: string;
  onField: SetBidField;
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
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div className="col-span-2">
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
        <CurrencyInput
          label="정산한도 (원/월)"
          infoTerm="정산한도"
          value={settleLimit}
          onChange={(v) => onField('settleLimit', v)}
          placeholder="50,000,000"
          markerState={markerState({ valid: settleLimitValid, attempted })}
          error={attempted && !settleLimitValid ? '정산한도를 입력해주세요' : undefined}
        />
        <CurrencyInput
          label="월 보증보험 (원/연)"
          infoTerm="보증보험"
          value={guaranteeInsurance}
          onChange={(v) => onField('guaranteeInsurance', v)}
          placeholder="0"
        />
        <CurrencyInput
          label="가입비 (원/최초 1회)"
          infoTerm="가입비"
          value={signupFee}
          onChange={(v) => onField('signupFee', v)}
          placeholder="0"
        />
      </div>

    </div>
  );
}
