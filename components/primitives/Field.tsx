import { cn } from '@/lib/utils';

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * Composable labeled-field wrapper.
 * Provides: label-medium label (linked via htmlFor/id) + optional hint.
 * Does NOT render inline errors — all save errors go to toast (Members parity).
 */
export function Field({ label, htmlFor, hint, required, className, children }: FieldProps) {
  return (
    <div data-field className={cn('space-y-1', className)}>
      <label
        htmlFor={htmlFor}
        className="text-[length:var(--md-typescale-label-medium-size)] font-[number:var(--md-typescale-label-medium-weight)] leading-[var(--md-typescale-label-medium-line-height)] tracking-[var(--md-typescale-label-medium-tracking)] text-[var(--md-sys-color-on-surface)]"
      >
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-[var(--md-sys-color-error)]">*</span>}
      </label>
      {children}
      {hint && (
        <p role="note" className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
          {hint}
        </p>
      )}
    </div>
  );
}
