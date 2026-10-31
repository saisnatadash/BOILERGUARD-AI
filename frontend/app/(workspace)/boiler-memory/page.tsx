"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import {
  DataTable, DemoTag, Empty, Field, Loading, Notice, PageHeader, Panel, StatusBadge, Stat, fmtDate, fmtMm, inputClass,
} from "@/components/ui";
import type { Component, ComponentMemory } from "@/types";

const SERIES_COLOURS = ["#22d3ee", "#f5a623", "#3fb950", "#c084fc", "#60a5fa"];

export default function BoilerMemoryPage() {
  const components = useApiData(() => apiGet<Component[]>("/components"), []);
  const [componentId, setComponentId] = useState<number | null>(null);

  useEffect(() => {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("component"));
    if (fromUrl) setComponentId(fromUrl);
  }, []);

  useEffect(() => {
    if (componentId === null && components.data?.[0]) setComponentId(components.data[0].id);
  }, [components.data, componentId]);

  const memory = useApiData(
    () => (componentId ? apiGet<ComponentMemory>(`/components/${componentId}/memory`) : Promise.resolve(null as unknown as ComponentMemory)),
    [componentId],
  );

  const chartData = useMemo(() => {
    if (!memory.data) return [];
    const bySession = new Map<string, Record<string, number | string>>();
    memory.data.thickness_series.forEach((series) => {
      series.points.forEach((p) => {
        const session = memory.data!.timeline.find((t) => t.session_id === p.session_id)?.session_code ?? `S${p.session_id}`;
        const row = bySession.get(session) ?? { session };
        row[series.location_key] = p.value;
        bySession.set(session, row);
      });
    });
    return Array.from(bySession.values());
  }, [memory.data]);

  if (components.loading && !components.data) return <Loading />;
  if (components.error) return <Notice kind="error">{components.error}</Notice>;
  const m = memory.data;

  return (
    <>
      <PageHeader eyebrow="Intelligence" title="Boiler Memory Engine"
        note="A persistent, component-level record. Each new inspection is associated with its component and compared only with comparable earlier readings. The engine reports observed change and never extrapolates deterioration rates or failure dates.">
        <div className="w-96">
          <Field label="Component">
            <select className={inputClass} value={componentId ?? ""} onChange={(e) => setComponentId(Number(e.target.value))}>
              {components.data?.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </select>
          </Field>
        </div>
      </PageHeader>

      {memory.error && <Notice kind="error">{memory.error}</Notice>}
      {memory.loading && !m && <Loading label="Reconstructing component memory" />}

      {m && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Inspections on record" value={m.record_counts.inspections} hint={`${m.record_counts.measurements} measurement(s)`} />
            <Stat label="Comparable pairs" value={m.record_counts.comparable_pairs} hint="same method, location, unit, quality" />
            <Stat label="Latest minimum" value={fmtMm(m.latest_min_thickness_mm)} tone="cyan" hint={`Required (demo): ${fmtMm(m.component.min_required_thickness_mm)}`} />
            <Stat label="Flagged changes" value={m.flagged_changes.length} tone={m.flagged_changes.length ? "amber" : "default"} hint="latest inspection" />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-5">
            <Panel title="Measurement history · wall thickness" className="xl:col-span-3">
              {chartData.length === 0 ? <Empty>No wall-thickness readings recorded for this component.</Empty> : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#2a313c" strokeDasharray="3 3" />
                      <XAxis dataKey="session" stroke="#6b7584" fontSize={11} />
                      <YAxis domain={["auto", "auto"]} stroke="#6b7584" fontSize={11} width={48} />
                      <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #2a313c", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {m.component.min_required_thickness_mm !== null && (
                        <ReferenceLine y={m.component.min_required_thickness_mm} stroke="#ff5c39" strokeDasharray="4 3"
                          label={{ value: "demo min", fill: "#ff5c39", fontSize: 10, position: "insideTopRight" }} />
                      )}
                      {m.thickness_series.map((s, i) => (
                        <Line key={s.location_key} type="monotone" dataKey={s.location_key} name={s.location_label}
                          stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="mt-2 text-xs text-steel-500">Values are stored records. Points marked SIMULATED in the tables below are demonstration data, not plant measurements.</p>
            </Panel>

            <Panel title="Flagged for engineering review" className="xl:col-span-2">
              {m.flagged_changes.length === 0 && <Empty>No change in the latest inspection exceeds the review threshold.</Empty>}
              <ul className="space-y-3">
                {m.flagged_changes.map((c) => (
                  <li key={c.current_id} className="rounded border border-amber/40 bg-amber/5 p-3 text-sm">
                    <div className="font-mono text-amber">−{c.loss_mm?.toFixed(2)} mm · {c.location_label ?? c.location_key}</div>
                    <p className="mt-1 text-steel-300">{c.message}</p>
                    <p className="mt-1 text-xs text-steel-500">
                      Previous {fmtMm(c.previous_value)} → current {fmtMm(c.current_value)}
                      {c.loss_pct_of_nominal !== null && ` · ${c.loss_pct_of_nominal.toFixed(1)}% of nominal`}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-graphite-700 pt-3">
                <div className="label-caps mb-2">Limitations and data quality</div>
                <ul className="list-disc space-y-1 pl-4 text-xs text-steel-400">
                  {m.limitations.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            </Panel>
          </div>

          <Panel title="Inspection timeline" className="mt-5">
            <div className="scroll-thin flex gap-3 overflow-x-auto pb-1">
              {m.timeline.map((t) => (
                <div key={t.session_id} className="min-w-[230px] rounded border border-graphite-600 bg-graphite-900/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-steel-100">{t.session_code}</span>
                    {t.is_demo && <DemoTag />}
                  </div>
                  <div className="text-xs text-steel-500">{fmtDate(t.inspection_date)} · <StatusBadge status={t.session_status} /></div>
                  <div className="mt-2 space-y-1 text-xs">
                    {t.measurements.map((x) => (
                      <div key={x.id} className="flex justify-between font-mono text-steel-300">
                        <span className="truncate pr-2">{x.location_key}</span>
                        <span>{x.value.toFixed(2)} mm{x.quality !== "good" && <span className="ml-1 text-amber">[{x.quality}]</span>}</span>
                      </div>
                    ))}
                    {t.measurements.length === 0 && <div className="text-steel-500">No measurements</div>}
                  </div>
                  {t.new_abnormalities.length > 0 && (
                    <div className="mt-2 rounded border border-amber/40 px-2 py-1 text-[11px] text-amber">
                      New: {t.new_abnormalities.map((d) => d.category.replace(/_/g, " ")).join(", ")}
                    </div>
                  )}
                </div>
              ))}
              {m.timeline.length === 0 && <Empty>No inspection history for this component yet.</Empty>}
            </div>
          </Panel>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel title="Historical comparison">
              <DataTable headers={["Location", "Previous → current", "Loss (mm)", "Result"]}
                empty={m.comparisons.length === 0 ? "No earlier reading exists at the same location." : undefined}>
                {m.comparisons.map((c) => (
                  <tr key={c.current_id} className="align-top hover:bg-graphite-700/40">
                    <td className="px-3 py-2 font-mono text-xs text-steel-300">{c.location_key}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{fmtMm(c.previous_value)} → {fmtMm(c.current_value)}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{c.loss_mm === null ? "—" : c.loss_mm.toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.comparable
                        ? <span className={c.flagged ? "text-amber" : "text-steel-400"}>{c.flagged ? "Flagged" : c.significant ? "Significant" : "Within threshold"}</span>
                        : <span className="text-steel-500">Not comparable: {c.reasons.join("; ")}</span>}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>

            <Panel title="Defect progression by category">
              <DataTable headers={["Category", "State", "Observations"]}
                empty={m.defect_progression.length === 0 ? "No abnormalities recorded for this component." : undefined}>
                {m.defect_progression.map((d) => (
                  <tr key={d.category} className="align-top">
                    <td className="px-3 py-2 text-sm text-steel-200">{d.category.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-xs text-steel-400">{d.state.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-xs">
                      {d.observations.map((o) => (
                        <div key={o.defect_id} className="flex items-center gap-2 py-0.5">
                          <span className="font-mono text-steel-500">#{o.defect_id}</span>
                          <StatusBadge status={o.status} />
                          {o.area_fraction !== null && <span className="font-mono text-steel-400">{(o.area_fraction * 100).toFixed(2)}%</span>}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
