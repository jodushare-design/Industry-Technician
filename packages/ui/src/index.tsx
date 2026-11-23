/**
 * Shared web components, styled after Apple's Human Interface Guidelines
 * (see theme.css): pill buttons, filled rounded fields, grouped cards with
 * soft depth, tinted status colours and large titles.
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
        'inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[15px] font-semibold transition active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-on-accent shadow-sm hover:bg-accent-strong',
        variant === 'secondary' && 'bg-blue-soft text-accent hover:brightness-95',
        variant === 'danger' && 'bg-red-soft text-danger hover:brightness-95',
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
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
        className={cx(
          'min-h-11 rounded-xl border bg-subtle px-3.5 text-[17px] transition',
          error ? 'border-danger' : 'border-transparent',
          'focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-blue-soft',
        )}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const ALERT_STYLE = {
  info: { box: 'bg-blue-soft', dot: 'bg-ios-blue', icon: 'i' },
  warning: { box: 'bg-orange-soft', dot: 'bg-ios-orange', icon: '!' },
  error: { box: 'bg-red-soft', dot: 'bg-ios-red', icon: '!' },
  success: { box: 'bg-green-soft', dot: 'bg-ios-green', icon: '✓' },
} as const;

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: string; children: ReactNode }) {
  const s = ALERT_STYLE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl px-4 py-3 text-[15px]', s.box)}>
      <span aria-hidden className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', s.dot)}>
        {s.icon}
      </span>
      <div className="min-w-0">
        {title && <p className="mb-0.5 font-semibold">{title}</p>}
        <div className="text-foreground/90">{children}</div>
      </div>
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl bg-surface p-5 shadow-card sm:p-6', className)}>{children}</section>;
}

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-[34px] sm:leading-tight">{title}</h1>
      {description && <div className="mt-1.5 text-[17px] text-muted">{description}</div>}
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

/** Notice / error passed back through the URL after a form action (?notice=… / ?error=…). */
export function Flash({ notice, error }: { notice?: string | string[]; error?: string | string[] }) {
  const n = Array.isArray(notice) ? notice[0] : notice;
  const e = Array.isArray(error) ? error[0] : error;
  if (!n && !e) return null;
  return <div className="mb-4">{e ? <Alert tone="error">{e}</Alert> : <Alert tone="success">{n}</Alert>}</div>;
}

export const fieldClass =
  'min-h-11 rounded-xl border border-transparent bg-subtle px-3.5 text-[17px] focus:border-accent focus:bg-surface focus:outline-none focus:ring-4 focus:ring-blue-soft';
export const smallButtonClass =
  'inline-flex min-h-10 items-center justify-center rounded-full bg-blue-soft px-4 text-sm font-semibold text-accent transition hover:brightness-95 active:scale-[0.98]';
export const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-semibold text-on-accent shadow-sm transition hover:bg-accent-strong active:scale-[0.98]';

/** Labelled native select (works without JavaScript). */
export function SelectField({
  label,
  name,
  defaultValue,
  children,
  hint,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
      {label}
      <select name={name} defaultValue={defaultValue} required={required} className={`${fieldClass} font-normal text-foreground`}>
        {children}
      </select>
      {hint && <span className="text-[13px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

const PILL = {
  neutral: 'bg-subtle text-muted',
  warning: 'bg-orange-soft text-warning',
  success: 'bg-green-soft text-success',
  danger: 'bg-red-soft text-danger',
  info: 'bg-blue-soft text-accent',
  purple: 'bg-purple-soft text-ios-purple',
} as const;

export function StatusPill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

/** Rounded square icon tile in an Apple system colour (like Settings app icons). */
export function IconTile({ color, children, className }: { color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'pink' | 'teal' | 'indigo'; children: ReactNode; className?: string }) {
  const bg = {
    blue: 'bg-ios-blue', green: 'bg-ios-green', orange: 'bg-ios-orange', red: 'bg-ios-red',
    purple: 'bg-ios-purple', pink: 'bg-ios-pink', teal: 'bg-ios-teal', indigo: 'bg-ios-indigo',
  }[color];
  return (
    <span aria-hidden className={cx('inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] text-lg font-bold text-white shadow-sm', bg, className)}>
      {children}
    </span>
  );
}
