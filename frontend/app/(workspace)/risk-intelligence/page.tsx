"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, CategoryBadge, Empty, Field, Loading, Notice, PageHeader, Panel, fmtMm, inputClass } from "@/components/ui";
import { CATEGORIES } from "@/types";
import type { Boiler, Category, RiskAssessment } from "@/types";

export default function RiskIntelligencePage() {
  const { can } = useAuth();
  const boilers = useApiData(() => apiGet<Boiler[]>("/boilers"), []);
  const [boilerId, setBoilerId] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("component"));
    if (fromUrl) setOpenId(fromUrl);
  }, []);

  const risk = useApiData(() => {
    const p = new URLSearchParams();
    if (boilerId) p.set("boiler_id", boilerId);
    if (category) p.set("category", category);
    return apiGet<RiskAssessment[]>(`/risk?${p.toString()}`);
  }, [boilerId, category]);

  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Explainable risk intelligence"
        note="Components are placed in categories by ordered, readable rules. Each contributing factor cites the records behind it. The index only orders review work. It is not a probability of failure and is not calibrated against field data.">
        <div className="flex gap-2">
          <select className={`${inputClass} w-48`} value={boilerId} onChange={(e) => setBoilerId(e.target.value)}>
            <option value="">All boilers</option>
            {boilers.data?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
          </select>
        </div>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setCategory("")} className={`rounded border px-3 py-1 text-xs ${category === "" ? "border-cyan text-cyan" : "border-graphite-600 text-steel-400"}`}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={`rounded px-1 ${category === c ? "ring-1 ring-cyan" : ""}`}><CategoryBadge category={c} /></button>
        ))}
      </div>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      {risk.error && <Notice kind="error">{risk.error}</Notice>}
      {risk.loading && !risk.data && <Loading label="Applying risk rules" />}
      {risk.data?.length === 0 && <Empty>No components match this filter.</Empty>}

      <div className="space-y-3">
        {risk.data?.map((r) => {
          const open = openId === r.component_id;
          return (
            <Panel key={r.component_id} className={open ? "border-cyan/50" : ""}>
              <button className="flex w-full flex-wrap items-center gap-4 text-left" onClick={() => setOpenId(open ? null : r.component_id)} aria-expanded={open}>
                <div className="min-w-[200px]">
                  <div className="font-mono text-steel-100">{r.component_code}</div>
                  <div className="text-xs text-steel-500">{r.component_name}</div>
                </div>
                <CategoryBadge category={r.category} />
                <div className="flex items-center gap-2">
                  <div className="label-caps">index</div>
                  <div className="h-1.5 w-28 rounded bg-graphite-700"><div className="h-1.5 rounded bg-amber" style={{ width: `${r.priority_index}%` }} /></div>
                  <span className="font-mono text-xs text-steel-300">{r.priority_index}</span>
                </div>
                <div className="font-mono text-xs text-steel-400">min {fmtMm(r.latest_min_thickness_mm)} / req {fmtMm(r.min_required_thickness_mm)}</div>
                {r.engineering_status.reviewed && (
                  <span className="text-xs text-steel-400">Engineer: <span className="text-steel-200">{r.engineering_status.confirmed_category}</span>{r.engineering_status.differs_from_computed && <span className="ml-1 text-amber">(differs)</span>}</span>
                )}
                <span className="ml-auto label-caps text-cyan">{open ? "Hide" : "Explain"}</span>
              </button>

              {open && (
                <div className="mt-4 grid gap-5 border-t border-graphite-700 pt-4 lg:grid-cols-5">
                  <div className="space-y-3 lg:col-span-3">
                    <div className="label-caps">Contributing factors</div>
                    {r.factors.length === 0 && <Empty>No contributing factors. The component is routine or lacks evidence.</Empty>}
                    {r.factors.map((f, i) => (
                      <div key={i} className="rounded border border-graphite-600 bg-graphite-900/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <CategoryBadge category={f.category} />
                          <span className="text-sm font-medium text-steel-100">{f.factor}</span>
                          <span className="ml-auto font-mono text-xs text-steel-400">+{f.points} pts</span>
                        </div>
                        <p className="mt-1.5 text-sm text-steel-300">{f.detail}</p>
                        {f.evidence.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {f.evidence.map((ev, j) => (
                              <span key={j} className="rounded border border-graphite-600 px-1.5 py-0.5 font-mono text-[10px] text-steel-400">{ev.type} #{ev.id} · {ev.label}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4 lg:col-span-2">
                    <div>
                      <div className="label-caps mb-1">Recommended follow-up</div>
                      <p className="text-sm text-steel-300">{r.recommended_follow_up}</p>
                    </div>
                    <div>
                      <div className="label-caps mb-1">Data limitations</div>
                      <ul className="list-disc space-y-1 pl-4 text-xs text-steel-400">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                    </div>
                    <p className="text-[11px] leading-relaxed text-steel-500">{r.disclaimer}</p>
                    <ReviewForm assessment={r} canReview={can("risk:review")}
                      onSaved={async (text) => { setMessage({ kind: "success", text }); await risk.reload(); }}
                      onError={(text) => setMessage({ kind: "error", text })} />
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function ReviewForm({ assessment, canReview, onSaved, onError }: {
  assessment: RiskAssessment; canReview: boolean; onSaved: (t: string) => Promise<void>; onError: (t: string) => void;
}) {
  const [confirmed, setConfirmed] = useState<Category>(assessment.category);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!canReview) return <Notice kind="info">Only inspection engineers can record an engineering review of this category.</Notice>;
  return (
    <form className="space-y-2 rounded border border-graphite-600 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await apiSend("POST", `/components/${assessment.component_id}/risk-reviews`, { confirmed_category: confirmed, note });
          setNote("");
          await onSaved(`Engineering review recorded for ${assessment.component_code}.`);
        } catch (err) {
          onError(err instanceof Error ? err.message : "Review failed");
        } finally {
          setBusy(false);
        }
      }}>
      <div className="label-caps">Engineering review</div>
      <Field label="Confirmed category">
        <select className={inputClass} value={confirmed} onChange={(e) => setConfirmed(e.target.value as Category)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Reasoning (recorded with the audit trail)">
        <textarea className={inputClass} rows={2} minLength={5} maxLength={2000} required value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" disabled={busy || note.trim().length < 5} className="w-full">Record review</Button>
    </form>
  );
}
