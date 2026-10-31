"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiBlobUrl, apiGet, apiSend, apiUpload, downloadProtected } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  Button, DataTable, DemoTag, Empty, Field, Loading, Notice, PageHeader, Panel, StatusBadge, fmtDate, fmtDateTime, fmtMm, inputClass,
} from "@/components/ui";
import type { Component, Defect, Evidence, Measurement, Session } from "@/types";
import { SEVERITIES, suggestedSeverity, type Severity } from "@/lib/findings";

type Tab = "overview" | "evidence" | "measurements" | "defects";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "evidence", label: "Evidence" },
  { key: "measurements", label: "Measurements" },
  { key: "defects", label: "Findings" },
];

export default function InspectionWorkspacePage() {
  const params = useParams<{ id: string }>();
  const sessionId = Number(params.id);
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const session = useApiData(() => apiGet<Session>(`/inspections/${sessionId}`), [sessionId]);
  const boilerComponents = useApiData(async () => {
    if (!session.data) return [] as Component[];
    return apiGet<Component[]>(`/components?boiler_id=${session.data.boiler_id}`);
  }, [session.data?.boiler_id]);
  const evidence = useApiData(() => apiGet<Evidence[]>(`/inspections/${sessionId}/evidence`), [sessionId]);
  const measurements = useApiData(() => apiGet<Measurement[]>(`/inspections/${sessionId}/measurements`), [sessionId]);
  const defects = useApiData(() => apiGet<Defect[]>(`/inspections/${sessionId}/defects`), [sessionId]);

  const reload = async () => {
    await Promise.all([session.reload(), evidence.reload(), measurements.reload(), defects.reload()]);
  };

  if (session.loading && !session.data) return <Loading label="Opening inspection record" />;
  if (session.error) return <Notice kind="error">{session.error}</Notice>;
  const s = session.data!;
  const closed = s.status === "closed";
  const componentName = (id: number | null) => boilerComponents.data?.find((c) => c.id === id)?.code ?? (id ? `#${id}` : "unlinked");

  return (
    <>
      <PageHeader eyebrow={`Inspection · ${fmtDate(s.inspection_date)}`} title={s.code}
        note={`${s.inspection_type.replace(/_/g, " ")} · ${s.method}`}>
        <StatusBadge status={s.status} />
        {s.is_demo && <DemoTag>Demonstration record</DemoTag>}
        <Button variant="primary" onClick={async () => {
          try {
            const report = await apiSend<{ id: number }>("POST", "/reports", { session_id: s.id });
            await downloadProtected(`/reports/${report.id}/download`, `${s.code}.pdf`);
            setMessage({ kind: "success", text: "Engineering report generated and downloaded." });
          } catch (err) {
            setMessage({ kind: "error", text: err instanceof Error ? err.message : "Report failed" });
          }
        }} disabled={!can("report:generate")}>Generate PDF report</Button>
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="mb-5 flex gap-1 border-b border-graphite-600">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${tab === t.key ? "border-cyan text-cyan" : "border-transparent text-steel-400 hover:text-steel-100"}`}>
            {t.label}
            {t.key === "evidence" && evidence.data && <span className="ml-1.5 font-mono text-xs text-steel-500">{evidence.data.length}</span>}
            {t.key === "defects" && defects.data && <span className="ml-1.5 font-mono text-xs text-steel-500">{defects.data.length}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab session={s} closed={closed} canWrite={can("inspection:write")} onSaved={async (text) => { setMessage({ kind: "success", text }); await reload(); }}
          onError={(text) => setMessage({ kind: "error", text })} pendingFindings={defects.data?.filter((d) => d.status === "ai_suspected").length ?? 0} />
      )}
      {tab === "evidence" && (
        <EvidenceTab sessionId={s.id} closed={closed} components={boilerComponents.data ?? []} evidence={evidence.data ?? []}
          loading={evidence.loading} canUpload={can("evidence:write")} canAnalyse={can("analysis:run")}
          onChanged={async (text) => { setMessage({ kind: "success", text }); await reload(); }}
          onError={(text) => setMessage({ kind: "error", text })} />
      )}
      {tab === "measurements" && (
        <MeasurementsTab sessionId={s.id} closed={closed} components={boilerComponents.data ?? []} measurements={measurements.data ?? []}
          loading={measurements.loading} canWrite={can("measurement:write")} componentName={componentName}
          onChanged={async (text) => { setMessage({ kind: "success", text }); await reload(); }}
          onError={(text) => setMessage({ kind: "error", text })} />
      )}
      {tab === "defects" && (
        <DefectsTab sessionId={s.id} closed={closed} components={boilerComponents.data ?? []} defects={defects.data ?? []} loading={defects.loading}
          canVerify={can("defect:verify")} canRecord={can("inspection:write")} componentName={componentName}
          onChanged={async (text) => { setMessage({ kind: "success", text }); await reload(); }}
          onError={(text) => setMessage({ kind: "error", text })} />
      )}
    </>
  );
}

function OverviewTab({ session, closed, canWrite, onSaved, onError, pendingFindings }: {
  session: Session; closed: boolean; canWrite: boolean; pendingFindings: number;
  onSaved: (text: string) => Promise<void>; onError: (text: string) => void;
}) {
  const [observations, setObservations] = useState(session.observations ?? "");
  useEffect(() => setObservations(session.observations ?? ""), [session.observations]);

  async function save(patch: Record<string, unknown>, text: string) {
    try {
      await apiSend("PATCH", `/inspections/${session.id}`, patch);
      await onSaved(text);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="Record" className="xl:col-span-2">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <div><dt className="label-caps">Inspection date</dt><dd className="mt-0.5 text-steel-200">{fmtDate(session.inspection_date)}</dd></div>
          <div><dt className="label-caps">Created</dt><dd className="mt-0.5 text-steel-200">{fmtDateTime(session.created_at)}</dd></div>
          <div><dt className="label-caps">Type</dt><dd className="mt-0.5 text-steel-200">{session.inspection_type}</dd></div>
          <div className="col-span-2 md:col-span-3"><dt className="label-caps">Method</dt><dd className="mt-0.5 text-steel-200">{session.method}</dd></div>
          {Object.entries(session.conditions ?? {}).map(([k, v]) => (
            <div key={k}><dt className="label-caps">{k.replace(/_/g, " ")}</dt><dd className="mt-0.5 font-mono text-steel-200">{String(v)}</dd></div>
          ))}
        </dl>
        <div className="mt-5">
          <Field label="Engineering observations">
            <textarea className={inputClass} rows={4} maxLength={5000} disabled={!canWrite || closed} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </Field>
          {canWrite && !closed && (
            <Button className="mt-2" onClick={() => save({ observations }, "Observations saved.")}>Save observations</Button>
          )}
        </div>
      </Panel>
      <Panel title="Lifecycle">
        <p className="text-sm text-steel-400">Status moves from open to submitted to closed. A record cannot close while any finding is still AI-suspected.</p>
        {pendingFindings > 0 && <Notice kind="warning">{pendingFindings} AI-suspected finding(s) must be verified or rejected before closing.</Notice>}
        <div className="mt-4 flex flex-col gap-2">
          {canWrite && session.status === "open" && (
            <Button onClick={() => save({ status: "submitted" }, "Record submitted for review.")}>Mark as submitted</Button>
          )}
          {canWrite && session.status !== "closed" && (
            <Button variant="primary" onClick={() => save({ status: "closed" }, "Inspection closed.")}>Close inspection</Button>
          )}
          {closed && <Notice kind="success">This inspection is closed and read-only.</Notice>}
        </div>
      </Panel>
    </div>
  );
}

function EvidenceTab({ sessionId, closed, components, evidence, loading, canUpload, canAnalyse, onChanged, onError }: {
  sessionId: number; closed: boolean; components: Component[]; evidence: Evidence[]; loading: boolean;
  canUpload: boolean; canAnalyse: boolean; onChanged: (t: string) => Promise<void>; onError: (t: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [componentId, setComponentId] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];
    (async () => {
      const next: Record<number, string> = {};
      for (const e of evidence) {
        try {
          const url = await apiBlobUrl(`/evidence/${e.id}/file`);
          created.push(url);
          next[e.id] = url;
        } catch {
          /* thumbnail optional */
        }
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [evidence]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return onError("Choose a JPEG or PNG image first.");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (componentId) form.append("component_id", componentId);
      if (caption) form.append("caption", caption);
      await apiUpload(`/inspections/${sessionId}/evidence`, form);
      setFile(null);
      setCaption("");
      await onChanged("Evidence uploaded. Its SHA-256 fingerprint is stored with the record.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function analyse(id: number) {
    try {
      const run = await apiSend<{ summary: { finding_count?: number } }>("POST", `/evidence/${id}/analysis`);
      await onChanged(`Demonstration analysis complete: ${run.summary.finding_count ?? 0} AI-suspected region(s). Verify them in Findings.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Analysis failed");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="Upload inspection photograph" className="xl:col-span-1">
        {!canUpload || closed ? (
          <Notice kind="info">{closed ? "Closed inspections cannot receive new evidence." : "Your role cannot upload evidence."}</Notice>
        ) : (
          <form onSubmit={upload} className="space-y-3">
            <Field label="Image (JPEG or PNG, max 10 MB)">
              <input type="file" accept="image/jpeg,image/png" className="block w-full text-xs text-steel-300 file:mr-3 file:rounded file:border file:border-graphite-600 file:bg-graphite-700 file:px-3 file:py-1.5 file:text-steel-100"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Linked component" hint="Evidence is linked to a component so it can be compared over time.">
              <select className={inputClass} value={componentId} onChange={(e) => setComponentId(e.target.value)}>
                <option value="">Unlinked</option>
                {components.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </Field>
            <Field label="Caption">
              <input className={inputClass} maxLength={255} value={caption} onChange={(e) => setCaption(e.target.value)} />
            </Field>
            <Button type="submit" variant="primary" disabled={busy || !file} className="w-full">{busy ? "Uploading…" : "Upload evidence"}</Button>
            <p className="text-xs text-steel-500">Photographs are stored as evidence only. The prototype does not treat uploads as live robotic camera feeds.</p>
          </form>
        )}
      </Panel>

      <Panel title="Evidence register" className="xl:col-span-2">
        {loading && evidence.length === 0 && <Loading />}
        {!loading && evidence.length === 0 && <Empty>No evidence recorded for this inspection yet.</Empty>}
        <div className="grid gap-3 sm:grid-cols-2">
          {evidence.map((e) => (
            <div key={e.id} className="overflow-hidden rounded border border-graphite-600 bg-graphite-900/60">
              <div className="grid h-40 place-items-center bg-graphite-950">
                {thumbs[e.id] ? <img src={thumbs[e.id]} alt={e.caption ?? e.filename} className="h-full w-full object-contain" /> : <span className="label-caps">No preview</span>}
              </div>
              <div className="space-y-1 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-steel-200">#{e.id} · {componentLabel(components, e.component_id)}</span>
                  {e.is_demo && <DemoTag />}
                </div>
                <div className="truncate text-steel-400">{e.caption || e.filename}</div>
                <div className="font-mono text-[10px] text-steel-500">sha256 {e.sha256.slice(0, 16)}… · {e.width}×{e.height}</div>
                {canAnalyse && !closed && e.component_id && (
                  <Button className="mt-1 w-full" onClick={() => analyse(e.id)}>Run demonstration analysis</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function componentLabel(components: Component[], id: number | null) {
  return id ? components.find((c) => c.id === id)?.code ?? `component ${id}` : "unlinked";
}

function MeasurementsTab({ sessionId, closed, components, measurements, loading, canWrite, componentName, onChanged, onError }: {
  sessionId: number; closed: boolean; components: Component[]; measurements: Measurement[]; loading: boolean; canWrite: boolean;
  componentName: (id: number | null) => string; onChanged: (t: string) => Promise<void>; onError: (t: string) => void;
}) {
  const [form, setForm] = useState({ component_id: "", value: "", location_key: "", location_label: "", method: "ultrasonic_thickness", quality: "good", instrument: "" });
  const [csvResult, setCsvResult] = useState<{ accepted: number; rejected: number; errors: { line: number; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = canWrite && !closed;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSend("POST", `/inspections/${sessionId}/measurements`, {
        component_id: Number(form.component_id), parameter: "wall_thickness", value: Number(form.value),
        method: form.method, location_key: form.location_key, location_label: form.location_label || null,
        instrument: form.instrument || null, quality: form.quality,
      });
      setForm({ ...form, value: "" });
      await onChanged("Measurement recorded and linked to the component history.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save measurement");
    } finally {
      setBusy(false);
    }
  }

  async function importCsv(file: File) {
    const data = new FormData();
    data.append("file", file);
    try {
      const result = await apiUpload<{ accepted: number; rejected: number; errors: { line: number; reason: string }[] }>(`/inspections/${sessionId}/measurements/import`, data);
      setCsvResult(result);
      await onChanged(`CSV import: ${result.accepted} accepted, ${result.rejected} rejected.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "CSV import failed");
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Panel title="Enter a measurement" className="xl:col-span-1">
        {!editable ? <Notice kind="info">{closed ? "Closed inspections are read-only." : "Your role cannot enter measurements."}</Notice> : (
          <form onSubmit={add} className="space-y-3">
            <Field label="Component">
              <select required className={inputClass} value={form.component_id} onChange={(e) => setForm({ ...form, component_id: e.target.value })}>
                <option value="">Select…</option>
                {components.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Wall thickness (mm)"><input required type="number" step="0.01" min="0.01" max="999" className={inputClass} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
              <Field label="Quality">
                <select className={inputClass} value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })}>
                  <option value="good">Good</option><option value="fair">Fair</option><option value="poor">Poor</option>
                </select>
              </Field>
            </div>
            <Field label="Location key" hint="Same key = comparable location over time (e.g. ECO24-SEC-A-1.2M)">
              <input required pattern="[A-Za-z0-9._-]{2,80}" className={inputClass} value={form.location_key} onChange={(e) => setForm({ ...form, location_key: e.target.value })} />
            </Field>
            <Field label="Location label"><input className={inputClass} maxLength={160} value={form.location_label} onChange={(e) => setForm({ ...form, location_label: e.target.value })} /></Field>
            <Field label="Method">
              <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="ultrasonic_thickness">Ultrasonic thickness</option>
                <option value="visual_gauge">Visual / gauge</option>
                <option value="thermal_survey">Thermal survey</option>
                <option value="eddy_current">Eddy current</option>
                <option value="emat">EMAT</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Instrument"><input className={inputClass} maxLength={120} value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} /></Field>
            <Button type="submit" variant="primary" disabled={busy} className="w-full">{busy ? "Saving…" : "Save measurement"}</Button>
          </form>
        )}

        <div className="mt-6 border-t border-graphite-700 pt-4">
          <div className="label-caps mb-2">Import structured CSV</div>
          <p className="mb-2 text-xs text-steel-500">Columns: component_code, parameter, value, unit, method, location_key, quality (optional: location_label, instrument, recorded_at, session_code).</p>
          {editable && (
            <input type="file" accept=".csv,text/csv" className="block w-full text-xs text-steel-300 file:mr-3 file:rounded file:border file:border-graphite-600 file:bg-graphite-700 file:px-3 file:py-1.5 file:text-steel-100"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); }} />
          )}
          {csvResult && (
            <div className="mt-3 text-xs">
              <div className="text-steel-300">Accepted <span className="text-ok">{csvResult.accepted}</span> · rejected <span className="text-crit">{csvResult.rejected}</span></div>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-steel-400">
                {csvResult.errors.map((er) => <li key={er.line}>Line {er.line}: {er.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Measurements in this inspection" className="xl:col-span-2">
        <DataTable headers={["Component", "Value", "Location", "Method", "Quality", "Source"]}
          empty={loading ? "Loading…" : measurements.length === 0 ? "No measurements recorded in this inspection." : undefined}>
          {measurements.map((m) => (
            <tr key={m.id} className="hover:bg-graphite-700/40">
              <td className="px-3 py-2 font-mono text-steel-200">{componentName(m.component_id)}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-steel-100">{fmtMm(m.value)}</td>
              <td className="px-3 py-2 text-xs text-steel-400">{m.location_label || m.location_key}</td>
              <td className="px-3 py-2 text-xs text-steel-400">{m.method.replace(/_/g, " ")}</td>
              <td className="px-3 py-2 text-xs">{m.quality}</td>
              <td className="px-3 py-2 text-xs text-steel-400">{m.source.replace(/_/g, " ")}{m.is_demo && <DemoTag />}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

function DefectsTab({ sessionId, closed, components, defects, loading, canVerify, canRecord, componentName, onChanged, onError }: {
  sessionId: number; closed: boolean; components: Component[]; defects: Defect[]; loading: boolean; canVerify: boolean; canRecord: boolean;
  componentName: (id: number | null) => string; onChanged: (t: string) => Promise<void>; onError: (t: string) => void;
}) {
  const [note, setNote] = useState<Record<number, string>>({});
  const [sev, setSev] = useState<Record<number, Severity>>({});
  const [record, setRecord] = useState({ component_id: "", category: "surface_corrosion", description: "", severity: "low" });

  async function act(d: Defect, action: "verify" | "reject" | "require_testing") {
    try {
      const severity = action === "verify" ? (sev[d.id] ?? suggestedSeverity(d.description)) : null;
      await apiSend("PATCH", `/defects/${d.id}/verification`, { action, severity, note: note[d.id] || null });
      await onChanged(`Finding #${d.id} updated: ${action.replace("_", " ")}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  async function recordFinding(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiSend("POST", `/inspections/${sessionId}/defects`, { ...record, component_id: Number(record.component_id), evidence_id: null });
      setRecord({ ...record, description: "" });
      await onChanged("Engineer-observed finding recorded and verified by you.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not record the finding");
    }
  }

  return (
    <div className="space-y-5">
      <Notice kind="info">
        Statuses: <b>AI-suspected</b> = algorithm flagged a region (demonstration only) · <b>Engineer-verified</b> = a qualified reviewer confirmed it ·
        <b> Rejected</b> = reviewed and dismissed, with a written reason · <b>Requires further testing</b> = examination needed before classification.
      </Notice>
      <Panel title="Findings">
        <DataTable headers={["ID", "Component", "Category", "Status", "Severity", "Confidence", "Review"]}
          empty={loading ? "Loading…" : defects.length === 0 ? "No findings yet. Run the demonstration analysis on linked evidence, or record an observation below." : undefined}>
          {defects.map((d) => (
            <tr key={d.id} className="align-top">
              <td className="px-3 py-2 font-mono text-xs text-steel-400">#{d.id}</td>
              <td className="px-3 py-2 font-mono text-steel-200">{componentName(d.component_id)}</td>
              <td className="px-3 py-2 text-xs text-steel-300">{d.category.replace(/_/g, " ")}{d.is_demo && <DemoTag />}</td>
              <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
              <td className="px-3 py-2 text-xs">{d.severity}</td>
              <td className="px-3 py-2 font-mono text-xs text-steel-400">{d.ai_confidence !== null ? `${d.ai_confidence.toFixed(2)} heuristic` : "—"}</td>
              <td className="min-w-[260px] px-3 py-2">
                <p className="mb-2 text-xs text-steel-500">{d.description}</p>
                {canVerify && !closed && d.status !== "engineer_verified" && (
                  <div className="space-y-1.5">
                    <input className={inputClass} placeholder="Review note (required to reject)" value={note[d.id] ?? ""} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select aria-label="Severity on verification" className="rounded border border-graphite-600 bg-graphite-900 px-1.5 py-1.5 text-xs"
                        value={sev[d.id] ?? suggestedSeverity(d.description)} onChange={(e) => setSev({ ...sev, [d.id]: e.target.value as Severity })}>
                        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <Button variant="primary" onClick={() => act(d, "verify")}>Verify</Button>
                      <Button onClick={() => act(d, "require_testing")}>Needs testing</Button>
                      <Button variant="danger" disabled={!(note[d.id] || "").trim()} onClick={() => act(d, "reject")}>Reject</Button>
                    </div>
                    <p className="text-[11px] text-steel-500">Severity defaults to the analyzer&apos;s suggestion. The engineer confirms or changes it before verifying.</p>
                  </div>
                )}
                {d.verification_note && d.status !== "ai_suspected" && <p className="mt-1 text-xs text-steel-400">Note: {d.verification_note}</p>}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>

      {canRecord && !closed && (
        <Panel title="Record an engineer-observed finding">
          <form onSubmit={recordFinding} className="grid gap-3 md:grid-cols-5">
            <Field label="Component">
              <select required className={inputClass} value={record.component_id} onChange={(e) => setRecord({ ...record, component_id: e.target.value })}>
                <option value="">Select…</option>
                {components.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select className={inputClass} value={record.category} onChange={(e) => setRecord({ ...record, category: e.target.value })}>
                {["surface_corrosion", "cracking_indicator", "oxidation", "surface_deterioration", "deposit_accumulation", "visible_deformation", "other"].map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Severity">
              <select className={inputClass} value={record.severity} onChange={(e) => setRecord({ ...record, severity: e.target.value })}>
                <option value="low">Low</option><option value="moderate">Moderate</option><option value="severe">Severe</option>
              </select>
            </Field>
            <Field label="Description">
              <input required minLength={5} maxLength={1000} className={inputClass} value={record.description} onChange={(e) => setRecord({ ...record, description: e.target.value })} />
            </Field>
            <div className="flex items-end"><Button type="submit" variant="primary" className="w-full">Record</Button></div>
          </form>
        </Panel>
      )}
      {defects.length > 0 && <div className="text-xs text-steel-500">Engineer decisions are written to the audit trail with user, role and time.</div>}
      {!canVerify && defects.length > 0 && <Notice kind="info">Your role can view findings. Verification requires an inspection engineer or administrator.</Notice>}
      <Link href="/defect-intelligence" className="inline-block text-sm text-cyan hover:underline">Open AI defect intelligence →</Link>
    </div>
  );
}
