'use client';

import { Checkbox } from '@/components/primitives/Checkbox';
import { NEW_TAB_NOTICE } from '@/lib/a11y/link-notice';

type AgreementState = {
  terms: boolean;
  privacy: boolean;
  marketing: boolean;
};

type AgreementCheckboxesProps = {
  value: AgreementState;
  onChange: (v: AgreementState) => void;
};

/**
 * 새 탭 고지 — 약관 링크 전용.
 *
 * 다른 화면처럼 링크 안에 그냥 sr-only 텍스트를 넣으면 안 된다. 이 링크들은 체크박스의
 * `<label>` 안에 있어서, 링크 텍스트가 **체크박스의 접근성 이름에도 합쳐진다**
 * ("이용약관 새 탭에서 열려요 동의"처럼 동의 문장이 끊긴다).
 *
 * 그래서 `aria-hidden` 으로 이름 계산(name from contents)에서는 빼고, 링크가
 * `aria-describedby` 로 참조해 **설명**으로만 싣는다 — 참조된 요소는 숨겨져 있어도
 * 설명으로 쓰인다. 결과: 체크박스 이름은 '이용약관 동의' 그대로, 링크에 초점을 주면
 * 이름 뒤에 '새 탭에서 열려요' 가 따라온다.
 */
function NewTabNotice({ id }: { id: string }) {
  return (
    <span id={id} aria-hidden className="sr-only">
      {NEW_TAB_NOTICE}
    </span>
  );
}

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
            aria-describedby="new-tab-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
            onClick={(e) => e.stopPropagation()}
          >
            이용약관
            <NewTabNotice id="new-tab-terms" />
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
            aria-describedby="new-tab-privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
            onClick={(e) => e.stopPropagation()}
          >
            개인정보 처리방침
            <NewTabNotice id="new-tab-privacy" />
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
