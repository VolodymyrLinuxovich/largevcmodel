export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs leading-5 text-[hsl(39_32%_70%)]">
      {message}
    </p>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="eyebrow">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[0.7rem] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
