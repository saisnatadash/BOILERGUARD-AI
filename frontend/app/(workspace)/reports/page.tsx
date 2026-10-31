"use client";

import { useState } from "react";
import { apiGet, apiSend, downloadProtected } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DataTable, Empty, Field, Notice, PageHeader, Panel, fmtDateTime, inputClass } from "@/components/ui";
import type { Report, Session } from "@/types";

export default function ReportsPage() {
  const { can } = useAuth();
  const sessions = useApiData(() => apiGet<Session[]>("/inspections"), []);
  const reports = useApiData(() => apiGet<Report[]>("/reports"), []);
  const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const report = await apiSend<Report>("POST", "/reports", { session_id: Number(sessionId) });
      setMessage({ kind: "success", text: `Report generated (SHA-256 ${report.checksum.slice(0, 12)}…). Downloading.` });
      await downloadProtected(`/reports/${report.id}/download`, `${report.title.replace(/\s+/g, "_")}.pdf`);
      await reports.reload();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Report generation failed" });
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv(path: string, name: string) {
    try {
      await downloadProtected(path, name);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Export failed" });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Operations" title="Engineering reports & data exports"
        note="PDF reports bring together asset details, measurements, evidence, AI-suspected and verified findings, historical comparisons, risk factors and data limitations. Every item cites its stored record ID. Reports are demonstrations, not statutory certificates.">
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Generate inspection report" className="xl:col-span-1">
          {!can("report:generate") ? <Notice kind="info">Your role can download existing reports and exports but cannot generate new ones.</Notice> : (
            <div className="space-y-3">
              <Field label="Inspection record">
                <select className={inputClass} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                  <option value="">Select…</option>
                  {sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.status}</option>)}
                </select>
              </Field>
              <Button variant="primary" className="w-full" disabled={!sessionId || busy} onClick={generate}>
                {busy ? "Generating…" : "Generate and download PDF"}
              </Button>
            </div>
          )}
        </Panel>

        <Panel title="Data exports (CSV)" className="xl:col-span-1">
          <p className="mb-3 text-xs text-steel-500">Exports carry a data_label column so simulated records are never mistaken for plant data.</p>
          <div className="grid gap-2">
            <Button onClick={() => exportCsv("/export/measurements.csv", "measurements.csv")}>Measurements (all boilers)</Button>
            <Button onClick={() => exportCsv("/export/defects.csv", "defects.csv")}>Findings & verification status</Button>
            <Button onClick={() => exportCsv("/export/boilers.csv", "boilers.csv")}>Boiler register</Button>
          </div>
        </Panel>

        <Panel title="How reports stay traceable" className="xl:col-span-1">
          <ul className="list-disc space-y-2 pl-4 text-sm text-steel-400">
            <li>Each report stores a SHA-256 checksum and its generator, time and inspection ID.</li>
            <li>Evidence files are recorded with their own fingerprints.</li>
            <li>The reviewer sign-off block is left blank for a qualified engineer.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="Generated reports" className="mt-5">
        <DataTable headers={["Report", "Inspection", "Checksum", "Size", "Generated", ""]}
          empty={reports.data?.length === 0 ? "No reports generated yet." : undefined}>
          {reports.data?.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-steel-200">{r.title}</td>
              <td className="px-3 py-2 font-mono text-xs text-steel-400">#{r.session_id}</td>
              <td className="px-3 py-2 font-mono text-xs text-steel-500">{r.checksum.slice(0, 16)}…</td>
              <td className="px-3 py-2 font-mono text-xs text-steel-400">{(r.size_bytes / 1024).toFixed(1)} KB</td>
              <td className="px-3 py-2 font-mono text-xs text-steel-400">{fmtDateTime(r.generated_at)}</td>
              <td className="px-3 py-2 text-right">
                <button className="text-xs text-cyan hover:underline" onClick={() => downloadProtected(`/reports/${r.id}/download`, `${r.title.replace(/\s+/g, "_")}.pdf`)}>Download</button>
              </td>
            </tr>
          ))}
        </DataTable>
        {!reports.data?.length && <Empty>Generated reports appear here for later download.</Empty>}
      </Panel>
    </>
  );
}
