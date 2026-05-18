'use client';

import { useState } from 'react';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { passwordStrength } from '@/lib/auth/strength';
import { getPasswordRuleChecks } from '@/lib/auth/password-validation';
import { cn } from '@/lib/utils';

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
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? passwordStrength(value) : 0;

  return (
    <div className="space-y-2">
      <label className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={cn(
            'block w-full bg-transparent border-0 border-b py-2 pr-10 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none transition-colors',
            error
              ? 'border-[var(--md-sys-color-error)] focus:border-[var(--md-sys-color-error)]'
              : 'border-[var(--md-sys-color-outline)] focus:border-[var(--md-sys-color-on-surface)]',
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
            {getPasswordRuleChecks(value).map((rule) => (
              <li
                key={rule.id}
                className={cn(
                  'flex items-center gap-1.5 text-[11px] transition-colors',
                  rule.satisfied
                    ? 'text-[var(--md-sys-color-tertiary)]'
                    : 'text-[var(--md-sys-color-on-surface-variant)]',
                )}
              >
                {rule.satisfied ? (
                  <Check size={14} strokeWidth={1.5} />
                ) : (
                  <X size={14} strokeWidth={1.5} />
                )}
                <span>{rule.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-[var(--md-sys-color-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
