"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Home", icon: true },
  { href: "/machines", label: "Machines" },
  { href: "/requests", label: "My requests" },
  { href: "/work", label: "Work" },
] as const;

/** Main menu links; the current section is highlighted. */
export function MainNav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <>
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
              active ? "bg-subtle font-semibold text-foreground" : "text-foreground/80 hover:bg-subtle hover:text-foreground"
            }`}
          >
            {"icon" in item && (
              <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3.2 2.5 11a1 1 0 0 0 1.3 1.5l.7-.6V20a1 1 0 0 0 1 1H10v-6h4v6h4.5a1 1 0 0 0 1-1v-8.1l.7.6A1 1 0 1 0 21.5 11Z" />
              </svg>
            )}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
