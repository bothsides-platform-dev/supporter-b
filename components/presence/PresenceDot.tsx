const LABEL = { active: '온라인', idle: '자리 비움', offline: '' } as const;

export function PresenceDot({ activity }: { activity: 'active' | 'idle' | 'offline' }) {
  if (activity === 'offline') return null;
  const bg = activity === 'active'
    ? 'bg-[var(--md-sys-color-tertiary)]'
    : 'bg-[var(--md-sys-color-outline)]';
  return (
    <span
      aria-label={LABEL[activity]}
      className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--md-sys-color-surface)] ${bg}`}
    />
  );
}
