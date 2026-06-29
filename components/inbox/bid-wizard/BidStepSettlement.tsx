'use client';

import { CurrencyInput, DayOffsetInput } from '@/components/forms/inputs';
import { formatSettleCycle } from '@/lib/utils/settle-cycle';
import type { SetBidField } from './types';

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
};

export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  onField,
}: Props) {
  const cycleValue = cycleNum ? formatSettleCycle(cycleUnit, Number(cycleNum)) : '';

  function handleCycleChange(v: string) {
    const m = v.match(/^([DWM])\+(\d+)$/);
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
            label="정산 주기 *"
            infoTerm="정산주기"
            value={cycleValue}
            onChange={handleCycleChange}
            placeholder="1"
          />
        </div>
        <CurrencyInput
          label="정산한도 (원/월)"
          infoTerm="정산한도"
          value={settleLimit}
          onChange={(v) => onField('settleLimit', v)}
          placeholder="0"
        />
        <CurrencyInput
          label="월 보증보험 (원/연)"
          infoTerm="보증보험"
          value={guaranteeInsurance}
          onChange={(v) => onField('guaranteeInsurance', v)}
          placeholder="0"
        />
      </div>

    </div>
  );
}
