"use client";

import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DataTable, DemoTag, Field, Notice, PageHeader, Panel, fmtMm, inputClass } from "@/components/ui";
import type { Boiler, Component, Plant } from "@/types";

type Tab = "plants" | "boilers" | "components";

export default function AssetsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("components");
  const [q, setQ] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const plants = useApiData(() => apiGet<Plant[]>("/plants"), []);
  const boilers = useApiData(() => apiGet<Boiler[]>(`/boilers?q=${encodeURIComponent(q)}`), [q]);
  const components = useApiData(() => apiGet<Component[]>(`/components?q=${encodeURIComponent(q)}`), [q]);

  const [plant, setPlant] = useState({ code: "", name: "", location: "" });
  const [boiler, setBoiler] = useState({ plant_id: "", code: "", name: "", boiler_type: "", rated_capacity_tph: "", design_pressure_bar: "", commissioned_year: "" });
  const [comp, setComp] = useState({ boiler_id: "", code: "", name: "", category: "Economiser", diagram_key: "eco-1", nominal_thickness_mm: "", min_required_thickness_mm: "", material: "" });

  async function submit(path: string, body: unknown, ok: string, reset: () => void) {
    try {
      await apiSend("POST", path, body);
      setMessage({ kind: "success", text: ok });
      reset();
      await Promise.all([plants.reload(), boilers.reload(), components.reload()]);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not save" });
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "components", label: "Component registry" },
    { key: "boilers", label: "Boilers" },
    { key: "plants", label: "Plants" },
  ];

  return (
    <>
      <PageHeader eyebrow="Asset Intelligence" title="Plants, boilers & component registry"
        note="Every component has a stable code and its nominal and minimum-required thickness. Those thresholds are demonstration values and must be replaced with plant-approved design data.">
        <input className={`${inputClass} w-64`} placeholder="Search code, name, type…" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="mb-5 flex gap-1 border-b border-graphite-600">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.key ? "border-cyan text-cyan" : "border-transparent text-steel-400 hover:text-steel-100"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "components" && (
        <div className="grid gap-5 xl:grid-cols-5">
          <Panel title={`Components (${components.data?.length ?? 0})`} className="xl:col-span-3">
            <DataTable headers={["Code", "Name", "Category", "Diagram region", "Nominal", "Min. required"]}
              empty={components.data?.length === 0 ? "No components match the search." : undefined}>
              {components.data?.map((c) => (
                <tr key={c.id} className="hover:bg-graphite-700/40">
                  <td className="px-3 py-2 font-mono text-steel-100">{c.code}</td>
                  <td className="px-3 py-2 text-steel-300">{c.name}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{c.category}</td>
                  <td className="px-3 py-2 font-mono text-xs text-steel-500">{c.diagram_key}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtMm(c.nominal_thickness_mm)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{fmtMm(c.min_required_thickness_mm)}<DemoTag /></td>
                </tr>
              ))}
            </DataTable>
          </Panel>
          <Panel title="Register component" className="xl:col-span-2">
            {!can("asset:write") ? <Notice kind="info">Your role can view the registry but cannot add components.</Notice> : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit("/components", {
                boiler_id: Number(comp.boiler_id), code: comp.code.toUpperCase(), name: comp.name, category: comp.category,
                diagram_key: comp.diagram_key, nominal_thickness_mm: comp.nominal_thickness_mm ? Number(comp.nominal_thickness_mm) : null,
                min_required_thickness_mm: comp.min_required_thickness_mm ? Number(comp.min_required_thickness_mm) : null, material: comp.material || null,
              }, "Component registered.", () => setComp({ ...comp, code: "", name: "" })); }}>
                <Field label="Boiler"><select required className={inputClass} value={comp.boiler_id} onChange={(e) => setComp({ ...comp, boiler_id: e.target.value })}>
                  <option value="">Select…</option>{boilers.data?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code"><input required pattern="[A-Za-z0-9-]{3,60}" className={inputClass} value={comp.code} onChange={(e) => setComp({ ...comp, code: e.target.value })} /></Field>
                  <Field label="Name"><input required minLength={3} className={inputClass} value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category"><select className={inputClass} value={comp.category} onChange={(e) => setComp({ ...comp, category: e.target.value })}>
                    {["Furnace", "Water walls", "Superheater", "Reheater", "Economiser", "Steam drum", "Headers"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                  <Field label="Diagram region"><select className={inputClass} value={comp.diagram_key} onChange={(e) => setComp({ ...comp, diagram_key: e.target.value })}>
                    {["furnace", "ww-left", "ww-right", "sh", "rh", "eco-1", "eco-2", "drum", "hdr-fw", "hdr-ms"].map((c) => <option key={c}>{c}</option>)}</select></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nominal (mm)"><input type="number" step="0.1" min="0.1" className={inputClass} value={comp.nominal_thickness_mm} onChange={(e) => setComp({ ...comp, nominal_thickness_mm: e.target.value })} /></Field>
                  <Field label="Min. required (mm)"><input type="number" step="0.1" min="0.1" className={inputClass} value={comp.min_required_thickness_mm} onChange={(e) => setComp({ ...comp, min_required_thickness_mm: e.target.value })} /></Field>
                </div>
                <Button type="submit" variant="primary" className="w-full">Register component</Button>
              </form>
            )}
          </Panel>
        </div>
      )}

      {tab === "boilers" && (
        <div className="grid gap-5 xl:grid-cols-5">
          <Panel title={`Boilers (${boilers.data?.length ?? 0})`} className="xl:col-span-3">
            <DataTable headers={["Code", "Name", "Type", "Capacity", "Pressure", "Year"]}>
              {boilers.data?.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-mono text-steel-100">{b.code}{b.is_demo && <DemoTag />}</td>
                  <td className="px-3 py-2 text-steel-300">{b.name}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{b.boiler_type}</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.rated_capacity_tph} t/h</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.design_pressure_bar} bar</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.commissioned_year ?? "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
          <Panel title="Register boiler" className="xl:col-span-2">
            {!can("asset:write") ? <Notice kind="info">Your role cannot register boilers.</Notice> : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit("/boilers", {
                plant_id: Number(boiler.plant_id), code: boiler.code.toUpperCase(), name: boiler.name, boiler_type: boiler.boiler_type,
                rated_capacity_tph: Number(boiler.rated_capacity_tph), design_pressure_bar: Number(boiler.design_pressure_bar),
                commissioned_year: boiler.commissioned_year ? Number(boiler.commissioned_year) : null,
              }, "Boiler registered.", () => setBoiler({ ...boiler, code: "", name: "" })); }}>
                <Field label="Plant"><select required className={inputClass} value={boiler.plant_id} onChange={(e) => setBoiler({ ...boiler, plant_id: e.target.value })}>
                  <option value="">Select…</option>{plants.data?.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Code"><input required pattern="[A-Za-z0-9-]{3,40}" className={inputClass} value={boiler.code} onChange={(e) => setBoiler({ ...boiler, code: e.target.value })} /></Field>
                  <Field label="Name"><input required minLength={3} className={inputClass} value={boiler.name} onChange={(e) => setBoiler({ ...boiler, name: e.target.value })} /></Field>
                </div>
                <Field label="Boiler type"><input required minLength={3} className={inputClass} value={boiler.boiler_type} onChange={(e) => setBoiler({ ...boiler, boiler_type: e.target.value })} /></Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="t/h"><input required type="number" step="0.1" min="0.1" className={inputClass} value={boiler.rated_capacity_tph} onChange={(e) => setBoiler({ ...boiler, rated_capacity_tph: e.target.value })} /></Field>
                  <Field label="Bar"><input required type="number" step="0.1" min="0.1" className={inputClass} value={boiler.design_pressure_bar} onChange={(e) => setBoiler({ ...boiler, design_pressure_bar: e.target.value })} /></Field>
                  <Field label="Year"><input type="number" min="1900" max="2100" className={inputClass} value={boiler.commissioned_year} onChange={(e) => setBoiler({ ...boiler, commissioned_year: e.target.value })} /></Field>
                </div>
                <Button type="submit" variant="primary" className="w-full">Register boiler</Button>
              </form>
            )}
          </Panel>
        </div>
      )}

      {tab === "plants" && (
        <div className="grid gap-5 xl:grid-cols-5">
          <Panel title={`Plants (${plants.data?.length ?? 0})`} className="xl:col-span-3">
            <DataTable headers={["Code", "Name", "Location"]}>
              {plants.data?.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-steel-100">{p.code}{p.is_demo && <DemoTag />}</td>
                  <td className="px-3 py-2 text-steel-300">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{p.location}</td>
                </tr>
              ))}
            </DataTable>
          </Panel>
          <Panel title="Register plant" className="xl:col-span-2">
            {!can("asset:write") ? <Notice kind="info">Your role cannot register plants.</Notice> : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit("/plants", {
                code: plant.code.toUpperCase(), name: plant.name, location: plant.location,
              }, "Plant registered.", () => setPlant({ code: "", name: "", location: "" })); }}>
                <Field label="Code"><input required pattern="[A-Za-z0-9-]{3,40}" className={inputClass} value={plant.code} onChange={(e) => setPlant({ ...plant, code: e.target.value })} /></Field>
                <Field label="Name"><input required minLength={3} className={inputClass} value={plant.name} onChange={(e) => setPlant({ ...plant, name: e.target.value })} /></Field>
                <Field label="Location"><input required minLength={2} className={inputClass} value={plant.location} onChange={(e) => setPlant({ ...plant, location: e.target.value })} /></Field>
                <Button type="submit" variant="primary" className="w-full">Register plant</Button>
              </form>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
