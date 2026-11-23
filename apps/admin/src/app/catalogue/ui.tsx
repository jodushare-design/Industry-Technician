import Link from "next/link";
import { Alert } from "@itm/ui";
import type { CatalogueStatus, VerificationStatus } from "@itm/types";

export const STATUS_STYLE: Record<CatalogueStatus, string> = {
  draft: "bg-subtle text-muted",
  pending_review: "bg-warning-soft text-warning",
  approved: "bg-success-soft text-success",
  rejected: "bg-danger-soft text-danger",
  merged: "bg-subtle text-muted",
  retired: "bg-subtle text-muted",
};

export function StatusBadge({ status }: { status: CatalogueStatus }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>{status.replace("_", " ")}</span>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  const style = status === "verified" ? "text-success" : status === "disputed" ? "text-danger" : "text-muted";
  return <span className={`text-xs whitespace-nowrap ${style}`}>{status.replace("_", " ")}</span>;
}

export function CatalogueNav({ current }: { current: string }) {
  const items = [
    ["/catalogue", "Records"],
    ["/catalogue/import", "Import"],
    ["/catalogue/suggestions", "Suggestions"],
    ["/catalogue/analytics", "Search analytics"],
  ] as const;
  return (
    <nav aria-label="Catalogue" className="mb-4 flex flex-wrap gap-2 text-sm">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={`rounded-md border px-3 py-1.5 ${current === href ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:bg-subtle"}`}
        >
          {label}
        </Link>
      ))}
      <a href="/catalogue/export?format=csv" className="rounded-md border border-line bg-surface px-3 py-1.5 hover:bg-subtle">
        Export CSV
      </a>
      <a href="/catalogue/export?format=json" className="rounded-md border border-line bg-surface px-3 py-1.5 hover:bg-subtle">
        Export JSON
      </a>
    </nav>
  );
}

export function Flash({ notice, error }: { notice?: string | string[]; error?: string | string[] }) {
  const n = Array.isArray(notice) ? notice[0] : notice;
  const e = Array.isArray(error) ? error[0] : error;
  if (!n && !e) return null;
  return <div className="mb-4">{e ? <Alert tone="error">{e}</Alert> : <Alert tone="success">{n}</Alert>}</div>;
}

export const inputClass = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm";
export const buttonClass = "min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong";
export const secondaryButtonClass = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm hover:bg-subtle";
