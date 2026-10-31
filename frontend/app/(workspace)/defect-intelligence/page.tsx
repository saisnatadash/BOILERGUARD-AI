"use client";

import { useEffect, useState } from "react";
import { apiBlobUrl, apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DemoTag, Empty, Field, Loading, Notice, PageHeader, Panel, StatusBadge, fmtDateTime, inputClass } from "@/components/ui";
import type { AnalysisRun, Component, Defect, Evidence, Session } from "@/types";
import { SEVERITIES, suggestedSeverity, type Severity } from "@/lib/findings";

export default function DefectIntelligencePage() {
  const { can } = useAuth();
  const sessions = useApiData(() => apiGet<Session[]>("/inspections"), []);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [evidenceId, setEvidenceId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [note, setNote] = useState<Record<number, string>>({});
  const [sev, setSev] = useState<Record<number, Severity>>({});

  useEffect(() => {
    if (sessionId === null && sessions.data?.[0]) setSessionId(sessions.data[0].id);
  }, [sessions.data, sessionId]);

  const evidence = useApiData(
    () => (sessionId ? apiGet<Evidence[]>(`/inspections/${sessionId}/evidence`) : Promise.resolve([] as Evidence[])),
    [sessionId],
  );
  const defects = useApiData(
    () => (sessionId ? apiGet<Defect[]>(`/inspections/${sessionId}/defects`) : Promise.resolve([] as Defect[])),
    [sessionId],
  );
  const components = useApiData(() => apiGet<Component[]>("/components"), []);
  const runs = useApiData(
    () => (evidenceId ? apiGet<AnalysisRun[]>(`/evidence/${evidenceId}/analysis-runs`) : Promise.resolve([] as AnalysisRun[])),
    [evidenceId],
  );

  const selected = evidence.data?.find((e) => e.id === evidenceId) ?? null;
  const latestRun = runs.data?.[0] ?? null;
  const findings = (defects.data ?? []).filter((d) => d.evidence_id === evidenceId);

  useEffect(() => {
    let url: string | null = null;
    if (!selected) { setPreviewUrl(null); return; }
    apiBlobUrl(`/evidence/${selected.id}/file`).then((u) => { url = u; setPreviewUrl(u); }).catch(() => setPreviewUrl(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [selected?.id]);

  useEffect(() => {
    let url: string | null = null;
    if (!latestRun?.annotated_key) { setAnnotatedUrl(null); return; }
    apiBlobUrl(`/analysis-runs/${latestRun.id}/annotated`).then((u) => { url = u; setAnnotatedUrl(u); }).catch(() => setAnnotatedUrl(null));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [latestRun?.id]);

  async function runAnalysis() {
    if (!selected) return;
    try {
      const run = await apiSend<AnalysisRun>("POST", `/evidence/${selected.id}/analysis`);
      setMessage({ kind: "success", text: `Demonstration analysis finished: ${run.summary.finding_count ?? 0} region(s) flagged for review.` });
      await Promise.all([runs.reload(), defects.reload()]);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Analysis failed" });
    }
  }

  async function decide(d: Defect, action: "verify" | "reject" | "require_testing") {
    try {
      const severity = action === "verify" ? (sev[d.id] ?? suggestedSeverity(d.description)) : null;
      await apiSend("PATCH", `/defects/${d.id}/verification`, { action, severity, note: note[d.id] || null });
      setMessage({ kind: "success", text: `Finding #${d.id} ${action === "verify" ? `verified as ${severity}` : action.replace("_", " ")}.` });
      await defects.reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Could not update the finding" });
    }
  }

  const canRun = can("analysis:run") && selected?.component_id != null;
  const compCode = (id: number | null) => components.data?.find((c) => c.id === id)?.code ?? "unlinked";

  return (
    <>
      <PageHeader eyebrow="Inspection" title="AI defect intelligence"
        note="Image-based screening that proposes suspected regions for an engineer to accept or reject. The included analyzer is a transparent colour-and-shape demonstration, not a validated defect detector.">
        <div className="w-80">
          <Field label="Inspection">
            <select className={inputClass} value={sessionId ?? ""} onChange={(e) => { setSessionId(Number(e.target.value)); setEvidenceId(null); }}>
              {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.status}</option>)}
            </select>
          </Field>
        </div>
      </PageHeader>

      {message && <Notice kind={message.kind === "info" ? "info" : message.kind}>{message.text}</Notice>}

      <div className="mb-5 grid gap-2 rounded-md border border-graphite-600 bg-graphite-800/70 p-3 font-mono text-[11px] uppercase tracking-wider text-steel-400 md:grid-cols-5">
        {["1 · Upload evidence", "2 · Link to component", "3 · Demonstration analysis", "4 · Suspected regions", "5 · Engineer decision"].map((step) => (
          <div key={step} className="border-l-2 border-cyan/50 pl-2">{step}</div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel title="Evidence in this inspection" className="xl:col-span-2">
          {evidence.loading && !evidence.data && <Loading />}
          {evidence.data?.length === 0 && <Empty>Upload photographs in the inspection workspace first.</Empty>}
          <ul className="space-y-2">
            {evidence.data?.map((e) => (
              <li key={e.id}>
                <button onClick={() => setEvidenceId(e.id)}
                  className={`w-full rounded border p-2.5 text-left text-xs transition-colors ${e.id === evidenceId ? "border-cyan/60 bg-cyan/10" : "border-graphite-600 hover:bg-graphite-700/50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-steel-100">#{e.id} · {compCode(e.component_id)}</span>
                    {e.is_demo && <DemoTag />}
                  </div>
                  <div className="mt-0.5 truncate text-steel-400">{e.caption || e.filename}</div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Analysis workspace" className="xl:col-span-3"
          action={selected && <Button variant="primary" disabled={!canRun} onClick={runAnalysis}
            title={!selected?.component_id ? "Link this evidence to a component first" : undefined}>Run demonstration analysis</Button>}>
          {!selected ? <Empty>Select an evidence item to preview it and review suspected regions.</Empty> : (
            <div className="space-y-4">
              {!selected.component_id && <Notice kind="warning">This image is not linked to a component. Link it in the workspace before analysis, so findings can be compared over time.</Notice>}
              <div className="grid gap-4 md:grid-cols-2">
                <figure>
                  <figcaption className="label-caps mb-1">Original · {selected.width}×{selected.height}</figcaption>
                  <div className="grid h-64 place-items-center overflow-hidden rounded border border-graphite-600 bg-graphite-950">
                    {previewUrl ? <img src={previewUrl} alt="Evidence" className="max-h-full max-w-full object-contain" /> : <Loading />}
                  </div>
                </figure>
                <figure>
                  <figcaption className="label-caps mb-1">Annotated output {latestRun && <span className="normal-case text-steel-500">· {latestRun.analyzer_name} {latestRun.analyzer_version}</span>}</figcaption>
                  <div className="grid h-64 place-items-center overflow-hidden rounded border border-graphite-600 bg-graphite-950">
                    {annotatedUrl ? <img src={annotatedUrl} alt="Annotated analysis output" className="max-h-full max-w-full object-contain" /> :
                      <span className="px-4 text-center text-xs text-steel-500">No analysis run yet for this image.</span>}
                  </div>
                </figure>
              </div>

              <div>
                <div className="label-caps mb-2">Suspected regions for this evidence</div>
                {findings.length === 0 ? <Empty>{latestRun ? "The analysis found no regions above the demonstration threshold." : "Run the analysis to propose suspected regions."}</Empty> : (
                  <ul className="space-y-2">
                    {findings.map((d) => (
                      <li key={d.id} className="rounded border border-graphite-600 bg-graphite-900/60 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-steel-100">D#{d.id}</span>
                          <span className="text-steel-300">{d.category.replace(/_/g, " ")}</span>
                          <StatusBadge status={d.status} />
                          <span className="font-mono text-xs text-steel-400">confidence {d.ai_confidence?.toFixed(2)} (heuristic)</span>
                          <span className="font-mono text-xs text-steel-400">area {d.area_fraction !== null ? `${(d.area_fraction * 100).toFixed(2)}%` : "—"}</span>
                        </div>
                        <p className="mt-1 text-xs text-steel-500">{d.description}</p>
                        {d.verified_at && <p className="mt-1 text-xs text-steel-500">Decided {fmtDateTime(d.verified_at)}{d.verification_note ? ` · ${d.verification_note}` : ""}</p>}
                        {can("defect:verify") && d.status === "ai_suspected" && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <input className={`${inputClass} max-w-xs`} placeholder="Reason (required to reject)" value={note[d.id] ?? ""} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} />
                            <select aria-label="Severity on verification" className="rounded border border-graphite-600 bg-graphite-900 px-1.5 text-xs"
                              value={sev[d.id] ?? suggestedSeverity(d.description)} onChange={(e) => setSev({ ...sev, [d.id]: e.target.value as Severity })}>
                              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <Button variant="primary" onClick={() => decide(d, "verify")}>Verify</Button>
                            <Button onClick={() => decide(d, "require_testing")}>Needs testing</Button>
                            <Button variant="danger" disabled={!(note[d.id] || "").trim()} onClick={() => decide(d, "reject")}>Reject</Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="What this analyzer can and cannot do" className="mt-5">
        <div className="grid gap-4 text-sm text-steel-400 md:grid-cols-2">
          <div>
            <div className="label-caps mb-1 text-ok">Demonstrated</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>Replaceable analyzer interface with a recorded name, version and run history.</li>
              <li>Rust-coloured regions and elongated dark streaks, with bounding boxes and area fractions.</li>
              <li>Suspected findings kept separate from engineer-verified defects, and every decision logged.</li>
            </ul>
          </div>
          <div>
            <div className="label-caps mb-1 text-crit">Not claimed</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>It cannot see inside tubes or measure wall thickness from a photograph.</li>
              <li>It cannot certify boiler safety or classify crack severity reliably.</li>
              <li>Confidence values are heuristic scores, not calibrated probabilities.</li>
            </ul>
          </div>
        </div>
      </Panel>
    </>
  );
}
