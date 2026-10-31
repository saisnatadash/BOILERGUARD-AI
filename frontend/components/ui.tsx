"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import type { Category } from "@/types";

export function PageHeader({ eyebrow, title, children, note }: { eyebrow: string; title: string; children?: React.ReactNode; note?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-graphite-600 pb-4">
      <div>
        <div className="label-caps text-cyan">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-steel-100">{title}</h1>
        {note && <p className="mt-1 max-w-3xl text-sm text-steel-400">{note}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-graphite-600 bg-graphite-800/90 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-graphite-600 px-4 py-2.5">
          {title && <h2 className="label-caps text-steel-300">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, tone = "default", hint }: { label: string; value: React.ReactNode; tone?: "default" | "amber" | "cyan" | "ok" | "crit"; hint?: string }) {
  const toneClass = {
    default: "text-steel-100",
    amber: "text-amber",
    cyan: "text-cyan",
    ok: "text-ok",
    crit: "text-crit",
  }[tone];
  return (
    <div className="rounded-md border border-graphite-600 bg-graphite-800/80 px-4 py-3">
      <div className="label-caps">{label}</div>
      <div className={`mt-1 font-mono text-2xl tabular-nums ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-steel-500">{hint}</div>}
    </div>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  "Critical Review": "border-crit/60 bg-crit/10 text-crit",
  "High Priority": "border-amber/60 bg-amber/10 text-amber",
  "Moderate Priority": "border-amber-dim bg-amber/5 text-amber/80",
  "Routine Monitoring": "border-ok/50 bg-ok/10 text-ok",
  "Insufficient Evidence": "border-steel-500/60 bg-graphite-700 text-steel-300",
};

export function CategoryBadge({ category }: { category: Category | string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${CATEGORY_STYLES[category] ?? CATEGORY_STYLES["Insufficient Evidence"]}`}>
      {category}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  ai_suspected: "border-amber/60 text-amber",
  engineer_verified: "border-ok/60 text-ok",
  rejected: "border-steel-500 text-steel-400 line-through",
  requires_further_testing: "border-cyan/60 text-cyan",
  open: "border-cyan/60 text-cyan",
  submitted: "border-steel-400 text-steel-200",
  closed: "border-ok/50 text-ok",
  draft: "border-steel-500 text-steel-300",
  planned: "border-steel-400 text-steel-200",
  completed: "border-ok/50 text-ok",
  done: "border-ok/50 text-ok",
  in_progress: "border-cyan/60 text-cyan",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${STATUS_STYLES[status] ?? "border-steel-500 text-steel-300"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function DemoTag({ children = "SIMULATED" }: { children?: React.ReactNode }) {
  return <span className="ml-1.5 rounded-sm border border-amber/50 px-1 font-mono text-[9.5px] uppercase tracking-wider text-amber">{children}</span>;
}

export function Notice({ kind, children }: { kind: "error" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "border-crit/50 bg-crit/10 text-crit",
    success: "border-ok/50 bg-ok/10 text-ok",
    info: "border-cyan/40 bg-cyan/5 text-cyan",
    warning: "border-amber/50 bg-amber/10 text-amber",
  }[kind];
  const Icon = kind === "error" || kind === "warning" ? AlertTriangle : kind === "success" ? CheckCircle2 : Info;
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-4 flex items-start gap-2 rounded border px-3 py-2 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-steel-400">
      <Loader2 className="h-4 w-4 animate-spin text-cyan" /> {label}…
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded border border-dashed border-graphite-600 px-4 py-8 text-center text-sm text-steel-500">{children}</div>;
}

export const inputClass =
  "w-full rounded border border-graphite-600 bg-graphite-900 px-2.5 py-1.5 text-sm text-steel-100 placeholder:text-steel-500 focus:border-cyan/70 focus:outline-none focus:ring-1 focus:ring-cyan/40 disabled:opacity-50";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-caps mb-1 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-steel-500">{hint}</span>}
    </label>
  );
}

export function Button({
  children, variant = "default", type = "button", disabled, onClick, className = "", title,
}: {
  children: React.ReactNode; variant?: "default" | "primary" | "danger" | "ghost"; type?: "button" | "submit";
  disabled?: boolean; onClick?: () => void; className?: string; title?: string;
}) {
  const styles = {
    default: "border-graphite-600 bg-graphite-700 text-steel-100 hover:border-steel-400",
    primary: "border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25",
    danger: "border-crit/60 bg-crit/10 text-crit hover:bg-crit/20",
    ghost: "border-transparent bg-transparent text-steel-300 hover:text-steel-100",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function DataTable({ headers, children, empty }: { headers: string[]; children: React.ReactNode; empty?: string }) {
  return (
    <div className="scroll-thin overflow-x-auto rounded border border-graphite-600">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-graphite-900/80">
          <tr>
            {headers.map((h) => (
              <th key={h} className="label-caps whitespace-nowrap border-b border-graphite-600 px-3 py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-graphite-700">{children}</tbody>
      </table>
      {empty && <div className="px-3 py-6 text-center text-sm text-steel-500">{empty}</div>}
    </div>
  );
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export const fmtMm = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(2)} mm`);
