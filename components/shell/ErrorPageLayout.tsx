'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ActionConfig {
  label: string;
  href?: string;
  onClick?: () => void;
  back?: boolean;
}

interface ErrorPageLayoutProps {
  code: string;
  title: string;
  description: string;
  variant?: 'default' | 'error';
  chip?: string;
  primaryAction: ActionConfig;
  secondaryAction: ActionConfig;
}

function ActionButton({
  config,
  filled,
  variant,
}: {
  config: ActionConfig;
  filled: boolean;
  variant?: 'default' | 'error';
}) {
  const router = useRouter();

  const filledClass = filled
    ? variant === 'error'
      ? 'bg-[var(--md-sys-color-error)] text-[var(--md-sys-color-on-error)]'
      : 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]'
    : 'border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)]';

  // 라벨이 아니라 버튼이라 `.md-label-large`(라벨 line-height·자간 동반)를 씌우지
  // 않는다 — Button.tsx 와 같이 크기 토큰만 쓰고 굵기는 직접 지정한다(500 동일값).
  const className = `px-4 h-8 inline-flex items-center rounded-[var(--md-sys-shape-small)] text-[length:var(--md-typescale-label-large-size)] font-medium transition-opacity hover:opacity-90 ${filledClass}`;

  if (config.href) {
    return (
      <Link href={config.href} className={className}>
        {config.label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={config.back ? () => router.back() : config.onClick}
    >
      {config.label}
    </button>
  );
}

export function ErrorPageLayout({
  code,
  title,
  description,
  variant = 'default',
  chip,
  primaryAction,
  secondaryAction,
}: ErrorPageLayoutProps) {
  const codeClass =
    variant === 'error'
      ? 'text-[var(--md-sys-color-error)]'
      : 'text-[var(--md-sys-color-on-surface)]';

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] gap-5 px-6 text-center">
      <p
        className={`md-numeric text-[80px] font-bold leading-none tracking-[-3px] ${codeClass}`}
      >
        {code}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] text-[var(--md-sys-color-on-surface)]">
          {title}
        </p>
        <p className="text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-on-surface-variant)] max-w-sm">
          {description}
        </p>
      </div>

      {chip && (
        <span className="px-2 py-0.5 rounded-[var(--md-sys-shape-extra-small)] text-[length:var(--md-typescale-label-medium-size)] bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)]">
          {chip}
        </span>
      )}

      <div className="flex gap-3 mt-2">
        <ActionButton config={primaryAction} filled variant={variant} />
        <ActionButton config={secondaryAction} filled={false} variant={variant} />
      </div>
    </div>
  );
}
