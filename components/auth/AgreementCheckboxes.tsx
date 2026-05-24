'use client';

import { Checkbox } from '@/components/primitives/Checkbox';

type AgreementState = {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
};

type AgreementCheckboxesProps = {
  value: AgreementState;
  onChange: (v: AgreementState) => void;
};

function AgreementRow({
  id,
  checked,
  onChange,
  children,
  required,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] leading-snug">
        {children}
        {required && <span className="ml-1 text-[var(--md-sys-color-error)]">*</span>}
      </span>
    </label>
  );
}

export function AgreementCheckboxes({ value, onChange }: AgreementCheckboxesProps) {
  const allChecked = value.terms && value.privacy && value.marketing;

  const toggleAll = () => {
    const next = !allChecked;
    onChange({ terms: next, privacy: next, marketing: next });
  };

  return (
    <div className="space-y-3">
      <AgreementRow id="all" checked={allChecked} onChange={toggleAll}>
        <span className="font-medium">전체 동의</span>
      </AgreementRow>
      <div className="ml-7 space-y-2.5 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
        <AgreementRow
          id="terms"
          checked={value.terms}
          onChange={(v) => onChange({ ...value, terms: v })}
          required
        >
          <a
            href="https://moingclub.notion.site/Supporter-B-363ef44bd15380199b7bd5c5ba2d900e"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
            onClick={(e) => e.stopPropagation()}
          >
            이용약관
          </a>{' '}
          동의
        </AgreementRow>
        <AgreementRow
          id="privacy"
          checked={value.privacy}
          onChange={(v) => onChange({ ...value, privacy: v })}
          required
        >
          <a
            href="https://moingclub.notion.site/Supporter-B-363ef44bd15380409aa1eabb4ab5b240"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
            onClick={(e) => e.stopPropagation()}
          >
            개인정보 처리방침
          </a>{' '}
          동의
        </AgreementRow>
        <AgreementRow
          id="marketing"
          checked={value.marketing}
          onChange={(v) => onChange({ ...value, marketing: v })}
        >
          마케팅 수신 동의 (선택)
        </AgreementRow>
      </div>
    </div>
  );
}
