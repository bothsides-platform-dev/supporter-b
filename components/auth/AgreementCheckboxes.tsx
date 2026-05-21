'use client';

import { cn } from '@/lib/utils';

type AgreementState = {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
};

type AgreementCheckboxesProps = {
  value: AgreementState;
  onChange: (v: AgreementState) => void;
};

function Checkbox({
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
      <div
        className={cn(
          'mt-0.5 w-4 h-4 border rounded-md flex items-center justify-center transition-colors shrink-0',
          checked
            ? 'border-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-on-surface)]'
            : 'border-[var(--md-sys-color-outline)] group-hover:border-[var(--md-sys-color-on-surface)]',
        )}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5 3.5-4" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
      <Checkbox id="all" checked={allChecked} onChange={toggleAll}>
        <span className="font-medium">전체 동의</span>
      </Checkbox>
      <div className="ml-7 space-y-2.5 border-t border-[var(--md-sys-color-outline-variant)] pt-3">
        <Checkbox
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
        </Checkbox>
        <Checkbox
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
        </Checkbox>
        <Checkbox
          id="marketing"
          checked={value.marketing}
          onChange={(v) => onChange({ ...value, marketing: v })}
        >
          마케팅 수신 동의 (선택)
        </Checkbox>
      </div>
    </div>
  );
}
