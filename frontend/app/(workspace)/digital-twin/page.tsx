"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { BoilerSchematic } from "@/components/BoilerSchematic";
import { Button, CategoryBadge, Empty, Field, Loading, Notice, PageHeader, Panel, fmtMm, inputClass } from "@/components/ui";
import type { Boiler, ComponentMemory, RiskAssessment, TwinComponent } from "@/types";

interface Twin {
  boiler: Boiler;
  is_conceptual_model: boolean;
  components: TwinComponent[];
}

export default function DigitalTwinPage() {
  const boilers = useApiData(() => apiGet<Boiler[]>("/boilers"), []);
  const [boilerId, setBoilerId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (boilerId === null && boilers.data?.[0]) setBoilerId(boilers.data[0].id);
  }, [boilers.data, boilerId]);

  const twin = useApiData(
    () => (boilerId ? apiGet<Twin>(`/boilers/${boilerId}/twin`) : Promise.resolve(null as unknown as Twin)),
    [boilerId],
  );

  const current = useMemo(
    () => twin.data?.components.find((c) => c.id === selected) ?? null,
    [twin.data, selected],
  );

  const detail = useApiData(
    async () => {
      if (!selected) return null;
      const [memory, risk] = await Promise.all([
        apiGet<ComponentMemory>(`/components/${selected}/memory`),
        apiGet<RiskAssessment>(`/components/${selected}/risk`),
      ]);
      return { memory, risk };
    },
    [selected],
  );

  if (boilers.loading && !boilers.data) return <Loading />;
  if (boilers.error) return <Notice kind="error">{boilers.error}</Notice>;

  const series = detail.data?.memory.thickness_series[0];

  return (
    <>
      <PageHeader eyebrow="Asset Intelligence" title="Interactive boiler digital twin"
        note="Conceptual sample boiler model for demonstration. It is not an accurate engineering drawing of any plant. Select a region to open its engineering panel.">
        <div className="w-72">
          <Field label="Boiler">
            <select className={inputClass} value={boilerId ?? ""} onChange={(e) => { setBoilerId(Number(e.target.value)); setSelected(null); }}>
              {boilers.data?.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
            </select>
          </Field>
        </div>
      </PageHeader>

      {twin.error && <Notice kind="error">{twin.error}</Notice>}

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel title="Schematic · select a component" className="xl:col-span-3">
          {twin.loading && !twin.data ? <Loading label="Loading model" /> : twin.data && (
            <BoilerSchematic components={twin.data.components} selectedId={selected} onSelect={setSelected} />
          )}
          {twin.data && (
            <div className="mt-4 grid gap-2 border-t border-graphite-700 pt-3 text-xs text-steel-400 md:grid-cols-2">
              {twin.data.components.map((c) => (
                <button key={c.id} onClick={() => setSelected(c.id)}
                  className={`flex items-center justify-between rounded px-2 py-1.5 text-left hover:bg-graphite-700 ${c.id === selected ? "bg-cyan/10 text-cyan" : ""}`}>
                  <span className="font-mono">{c.code}</span>
                  <CategoryBadge category={c.risk_category} />
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Component engineering panel" className="xl:col-span-2">
          <AnimatePresence mode="wait">
            {!current ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Empty>Select a component in the schematic or the list to inspect its record, measurements and priority.</Empty>
              </motion.div>
            ) : (
              <motion.div key={current.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }} className="space-y-4">
                <div>
                  <div className="font-mono text-base text-steel-100">{current.code}</div>
                  <div className="text-sm text-steel-400">{current.name} · {current.category}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CategoryBadge category={current.risk_category} />
                  <span className="font-mono text-xs text-steel-400">index {current.priority_index} (indicative)</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="label-caps">Nominal</dt><dd className="font-mono">{fmtMm(current.nominal_thickness_mm)}</dd>
                  <dt className="label-caps">Min. required (demo)</dt><dd className="font-mono">{fmtMm(current.min_required_thickness_mm)}</dd>
                  <dt className="label-caps">Latest minimum</dt><dd className="font-mono">{fmtMm(current.latest_min_thickness_mm)}</dd>
                  <dt className="label-caps">Inspections on record</dt><dd className="font-mono">{current.inspections}</dd>
                  <dt className="label-caps">Open findings</dt><dd className="font-mono">{current.open_findings}</dd>
                  <dt className="label-caps">Flagged changes</dt><dd className="font-mono">{current.flagged_changes}</dd>
                </dl>

                {series && (
                  <div>
                    <div className="label-caps mb-1">Thickness trend · {series.location_label}</div>
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={series.points.map((p) => ({ session: p.session_id, value: p.value }))}>
                          <CartesianGrid stroke="#2a313c" strokeDasharray="3 3" />
                          <XAxis dataKey="session" hide />
                          <YAxis domain={["auto", "auto"]} stroke="#6b7584" fontSize={10} width={40} />
                          <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #2a313c", fontSize: 12 }} />
                          {current.min_required_thickness_mm !== null && (
                            <ReferenceLine y={current.min_required_thickness_mm} stroke="#ff5c39" strokeDasharray="4 3" label={{ value: "min", fill: "#ff5c39", fontSize: 10 }} />
                          )}
                          <Line type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {detail.data?.risk && (
                  <div className="rounded border border-graphite-600 bg-graphite-900/60 p-3 text-sm">
                    <div className="label-caps mb-1">Recommended next action</div>
                    <p className="text-steel-300">{detail.data.risk.recommended_follow_up}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link href={`/boiler-memory?component=${current.id}`}><Button variant="primary">Boiler memory</Button></Link>
                  <Link href={`/risk-intelligence?component=${current.id}`}><Button>Risk factors</Button></Link>
                  <Link href="/defect-intelligence"><Button variant="ghost">Defect intelligence</Button></Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </div>
    </>
  );
}
