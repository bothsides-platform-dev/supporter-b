type Props = {
  error?: string;
};

export function FieldError({ error }: Props) {
  if (!error?.trim()) return null;
  return (
    <p role="alert" className="text-[length:var(--md-typescale-body-small-size)] leading-[var(--md-typescale-body-small-line-height)] text-[var(--md-sys-color-error)]">
      {error}
    </p>
  );
}
