"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { apiGet } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { CategoryBadge, DataTable, Empty, Loading, Notice, PageHeader, Panel, Stat, fmtDateTime, fmtMm } from "@/components/ui";
import { RISK_COLOUR } from "@/components/BoilerSchematic";
import type { Category, DashboardSummary } from "@/types";

const ACTIVITY_ACTIONS = ["analysis.run", "import", "report.generate", "simulate", "verify", "reject", "require_testing", "create", "update", "upload", "demo.seeded", "risk.review"];

export default function CommandCentrePage() {
  const { data, error, loading } = useApiData(() => apiGet<DashboardSummary>("/dashboard/summary"), []);

  if (loading && !data) return <Loading label="Assembling command centre" />;
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <Empty>No data available.</Empty>;

  const c = data.counts;
  const activity = data.feed.filter((f) => ACTIVITY_ACTIONS.includes(f.action)).slice(0, 8);

  return (
    <>
      <PageHeader eyebrow="Command Centre" title="Industrial asset overview"
        note={data.disclaimer}>
        <Link href="/inspections" className="rounded border border-cyan/60 bg-cyan/15 px-3 py-1.5 text-sm font-medium text-cyan hover:bg-cyan/25">
          Open inspection workspace
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Boilers" value={c.boilers} hint={`${c.plants} plant(s)`} />
        <Stat label="Components mapped" value={c.components_mapped} />
        <Stat label="Inspection records" value={c.inspection_records} hint={`${c.evidence_items} evidence items`} />
        <Stat label="Defects detected" value={c.defects_detected} hint={`${c.defects_verified} engineer-verified`} />
        <Stat label="Pending verification" value={c.defects_pending_verification} tone="amber" hint="AI-suspected or to test" />
        <Stat label="High-priority flags" value={c.high_priority_flags} tone="crit" hint="Critical + High" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Panel title="Boiler condition distribution" className="xl:col-span-2">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.condition_distribution} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid stroke="#2a313c" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="#6b7584" fontSize={11} />
                <YAxis type="category" dataKey="category" width={150} stroke="#6b7584" fontSize={11} />
                <Tooltip contentStyle={{ background: "#161b22", border: "1px solid #2a313c", fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                  {data.condition_distribution.map((d) => <Cell key={d.category} fill={RISK_COLOUR[d.category as Category]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-steel-500">Component count by explainable risk category (demonstration rules).</p>
        </Panel>

        <Panel title="Inspection completion" className="xl:col-span-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {data.inspection_status.length === 0 && <Empty>No inspection records yet.</Empty>}
            {data.inspection_status.map((s) => (
              <div key={s.status} className="rounded border border-graphite-600 bg-graphite-900/60 p-3">
                <div className="label-caps">{s.status}</div>
                <div className="mt-1 font-mono text-3xl text-steel-100">{s.count}</div>
                <div className="mt-2 h-1 rounded bg-graphite-700">
                  <div className="h-1 rounded bg-cyan" style={{ width: `${Math.min(100, (s.count / Math.max(c.inspection_records, 1)) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <div className="label-caps mb-2">Smart planner status</div>
            <div className="text-sm text-steel-300">
              <span className="font-mono text-steel-100">{c.planned_items_open}</span> planned inspection item(s) open ·{" "}
              <span className="font-mono text-steel-100">{c.devices_registered}</span> device(s) registered (simulated)
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-5">
        <Panel title="Priority watchlist" className="xl:col-span-3"
          action={<Link href="/risk-intelligence" className="label-caps text-cyan hover:underline">Full assessment →</Link>}>
          <DataTable headers={["Component", "Risk category", "Index", "Latest min.", "Required min."]}
            empty={data.watchlist.length === 0 ? "No components currently require review." : undefined}>
            {data.watchlist.map((w) => (
              <tr key={w.component_id} className="hover:bg-graphite-700/40">
                <td className="px-3 py-2">
                  <Link href={`/boiler-memory?component=${w.component_id}`} className="font-mono text-steel-100 hover:text-cyan">{w.component_code}</Link>
                  <div className="text-xs text-steel-500">{w.component_name}</div>
                </td>
                <td className="px-3 py-2"><CategoryBadge category={w.category} /></td>
                <td className="px-3 py-2 font-mono tabular-nums">{w.priority_index}</td>
                <td className="px-3 py-2 font-mono tabular-nums">{fmtMm(w.latest_min_thickness_mm)}</td>
                <td className="px-3 py-2 font-mono tabular-nums text-steel-400">{fmtMm(w.min_required_thickness_mm)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>

        <Panel title="System activity" className="xl:col-span-2">
          {activity.length === 0 && <Empty>No recent activity.</Empty>}
          <ol className="space-y-2.5">
            {activity.map((a, i) => (
              <li key={`${a.at}-${i}`} className="border-l border-graphite-600 pl-3">
                <div className="font-mono text-[11px] text-cyan">{a.action}</div>
                <div className="text-sm text-steel-200">{a.detail || `${a.entity} ${a.entity_id ?? ""}`}</div>
                <div className="text-xs text-steel-500">{a.actor} · {fmtDateTime(a.at)}</div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel title="Inspection intelligence feed" className="mt-5">
        <ol className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {data.feed.slice(0, 12).map((f, i) => (
            <li key={`${f.at}-${i}`} className="flex items-baseline gap-3 border-b border-graphite-700 pb-2 text-sm">
              <span className="w-32 shrink-0 font-mono text-[11px] text-steel-500">{fmtDateTime(f.at)}</span>
              <span className="font-mono text-[11px] uppercase text-amber">{f.action}</span>
              <span className="min-w-0 truncate text-steel-300">{f.detail || f.entity}</span>
            </li>
          ))}
        </ol>
        {data.feed.length === 0 && <Empty>The feed fills as inspections, uploads and analyses are recorded.</Empty>}
      </Panel>
    </>
  );
}
