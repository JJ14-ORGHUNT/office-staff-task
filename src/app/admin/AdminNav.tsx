"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const ADMIN_NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/board", label: "Board", icon: "🗂️" },
  { href: "/admin/calendar", label: "Calendar", icon: "📅" },
  { href: "/admin/employees", label: "Employees", icon: "👥" },
  { href: "/admin/tasks", label: "Tasks", icon: "📋" },
  { href: "/admin/extra-work", label: "Extra Work", icon: "🎙️" },
  { href: "/admin/reports", label: "Reports", icon: "📈" },
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

// Desktop/tablet sidebar navigation. Below `md`, the sidebar is replaced
// entirely by AdminMobileHeader's slide-in drawer (see admin/layout.tsx) --
// this component renders nothing on narrow viewports.
export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex md:flex-col flex-1 md:gap-1 md:px-3">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-3 flex items-center gap-2.5 text-base rounded-xl transition-colors font-semibold ${
              active
                ? "bg-brand text-white"
                : "text-brand-ink2 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
