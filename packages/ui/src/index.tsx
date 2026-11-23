/**
 * Shared web components. Styling uses Tailwind utility classes and the
 * colour tokens defined in each app's globals.css (bg-surface, text-muted …).
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-strong',
        variant === 'secondary' && 'border border-line bg-surface text-foreground hover:bg-subtle',
        variant === 'danger' && 'bg-danger text-on-accent hover:opacity-90',
        className,
      )}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; id: string }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
        className={cx(
          'min-h-11 rounded-md border bg-surface px-3 text-base',
          error ? 'border-danger' : 'border-line',
          'focus-visible:outline-2 focus-visible:outline-accent',
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: string; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-md border px-4 py-3 text-sm',
        tone === 'info' && 'border-line bg-subtle',
        tone === 'warning' && 'border-warning bg-warning-soft',
        tone === 'error' && 'border-danger bg-danger-soft',
        tone === 'success' && 'border-success bg-success-soft',
      )}
    >
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-lg border border-line bg-surface p-5', className)}>{children}</section>;
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-muted">{description}</p>}
    </header>
  );
}

/** Shown wherever a legal text is still a draft. Required until legal review approves it. */
export function DraftLegalBanner() {
  return (
    <Alert tone="warning" title="DRAFT — LEGAL REVIEW REQUIRED">
      This document has not yet been reviewed by a lawyer and is shown for pilot testing only.
    </Alert>
  );
}

/** Short-form platform disclaimer (docs/legal-review/12-platform-disclaimer.md). Wording pending legal review. */
export const PLATFORM_DISCLAIMER_SHORT =
  'Providers on this platform are independent businesses responsible for their own work. The platform does not perform repairs or promise repair results.';
