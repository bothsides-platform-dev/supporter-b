'use client';

import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';

type Props = {
  value: string[];
  onChange: (emails: string[]) => void;
};

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function PgEmailAllowlist({ value, onChange }: Props) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    const email = input.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (value.includes(email)) {
      setError('이미 추가된 이메일입니다.');
      return;
    }
    onChange([...value, email]);
    setInput('');
    setError('');
  };

  const handleRemove = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label size="md" muted={false}>PG 이메일 주소</Label>
        <div className="flex items-end gap-3">
          <input
            type="email"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
            placeholder="sales@pg.com"
            className="flex-1 bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
          <Button
            type="button"
            variant="outlined"
            size="sm"
            disabled={!input.trim()}
            onClick={handleAdd}
          >
            추가
          </Button>
        </div>
        {error && (
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
            {error}
          </p>
        )}
      </div>

      {value.length > 0 && (
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
          {value.map((email, i) => (
            <div key={email} className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{email}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(email)}
                className="font-mono text-[11px] text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-error)] transition-colors px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
          이메일을 추가하면 해당 담당자에게 초대 메일이 발송됩니다.
        </p>
      )}
    </div>
  );
}
