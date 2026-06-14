'use client';

import { NumericFormat } from 'react-number-format';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { InfoTip } from '@/components/ui/info-tip';
import { Button } from '@/components/primitives/Button';
import { CurrencyInput, numericInputClass } from '@/components/forms/inputs';
import { cn } from '@/lib/utils';
import type { SetBidField } from './types';

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

type Props = {
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  onField: SetBidField;
  onNext: () => void;
};

export function BidStepSettlement({
  cycleUnit,
  cycleNum,
  settleLimit,
  guaranteeInsurance,
  onField,
  onNext,
}: Props) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        <div className="col-span-2 space-y-1">
          <div className="flex items-center gap-1">
            <Label size="md" muted={false}>정산 주기 *</Label>
            <InfoTip term="정산주기" />
          </div>
          <div className="flex items-end gap-2">
            <div className="w-28">
              <Select
                options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                value={cycleUnit}
                onChange={(v) => onField('cycleUnit', v as 'D' | 'W' | 'M')}
              />
            </div>
            <NumericFormat
              decimalScale={0}
              allowNegative={false}
              isAllowed={(values) =>
                values.floatValue === undefined || values.floatValue <= 99
              }
              value={cycleNum}
              onValueChange={(values) => onField('cycleNum', values.value)}
              placeholder="1"
              className={cn(numericInputClass, 'flex-1')}
            />
          </div>
          <p className="font-mono text-[10px] text-[var(--md-sys-color-outline)]">
            예: D+1, W+2, M+1
          </p>
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

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onNext}
          trailingIcon={<span aria-hidden>→</span>}
        >
          수수료
        </Button>
      </div>
    </div>
  );
}
