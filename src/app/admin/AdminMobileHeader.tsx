"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_NAV_ITEMS, isNavItemActive } from "./AdminNav";

// Mobile-only top bar + slide-in drawer, standing in for the desktop sidebar
// below the `md` breakpoint (see admin/layout.tsx, which hides the sidebar
// entirely on mobile). Keeps the same nav items and sign-out action reachable
// one-handed on a phone instead of a pinned sidebar eating screen width.
export default function AdminMobileHeader({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically on navigation. Derived during render
  // (rather than an effect) per React's "adjusting state when a prop
  // changes" pattern -- avoids an extra render pass from setState-in-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="md:hidden">
      <header className="sticky top-0 z-30 bg-brand-darker text-white flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-base shrink-0">
            ✅
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold leading-tight tracking-tight truncate">Today&apos;s Work</p>
            <p className="text-brand-ink2 text-[11px] font-semibold truncate">Admin Console</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="shrink-0 w-11 h-11 -mr-1.5 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-2xl leading-none active:scale-[0.96]"
        >
          ☰
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Dismiss menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <nav className="relative w-72 max-w-[85vw] h-full bg-brand-darker text-white flex flex-col shadow-xl">
            <div className="px-5 py-5 flex items-center justify-between gap-2.5 border-b border-white/10">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-base shrink-0">
                  ✅
                </span>
                <p className="text-sm font-extrabold leading-tight tracking-tight truncate">Today&apos;s Work</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors text-xl leading-none active:scale-[0.96]"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {ADMIN_NAV_ITEMS.map((item) => {
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-3.5 flex items-center gap-3 text-base rounded-xl transition-colors font-semibold ${
                      active ? "bg-brand text-white" : "text-brand-ink2 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-white/10">
              <p className="text-sm text-brand-ink2 mb-2 truncate font-medium">{userName}</p>
              <button
                onClick={signOut}
                className="w-full text-left text-xs font-bold uppercase tracking-wide bg-white/5 hover:bg-white/10 transition-colors px-3 py-3 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
