"use client";

import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="w-full text-left text-xs font-bold uppercase tracking-wide bg-white/5 hover:bg-white/10 transition-colors px-3 py-2 rounded-lg"
    >
      Sign Out
    </button>
  );
}
