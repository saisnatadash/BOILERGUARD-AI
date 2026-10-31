"use client";

import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DataTable, DemoTag, Empty, Field, Notice, PageHeader, Panel, StatusBadge, Stat, fmtDateTime, inputClass } from "@/components/ui";
import type { Device, SensorBatch, Session } from "@/types";

const DEVICE_TYPES = [
  { value: "robotic_crawler", label: "Robotic crawler (architecture)" },
  { value: "ultrasonic_gauge", label: "Ultrasonic thickness gauge (simulated feed)" },
  { value: "thermal_camera", label: "Thermal camera (architecture)" },
  { value: "visual_camera", label: "Visual camera (architecture)" },
  { value: "sensor_gateway", label: "Sensor gateway (architecture)" },
];

export default function RoboticsPage() {
  const { can } = useAuth();
  const devices = useApiData(() => apiGet<Device[]>("/devices"), []);
  const batches = useApiData(() => apiGet<SensorBatch[]>("/devices/batches"), []);
  const sessions = useApiData(() => apiGet<Session[]>("/inspections?status=open"), []);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [simDevice, setSimDevice] = useState("");
  const [simSession, setSimSession] = useState("");
  const [form, setForm] = useState({ code: "", name: "", device_type: "ultrasonic_gauge", description: "" });

  const simulable = devices.data?.filter((d) => d.device_type === "ultrasonic_gauge") ?? [];

  async function register(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("POST", "/devices", { ...form, description: form.description || null });
      setForm({ code: "", name: "", device_type: "ultrasonic_gauge", description: "" });
      setMessage({ kind: "success", text: "Device registered in the simulated registry." });
      await devices.reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Registration failed" });
    }
  }

  async function simulate() {
    try {
      const batch = await apiSend<SensorBatch>("POST", `/devices/${simDevice}/simulate-batch`, { session_id: Number(simSession) });
      setMessage({ kind: "success", text: `SIMULATED batch ${batch.filename}: ${batch.accepted_count} readings linked to the inspection and labelled as demonstration data.` });
      await Promise.all([batches.reload(), devices.reload()]);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Simulation failed" });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Inspection" title="Robotics & sensor integration"
        note="A device registry and data-ingestion layer. No real robot, camera or gauge is connected in this prototype. Every reading produced here is simulated and labelled DEMO. Real adapters can replace the simulator without changing the data model.">
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Devices registered" value={devices.data?.length ?? 0} hint="all simulated" />
        <Stat label="Batches ingested" value={batches.data?.length ?? 0} tone="cyan" />
        <Stat label="Readings (simulated)" value={batches.data?.reduce((a, b) => a + b.accepted_count, 0) ?? 0} tone="amber" />
        <Stat label="Live telemetry" value="None" hint="prototype does not stream real data" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Panel title="Device registry" className="xl:col-span-3">
          <DataTable headers={["Device", "Type", "Connection status", "Last communication", "Data"]}
            empty={devices.data?.length === 0 ? "No devices registered." : undefined}>
            {devices.data?.map((d) => (
              <tr key={d.id} className="align-top">
                <td className="px-3 py-2"><div className="font-mono text-steel-100">{d.code}</div><div className="text-xs text-steel-500">{d.name}</div></td>
                <td className="px-3 py-2 text-xs text-steel-400">{d.device_type.replace(/_/g, " ")}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status.replace("simulated_", "")} /></td>
                <td className="px-3 py-2 font-mono text-xs text-steel-400">{fmtDateTime(d.last_communication_at)}</td>
                <td className="px-3 py-2 text-xs">{d.device_type === "ultrasonic_gauge" ? <span className="text-steel-300">Simulated thickness readings<DemoTag /></span> : <span className="text-steel-500">Adapter placeholder</span>}</td>
              </tr>
            ))}
          </DataTable>
          {can("device:write") && (
            <form onSubmit={register} className="mt-4 grid gap-3 border-t border-graphite-700 pt-4 md:grid-cols-4">
              <Field label="Code"><input required pattern="[A-Z0-9-]{3,40}" className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Name"><input required minLength={3} className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Type">
                <select className={inputClass} value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })}>
                  {DEVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <div className="flex items-end"><Button type="submit" className="w-full">Register device</Button></div>
            </form>
          )}
        </Panel>

        <Panel title="Simulated ingestion" className="xl:col-span-2">
          {!can("device:write") ? <Notice kind="info">Your role can view device data but cannot start ingestion.</Notice> : (
            <div className="space-y-3">
              <Field label="Device">
                <select className={inputClass} value={simDevice} onChange={(e) => setSimDevice(e.target.value)}>
                  <option value="">Select a simulable device…</option>
                  {simulable.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
                </select>
              </Field>
              <Field label="Open inspection" hint="Only open inspections accept new readings.">
                <select className={inputClass} value={simSession} onChange={(e) => setSimSession(e.target.value)}>
                  <option value="">Select…</option>
                  {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </select>
              </Field>
              <Button variant="primary" className="w-full" disabled={!simDevice || !simSession} onClick={simulate}>Generate simulated batch</Button>
              <p className="text-xs text-steel-500">Readings are synthetic and deterministic for a given device and inspection. They are not plant measurements.</p>
            </div>
          )}
          <div className="mt-5 border-t border-graphite-700 pt-4 text-xs text-steel-400">
            <div className="label-caps mb-1">Adapter contract</div>
            Each device adapter implements <span className="font-mono text-steel-300">read_batch(components, seed)</span> and returns validated, component-linked readings with data-quality flags.
          </div>
        </Panel>
      </div>

      <Panel title="Ingested batches · data quality" className="mt-5">
        <DataTable headers={["Batch", "Device", "Inspection", "Accepted / rows", "Quality score", "Label", "Received"]}
          empty={batches.data?.length === 0 ? "No batches yet. Generate a simulated batch above." : undefined}>
          {batches.data?.map((b) => {
            const dev = devices.data?.find((d) => d.id === b.device_id);
            return (
              <tr key={b.id}>
                <td className="px-3 py-2 font-mono text-xs text-steel-300">{b.filename}</td>
                <td className="px-3 py-2 font-mono text-xs text-steel-400">{dev?.code ?? b.device_id}</td>
                <td className="px-3 py-2 font-mono text-xs text-steel-400">{sessions.data?.find((s) => s.id === b.session_id)?.code ?? `#${b.session_id}`}</td>
                <td className="px-3 py-2 font-mono text-xs">{b.accepted_count} / {b.row_count}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded bg-graphite-700"><div className="h-1.5 rounded bg-cyan" style={{ width: `${b.quality_score * 100}%` }} /></div>
                    <span className="font-mono text-xs text-steel-400">{Math.round(b.quality_score * 100)}% good</span>
                  </div>
                </td>
                <td className="px-3 py-2">{b.is_demo ? <DemoTag>SIMULATED</DemoTag> : <span className="text-xs text-steel-400">recorded</span>}</td>
                <td className="px-3 py-2 font-mono text-xs text-steel-500">{fmtDateTime(b.created_at)}</td>
              </tr>
            );
          })}
        </DataTable>
      </Panel>
    </>
  );
}
