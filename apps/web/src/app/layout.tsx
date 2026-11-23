import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PLATFORM_DISCLAIMER_SHORT } from "@itm/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Find an industrial technician — Hyderabad", template: "%s — Industrial Technician Marketplace" },
  description:
    "Find independent industrial technicians and service companies in Hyderabad. Chat, receive provider estimates and keep a record of your approvals.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-surface">
          <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="font-bold">
              Industrial Technician Marketplace
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/machines" className="hover:underline">
                Machines
              </Link>
              <Link href="/requests" className="hover:underline">
                My requests
              </Link>
              <Link href="/work" className="hover:underline">
                Work
              </Link>
              <Link href="/account" className="hover:underline">
                My account
              </Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto max-w-5xl space-y-3 px-4 py-6 text-sm text-muted">
            <p>{PLATFORM_DISCLAIMER_SHORT}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              <li><Link href="/legal/marketplace_description" className="hover:underline">Marketplace Service Description</Link></li>
              <li><Link href="/legal/customer_terms" className="hover:underline">Customer Terms</Link></li>
              <li><Link href="/legal/technician_terms" className="hover:underline">Technician Terms</Link></li>
              <li><Link href="/legal/company_terms" className="hover:underline">Service Company Terms</Link></li>
              <li><Link href="/legal/privacy_policy" className="hover:underline">Privacy</Link></li>
              <li><Link href="/legal/grievance_policy" className="hover:underline">Grievance Officer &amp; complaints</Link></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
