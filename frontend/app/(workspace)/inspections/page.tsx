"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DataTable, Field, Notice, PageHeader, Panel, StatusBadge, fmtDate, inputClass } from "@/components/ui";
import type { Boiler, Session } from "@/types";

export default function InspectionsPage() {
  const router = useRouter();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ boiler_id: "", inspection_date: new Date().toISOString().slice(0, 10),
    inspection_type: "annual", method: "Visual, ultrasonic (SIMULATED), photographic", observations: "" });

  const boilers = useApiData(() => apiGet<Boiler[]>("/boilers"), []);
  const sessions = useApiData(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    return apiGet<Session[]>(`/inspections?${params.toString()}`);
  }, [q, status]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.boiler_id) return setFormError("Select a boiler.");
    setBusy(true);
    try {
      const created = await apiSend<Session>("POST", "/inspections", {
        boiler_id: Number(form.boiler_id), inspection_date: form.inspection_date, inspection_type: form.inspection_type,
        method: form.method, observations: form.observations || null, conditions: {},
      });
      router.push(`/inspections/${created.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create the inspection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Inspection" title="Inspection workspace & history"
        note="Each inspection is a traceable session. Evidence, measurements and defects recorded here are linked to a boiler component and kept as an auditable history." />

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Inspection history" className="xl:col-span-2"
          action={
            <div className="flex gap-2">
              <input className={`${inputClass} w-44`} placeholder="Search code or notes" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className={`${inputClass} w-36`} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="submitted">Submitted</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          }>
          {sessions.error && <Notice kind="error">{sessions.error}</Notice>}
          <DataTable headers={["Record", "Date", "Type", "Method", "Status", ""]}
            empty={sessions.loading ? "Loading…" : sessions.data?.length === 0 ? "No inspections match these filters." : undefined}>
            {sessions.data?.map((s) => (
              <tr key={s.id} className="hover:bg-graphite-700/40">
                <td className="px-3 py-2 font-mono text-steel-100">{s.code}</td>
                <td className="px-3 py-2 text-steel-300">{fmtDate(s.inspection_date)}</td>
                <td className="px-3 py-2 text-steel-400">{s.inspection_type.replace(/_/g, " ")}</td>
                <td className="max-w-[260px] truncate px-3 py-2 text-xs text-steel-400">{s.method}</td>
                <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                <td className="px-3 py-2 text-right"><Link href={`/inspections/${s.id}`} className="text-cyan hover:underline">Open →</Link></td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <Panel title="New inspection">
          {!can("inspection:write") ? (
            <Notice kind="info">Your role can view inspections but cannot create them. Ask an inspection engineer or administrator.</Notice>
          ) : (
            <form onSubmit={create} className="space-y-3">
              {formError && <Notice kind="error">{formError}</Notice>}
              <Field label="Boiler">
                <select className={inputClass} required value={form.boiler_id} onChange={(e) => setForm({ ...form, boiler_id: e.target.value })}>
                  <option value="">Select…</option>
                  {boilers.data?.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </Field>
              <Field label="Inspection date">
                <input type="date" className={inputClass} required value={form.inspection_date} onChange={(e) => setForm({ ...form, inspection_date: e.target.value })} />
              </Field>
              <Field label="Type">
                <select className={inputClass} value={form.inspection_type} onChange={(e) => setForm({ ...form, inspection_type: e.target.value })}>
                  <option value="annual">Annual</option>
                  <option value="online">Online</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="special">Special</option>
                </select>
              </Field>
              <Field label="Method" hint="State SIMULATED wherever data are not from real instruments.">
                <input className={inputClass} required minLength={3} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
              </Field>
              <Field label="Observations">
                <textarea className={inputClass} rows={3} maxLength={5000} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
              </Field>
              <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? "Creating…" : "Create inspection"}</Button>
            </form>
          )}
        </Panel>
      </div>
    </>
  );
}
