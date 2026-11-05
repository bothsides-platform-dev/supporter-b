'use client';

import { useId, useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { passwordStrength } from '@/lib/auth/strength';
import { getPasswordRuleChecks } from '@/lib/auth/password-validation';
import { cn } from '@/lib/utils';
import {
  underlineInputBase,
  underlineInputBorder,
  underlineInputErrorBorder,
} from '@/components/forms/inputs';

const strengthColor = [
  '',
  'bg-[var(--md-sys-color-error)]',
  'bg-[var(--md-sys-color-warning)]',
  'bg-[var(--md-sys-color-on-surface-variant)]',
  'bg-[var(--md-sys-color-tertiary)]',
] as const;

type PasswordFieldProps = {
  label?: string;
  name?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  showStrength?: boolean;
  autoComplete?: string;
  error?: string;
  /**
   * 제출이 막힌 뒤 true. 미충족 규칙을 기본 글자색에서 오류색으로 올린다 —
   * 입력 도중에는 빨간색으로 다그치지 않고, 넘어가려다 막혔을 때만 쓴다.
   */
  showRuleErrors?: boolean;
};

export function PasswordField({
  label = '비밀번호',
  name = 'password',
  placeholder,
  value,
  onChange,
  showStrength = false,
  autoComplete = 'new-password',
  error,
  showRuleErrors = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? passwordStrength(value) : 0;
  // useId gives a stable SSR/CSR matching id even when the same PasswordField
  // is rendered multiple times on the page (e.g. signup uses two — password
  // and confirm). htmlFor + aria-invalid wire up assistive tech beyond the
  // visual error border.
  const inputId = useId();
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="md-label-small text-[var(--md-sys-color-on-surface-variant)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            underlineInputBase,
            'pr-10',
            error ? underlineInputErrorBorder : underlineInputBorder,
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-0 top-2 text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          aria-label={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        >
          {visible ? <EyeOff size={16} strokeWidth={1.4} /> : <Eye size={16} strokeWidth={1.4} />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((bar) => (
              <div
                key={bar}
                className={cn(
                  'h-0.5 flex-1 transition-colors duration-[140ms]',
                  bar <= strength ? strengthColor[strength] : 'bg-[var(--md-sys-color-outline)]',
                )}
              />
            ))}
          </div>
          <ul className="space-y-1">
            {getPasswordRuleChecks(value).map((rule) => {
              // 충족은 회색으로 물러나고, 미충족이 진한 글자로 남아 먼저 읽힌다.
              const state = rule.satisfied ? 'met' : showRuleErrors ? 'error' : 'unmet';
              return (
                <li
                  key={rule.id}
                  data-state={state}
                  className={cn(
                    'flex items-center gap-1.5 text-xs transition-colors',
                    state === 'met' && 'text-[var(--md-sys-color-on-surface-variant)]',
                    state === 'unmet' && 'text-[var(--md-sys-color-on-surface)]',
                    state === 'error' && 'text-[var(--md-sys-color-error)]',
                  )}
                >
                  {rule.satisfied ? (
                    <Check size={14} strokeWidth={1.5} aria-hidden />
                  ) : (
                    <X size={14} strokeWidth={1.5} aria-hidden />
                  )}
                  <span>{rule.label}</span>
                  <span className="sr-only">{rule.satisfied ? '충족' : '미충족'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && (
        <p id={errorId} className="text-xs text-[var(--md-sys-color-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
