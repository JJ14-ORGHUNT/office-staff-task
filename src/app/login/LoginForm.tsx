"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "staff" | "admin";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("staff");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitStaff(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeCode, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not sign in.");
        return;
      }
      // A trailing router.refresh() here used to race this push() -- refresh
      // re-fetches whatever route is *currently* mounted (still /login at
      // this exact synchronous point, since push()'s navigation is async),
      // and that redundant fetch could resolve after push()'s and clobber it,
      // landing back on /login despite a successful sign-in. push() already
      // performs its own fresh server fetch for /staff (carrying the
      // just-set session cookie), so no follow-up refresh is needed.
      router.push("/staff");
    } finally {
      setLoading(false);
    }
  }

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not sign in.");
        return;
      }
      // See the matching comment in submitStaff -- the trailing refresh()
      // this used to have raced push()'s own navigation and could bounce
      // the user back to /login after a genuinely successful sign-in.
      router.push("/admin");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-brand-surface px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-9">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-brand-darker flex items-center justify-center">
            <span className="text-4xl">✅</span>
          </div>
          <h1 className="text-3xl font-extrabold text-brand-darker tracking-tight">Today&apos;s Work</h1>
          <p className="text-brand-ink2 mt-1.5 text-base font-medium">Sign in to see your tasks</p>
        </div>

        <div className="grid grid-cols-2 gap-1 mb-6 bg-white rounded-2xl p-1.5">
          <button
            type="button"
            onClick={() => setMode("staff")}
            className={`py-3 rounded-xl text-base font-bold uppercase tracking-wide transition-all ${
              mode === "staff" ? "bg-brand text-white" : "text-brand-ink2 hover:text-brand-darker"
            }`}
          >
            Staff
          </button>
          <button
            type="button"
            onClick={() => setMode("admin")}
            className={`py-3 rounded-xl text-base font-bold uppercase tracking-wide transition-all ${
              mode === "admin" ? "bg-brand text-white" : "text-brand-ink2 hover:text-brand-darker"
            }`}
          >
            Admin
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-white border-l-4 border-brand-critical text-brand-darker px-4 py-3 text-base font-medium">
            {error}
          </div>
        )}

        {mode === "staff" ? (
          <form onSubmit={submitStaff} className="space-y-4">
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                Employee ID
              </label>
              <input
                autoFocus
                inputMode="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="e.g. EMP001"
                suppressHydrationWarning
                className="w-full text-xl font-medium rounded-xl border-2 border-transparent bg-white px-4 py-4 focus:border-brand focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-digit PIN"
                suppressHydrationWarning
                className="w-full text-xl font-medium rounded-xl border-2 border-transparent bg-white px-4 py-4 focus:border-brand focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white text-lg font-extrabold uppercase tracking-wide py-4 rounded-xl transition-colors active:scale-[0.98]"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                Email
              </label>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                suppressHydrationWarning
                className="w-full text-xl font-medium rounded-xl border-2 border-transparent bg-white px-4 py-4 focus:border-brand focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-bold uppercase tracking-wide text-brand-ink2 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                suppressHydrationWarning
                className="w-full text-xl font-medium rounded-xl border-2 border-transparent bg-white px-4 py-4 focus:border-brand focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white text-lg font-extrabold uppercase tracking-wide py-4 rounded-xl transition-colors active:scale-[0.98]"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
