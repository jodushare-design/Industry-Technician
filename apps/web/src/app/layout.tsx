import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { PLATFORM_DISCLAIMER_SHORT } from "@itm/ui";
import { NotificationBell } from "@/components/notification-bell";
import { MainNav } from "@/components/main-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Find an industrial technician — Hyderabad", template: "%s — Industrial Technician Marketplace" },
  description:
    "Find independent industrial technicians and service companies in Hyderabad. Chat, receive provider estimates and keep a record of your approvals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        {process.env.NEXT_PUBLIC_DEMO_MODE === "1" && (
          <div className="bg-gradient-to-r from-ios-orange to-ios-pink px-4 py-1.5 text-center text-xs font-semibold text-white">
            LOCAL DEMO — fictional people and data. Nothing here is real.
          </div>
        )}
        {/* Frosted, sticky navigation bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-elevated backdrop-blur-xl backdrop-saturate-150">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5 font-semibold">
              <span aria-hidden className="flex size-8 items-center justify-center rounded-[9px] bg-gradient-to-br from-ios-blue to-ios-indigo text-sm font-bold text-white shadow-sm">
                IT
              </span>
              <span className="text-[17px] tracking-tight">Industrial Technician Marketplace</span>
            </Link>
            <div className="flex flex-wrap items-center gap-1 text-[15px]">
              <MainNav />
              <span className="px-2"><NotificationBell /></span>
              <Link href="/account" className="rounded-full bg-blue-soft px-3.5 py-1.5 font-semibold text-accent transition hover:brightness-95">
                My account
              </Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">{children}</main>

        <footer className="mt-8 border-t border-line">
          <div className="mx-auto max-w-5xl space-y-3 px-4 py-8 text-[13px] text-muted">
            <p className="max-w-3xl">{PLATFORM_DISCLAIMER_SHORT}</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              <li><Link href="/legal/marketplace_description" className="hover:text-foreground">Marketplace Service Description</Link></li>
              <li><Link href="/legal/customer_terms" className="hover:text-foreground">Customer Terms</Link></li>
              <li><Link href="/legal/technician_terms" className="hover:text-foreground">Technician Terms</Link></li>
              <li><Link href="/legal/company_terms" className="hover:text-foreground">Service Company Terms</Link></li>
              <li><Link href="/legal/privacy_policy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link href="/complaints" className="hover:text-foreground">Complaints</Link></li>
              <li><Link href="/legal/grievance_policy" className="hover:text-foreground">Grievance Officer</Link></li>
            </ul>
          </div>
        </footer>
      </body>
    </html>
  );
}
