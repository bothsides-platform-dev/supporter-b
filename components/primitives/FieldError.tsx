type Props = {
  error?: string;
};

export function FieldError({ error }: Props) {
  if (!error?.trim()) return null;
  return (
    <p role="alert" className="text-[12px] text-[var(--md-sys-color-error)]">
      {error}
    </p>
  );
}
