import { LocalTime } from '@/components/primitives/LocalTime';

export function RequoteBanner({ message, deadline }: { message: string; deadline: string }) {
  return (
    <div className="mb-6 rounded-[8px] border border-[var(--md-sys-color-warning-container)] bg-[var(--md-sys-color-warning-container)] p-4">
      <p className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-warning-container)]">
        견적 재요청을 받았어요
      </p>
      <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--md-sys-color-on-warning-container)]">
        {message}
      </p>
      <p className="mt-2 font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-warning-container)]">
        새 마감 <LocalTime iso={deadline} />
      </p>
    </div>
  );
}
