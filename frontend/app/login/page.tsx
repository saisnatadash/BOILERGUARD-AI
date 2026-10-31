"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, Field, Notice, inputClass } from "@/components/ui";

const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@boilerguard.demo", password: "Admin@12345" },
  { role: "Inspection Engineer", email: "engineer@boilerguard.demo", password: "Engineer@12345" },
  { role: "Maintenance Manager", email: "manager@boilerguard.demo", password: "Manager@12345" },
  { role: "Viewer", email: "viewer@boilerguard.demo", password: "Viewer@12345" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-bg grid min-h-screen place-items-center bg-graphite-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="rounded-xl bg-white p-4 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/boilerguard-logo.png" alt="BOILERGUARD AI — Robotic inspection and predictive boiler integrity intelligence" className="h-auto w-64" />
          </div>
          <div className="label-caps mt-4 text-cyan">Intelligent boiler inspection · predictive integrity</div>
        </div>
        <form onSubmit={submit} className="rounded-md border border-graphite-600 bg-graphite-800/95 p-6">
          <div className="mb-4 flex items-center gap-2 text-sm text-steel-300">
            <ShieldCheck className="h-4 w-4 text-ok" /> Sign in to the inspection console
          </div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="space-y-4">
            <Field label="Email">
              <input className={inputClass} type="email" autoComplete="username" required value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className={inputClass} type="password" autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={busy} className="mt-5 w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-5 rounded-md border border-amber/30 bg-graphite-800/70 p-4">
          <div className="label-caps mb-2 text-amber">Demonstration accounts (sample data only)</div>
          <div className="grid gap-1.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" onClick={() => { setEmail(a.email); setPassword(a.password); }}
                className="flex items-center justify-between rounded px-2 py-1.5 text-left text-xs text-steel-300 hover:bg-graphite-700">
                <span>{a.role}</span>
                <span className="font-mono text-steel-500">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-steel-500">
          Decision-support prototype. Outputs are not safety certifications and do not replace review by a qualified engineer
          under the applicable regulations.
        </p>
      </div>
    </div>
  );
}
