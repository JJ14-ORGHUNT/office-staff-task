import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import SignOutButton from "./SignOutButton";
import AdminNav from "./AdminNav";
import AdminMobileHeader from "./AdminMobileHeader";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "STAFF") redirect("/staff");

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-brand-surface min-h-screen">
      <AdminMobileHeader userName={session.name} />
      <aside className="hidden md:flex md:w-60 bg-brand-darker text-white md:flex-col shrink-0">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-base shrink-0">
            ✅
          </span>
          <div>
            <p className="text-sm font-extrabold leading-tight tracking-tight">Today&apos;s Work</p>
            <p className="text-brand-ink2 text-xs font-semibold">Admin Console</p>
          </div>
        </div>
        <AdminNav />
        <div className="px-5 py-4 border-t border-white/10 mt-2">
          <p className="text-sm text-brand-ink2 mb-2 truncate font-medium">{session.name}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-x-hidden min-w-0">{children}</main>
    </div>
  );
}
