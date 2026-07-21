'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type ResendCountdownProps = {
  initialSeconds?: number;
  onResend: () => void;
  className?: string;
};

export function ResendCountdown({
  initialSeconds = 60,
  onResend,
  className,
}: ResendCountdownProps) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const handleResend = () => {
    setSeconds(initialSeconds);
    onResend();
  };

  return (
    <button
      type="button"
      disabled={seconds > 0}
      onClick={handleResend}
      className={cn(
        'md-label-small transition-colors',
        seconds > 0
          ? 'text-[var(--md-sys-color-on-surface-variant)] cursor-default'
          : 'text-[var(--md-sys-color-on-surface)] hover:text-[var(--md-sys-color-on-surface-variant)] cursor-pointer',
        className,
      )}
    >
      {seconds > 0 ? (
        <>재발송 (<span className="tabular-nums">{mm}:{ss}</span>)</>
      ) : (
        '재발송'
      )}
    </button>
  );
}
