import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s — Marketplace Admin" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** Admin portal sections (Prompt 11). Live sections link; the rest show the phase that builds them. */
const SECTIONS: Array<{ label: string; href?: string; phase?: string }> = [
  { label: "Dashboard", href: "/" },
  { label: "Users & roles", href: "/users" },
  { label: "Catalogue", href: "/catalogue" },
  { label: "Audit log", href: "/audit" },
  { label: "Verification queue", href: "/providers?status=submitted" },
  { label: "Customers", href: "/customers" },
  { label: "Technicians", href: "/providers?kind=individual&status=all" },
  { label: "Companies", href: "/providers?kind=company&status=all" },
  { label: "Company employees", href: "/providers?kind=company_member&status=all" },
  { label: "Service requests", phase: "6" },
  { label: "Complaints", phase: "10" },
  { label: "Reports", phase: "11" },
  { label: "Settings", phase: "11" },
];

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col md:flex-row">
        <nav aria-label="Admin sections" className="border-b border-line bg-surface md:w-60 md:border-r md:border-b-0">
          <p className="px-4 py-3 font-bold">Marketplace Admin</p>
          <ul className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm md:flex-col md:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.label} className="shrink-0">
                {s.href ? (
                  <Link href={s.href} className="block rounded px-3 py-2 hover:bg-subtle">
                    {s.label}
                  </Link>
                ) : (
                  <span className="block px-3 py-2 text-muted" title={`Built in phase ${s.phase}`}>
                    {s.label} <span className="text-xs">· phase {s.phase}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </body>
    </html>
  );
}
