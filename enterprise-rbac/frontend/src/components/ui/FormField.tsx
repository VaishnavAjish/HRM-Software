import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

const controlClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50';

export function TextInput({
  label,
  error,
  ...props
}: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error}>
      <input {...props} className={controlClass} />
    </Field>
  );
}

export function SelectInput({
  label,
  error,
  children,
  ...props
}: { label: string; error?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} error={error}>
      <select {...props} className={controlClass}>
        {children}
      </select>
    </Field>
  );
}

export function TextareaInput({
  label,
  error,
  ...props
}: { label: string; error?: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error}>
      <textarea {...props} className={controlClass} rows={props.rows ?? 3} />
    </Field>
  );
}

export function CheckboxInput({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 flex items-center gap-2 text-sm text-foreground">
      <input type="checkbox" {...props} className="h-4 w-4 rounded border-input" />
      {label}
    </label>
  );
}
