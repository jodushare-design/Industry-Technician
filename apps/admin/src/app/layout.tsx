import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Marketplace Admin" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

type Section = { label: string; href?: string; phase?: string; color: string; glyph: string };

/** Admin sections, grouped like a macOS sidebar. Live sections link; the rest show the phase that builds them. */
const GROUPS: Array<{ title: string; items: Section[] }> = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/", color: "bg-ios-blue", glyph: "◎" },
      { label: "Service requests", href: "/requests", color: "bg-ios-orange", glyph: "↗" },
      { label: "Complaints", href: "/complaints", color: "bg-ios-red", glyph: "!" },
    ],
  },
  {
    title: "People",
    items: [
      { label: "Verification queue", href: "/providers?status=submitted", color: "bg-ios-green", glyph: "✓" },
      { label: "Customers", href: "/customers", color: "bg-ios-teal", glyph: "C" },
      { label: "Technicians", href: "/providers?kind=individual&status=all", color: "bg-ios-indigo", glyph: "T" },
      { label: "Companies", href: "/providers?kind=company&status=all", color: "bg-ios-purple", glyph: "B" },
      { label: "Company employees", href: "/providers?kind=company_member&status=all", color: "bg-ios-pink", glyph: "E" },
      { label: "Users & roles", href: "/users", color: "bg-ios-mint", glyph: "U" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Catalogue", href: "/catalogue", color: "bg-ios-yellow", glyph: "≡" },
      { label: "Audit log", href: "/audit", color: "bg-ios-indigo", glyph: "⌘" },
      { label: "Reports", phase: "11", color: "bg-ios-blue", glyph: "▤" },
      { label: "Settings", phase: "11", color: "bg-ios-teal", glyph: "⚙" },
    ],
  },
];

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col md:flex-row">
        <nav aria-label="Admin sections" className="border-b border-line bg-elevated backdrop-blur-xl md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0">
          <div className="flex items-center gap-2.5 px-4 py-4">
            <span aria-hidden className="flex size-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-ios-red to-ios-orange text-sm font-bold text-white shadow-sm">A</span>
            <span className="font-semibold tracking-tight">Marketplace Admin</span>
          </div>
          {process.env.NEXT_PUBLIC_DEMO_MODE === "1" && (
            <p className="mx-3 mb-2 rounded-lg bg-orange-soft px-3 py-1.5 text-xs font-semibold text-warning">Local demo — fictional data</p>
          )}
          <div className="flex gap-4 overflow-x-auto px-2 pb-3 md:block md:space-y-4 md:overflow-visible">
            {GROUPS.map((g) => (
              <div key={g.title} className="shrink-0">
                <p className="hidden px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase md:block">{g.title}</p>
                <ul className="flex gap-1 md:block md:space-y-0.5">
                  {g.items.map((s) => (
                    <li key={s.label} className="shrink-0">
                      {s.href ? (
                        <Link href={s.href} className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-[14px] transition hover:bg-subtle">
                          <span aria-hidden className={`flex size-6 items-center justify-center rounded-[7px] text-[11px] font-bold text-white ${s.color}`}>{s.glyph}</span>
                          {s.label}
                        </Link>
                      ) : (
                        <span className="flex items-center gap-2.5 px-3 py-1.5 text-[14px] text-muted" title={`Built in phase ${s.phase}`}>
                          <span aria-hidden className={`flex size-6 items-center justify-center rounded-[7px] text-[11px] font-bold text-white opacity-40 ${s.color}`}>{s.glyph}</span>
                          {s.label} <span className="text-[11px]">· soon</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
      </body>
    </html>
  );
}
