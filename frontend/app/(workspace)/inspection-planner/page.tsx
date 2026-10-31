"use client";

import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, CategoryBadge, DataTable, DemoTag, Empty, Field, Notice, PageHeader, Panel, StatusBadge, fmtDate, inputClass } from "@/components/ui";
import type { Boiler, Component, MaintenanceAction, Plan, PlanItem, SchedulePhase } from "@/types";

const PRIORITY_TO_CATEGORY: Record<string, "Critical Review" | "High Priority" | "Moderate Priority" | "Routine Monitoring"> = {
  critical: "Critical Review", high: "High Priority", moderate: "Moderate Priority", routine: "Routine Monitoring",
};

export default function PlannerPage() {
  const { can } = useAuth();
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const plans = useApiData(() => apiGet<Plan[]>("/plans"), []);
  const boilers = useApiData(() => apiGet<Boiler[]>("/boilers"), []);
  const [planId, setPlanId] = useState<number | null>(null);
  const [newPlan, setNewPlan] = useState({ boiler_id: "", name: "", planned_start: "" });

  useEffect(() => {
    if (planId === null && plans.data?.[0]) setPlanId(plans.data[0].id);
  }, [plans.data, planId]);

  const detail = useApiData(
    () => (planId ? apiGet<{ plan: Plan; items: PlanItem[]; schedule: SchedulePhase[]; note: string }>(`/plans/${planId}`) : Promise.resolve(null)),
    [planId],
  );
  const boilerId = detail.data?.plan.boiler_id ?? null;
  const components = useApiData(
    () => (boilerId ? apiGet<Component[]>(`/components?boiler_id=${boilerId}`) : Promise.resolve([] as Component[])),
    [boilerId],
  );
  const actions = useApiData(() => apiGet<MaintenanceAction[]>("/maintenance-actions"), []);

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      setMessage({ kind: "success", text: ok });
      await Promise.all([detail.reload(), actions.reload()]);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Request failed" });
    }
  }

  const [item, setItem] = useState({ component_id: "", priority: "moderate", method_class: "remote_robotic_candidate", required_method: "", access_constraints: "", statutory: false, statutory_reference: "", responsible_person: "" });
  const [action, setAction] = useState({ component_id: "", action_type: "follow_up_inspection", description: "", assigned_to: "", due_date: "" });

  return (
    <>
      <PageHeader eyebrow="Operations" title="Shutdown & inspection planner"
        note="Groups inspection work by the method each item needs, so remote candidates, shutdown work and specialist examinations are visible. Statutory items cannot be removed. Dates and access windows are confirmed with the plant.">
        <div className="w-72">
          <Field label="Plan">
            <select className={inputClass} value={planId ?? ""} onChange={(e) => setPlanId(Number(e.target.value))}>
              {plans.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
      </PageHeader>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="grid gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <Panel title="Proposed schedule by method">
            {!detail.data ? <Empty>Create or select a plan to see its schedule.</Empty> : (
              <div className="grid gap-4 md:grid-cols-3">
                {detail.data.schedule.map((phase) => (
                  <div key={phase.method_class} className="rounded border border-graphite-600 bg-graphite-900/60 p-3">
                    <div className="text-sm font-medium text-steel-100">{phase.title}</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-steel-500">{phase.note}</p>
                    <ul className="mt-3 space-y-2">
                      {phase.items.map((i) => (
                        <li key={i.plan_item_id} className="border-l-2 border-cyan/40 pl-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-steel-100">{i.component_code}</span>
                            <CategoryBadge category={PRIORITY_TO_CATEGORY[i.priority] ?? "Routine Monitoring"} />
                            {i.statutory && <span className="rounded border border-crit/60 px-1 font-mono text-[9.5px] uppercase text-crit">statutory</span>}
                          </div>
                          <div className="text-steel-400">{i.required_method}</div>
                          {i.statutory_reference && <div className="text-[11px] text-steel-500">Ref: {i.statutory_reference}</div>}
                        </li>
                      ))}
                      {phase.items.length === 0 && <li className="text-xs text-steel-600">No items in this group.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Plan items">
            <DataTable headers={["Component", "Priority", "Method class", "Required method", "Status", ""]}
              empty={detail.data?.items.length === 0 ? "No items yet." : undefined}>
              {detail.data?.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-3 py-2 font-mono text-steel-200">{i.component_code ?? i.component_id}</td>
                  <td className="px-3 py-2 text-xs">{i.priority}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{i.method_class.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-xs text-steel-300">{i.required_method}{i.statutory && <DemoTag>statutory</DemoTag>}</td>
                  <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {can("plan:write") && (
                      <>
                        <button className="mr-3 text-xs text-cyan hover:underline" onClick={() => run(() => apiSend("PATCH", `/plan-items/${i.id}`, { status: i.status === "planned" ? "completed" : "planned" }), "Plan item updated.")}>
                          {i.status === "planned" ? "Mark done" : "Reopen"}
                        </button>
                        <button disabled={i.statutory} title={i.statutory ? "Statutory items cannot be removed" : "Remove item"}
                          className="text-xs text-crit hover:underline disabled:cursor-not-allowed disabled:text-steel-600 disabled:no-underline"
                          onClick={() => run(() => apiSend("DELETE", `/plan-items/${i.id}`), "Plan item removed.")}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Panel>
        </div>

        <div className="space-y-5 xl:col-span-2">
          <Panel title="New plan">
            {!can("plan:write") ? <Notice kind="info">Your role cannot create plans.</Notice> : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => {
                const p = await apiSend<Plan>("POST", "/plans", { boiler_id: Number(newPlan.boiler_id), name: newPlan.name, planned_start: newPlan.planned_start || null });
                setPlanId(p.id);
              }, "Plan created."); }}>
                <Field label="Boiler"><select required className={inputClass} value={newPlan.boiler_id} onChange={(e) => setNewPlan({ ...newPlan, boiler_id: e.target.value })}>
                  <option value="">Select…</option>{boilers.data?.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field>
                <Field label="Name"><input required minLength={3} className={inputClass} value={newPlan.name} onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })} /></Field>
                <Field label="Planned start"><input type="date" className={inputClass} value={newPlan.planned_start} onChange={(e) => setNewPlan({ ...newPlan, planned_start: e.target.value })} /></Field>
                <Button type="submit" className="w-full">Create plan</Button>
              </form>
            )}
          </Panel>

          <Panel title="Add plan item">
            {!can("plan:write") || !planId ? <Notice kind="info">Select a plan and a role with planning rights to add items.</Notice> : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => apiSend("POST", `/plans/${planId}/items`, {
                component_id: Number(item.component_id), priority: item.priority, method_class: item.method_class,
                required_method: item.required_method, access_constraints: item.access_constraints || null, statutory: item.statutory,
                statutory_reference: item.statutory ? item.statutory_reference : null, responsible_person: item.responsible_person || null,
              }), "Plan item added."); }}>
                <Field label="Component"><select required className={inputClass} value={item.component_id} onChange={(e) => setItem({ ...item, component_id: e.target.value })}>
                  <option value="">Select…</option>{components.data?.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority"><select className={inputClass} value={item.priority} onChange={(e) => setItem({ ...item, priority: e.target.value })}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="moderate">Moderate</option><option value="routine">Routine</option></select></Field>
                  <Field label="Method class"><select className={inputClass} value={item.method_class} onChange={(e) => setItem({ ...item, method_class: e.target.value })}>
                    <option value="remote_robotic_candidate">Remote / robotic candidate</option><option value="shutdown_required">Requires shutdown</option><option value="specialist_required">Specialist examination</option></select></Field>
                </div>
                <Field label="Required method"><input required minLength={3} className={inputClass} value={item.required_method} onChange={(e) => setItem({ ...item, required_method: e.target.value })} /></Field>
                <label className="flex items-center gap-2 text-sm text-steel-300">
                  <input type="checkbox" checked={item.statutory} onChange={(e) => setItem({ ...item, statutory: e.target.checked })} /> Statutory requirement
                </label>
                {item.statutory && <Field label="Statutory reference (required)"><input required className={inputClass} value={item.statutory_reference} onChange={(e) => setItem({ ...item, statutory_reference: e.target.value })} /></Field>}
                <Field label="Access constraints"><input className={inputClass} value={item.access_constraints} onChange={(e) => setItem({ ...item, access_constraints: e.target.value })} /></Field>
                <Button type="submit" className="w-full">Add item</Button>
              </form>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Maintenance actions" className="mt-5">
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <DataTable headers={["Component", "Action", "Description", "Assigned", "Due", "Status"]}
              empty={actions.data?.length === 0 ? "No maintenance actions recorded." : undefined}>
              {actions.data?.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="px-3 py-2 font-mono text-xs text-steel-200">#{a.component_id}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{a.action_type.replace(/_/g, " ")}</td>
                  <td className="max-w-[320px] px-3 py-2 text-xs text-steel-300">{a.description}</td>
                  <td className="px-3 py-2 text-xs text-steel-400">{a.assigned_to ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-steel-400">{fmtDate(a.due_date)}</td>
                  <td className="px-3 py-2">
                    {can("maintenance:write") ? (
                      <select className="rounded border border-graphite-600 bg-graphite-900 px-1.5 py-1 text-xs" value={a.status}
                        onChange={(e) => run(() => apiSend("PATCH", `/maintenance-actions/${a.id}`, { status: e.target.value }), "Maintenance action updated.")}>
                        <option value="open">Open</option><option value="in_progress">In progress</option><option value="done">Done</option>
                      </select>
                    ) : <StatusBadge status={a.status} />}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
          {can("maintenance:write") && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => apiSend("POST", "/maintenance-actions", {
              component_id: Number(action.component_id), action_type: action.action_type, description: action.description,
              assigned_to: action.assigned_to || null, due_date: action.due_date || null,
            }), "Maintenance action created."); }}>
              <Field label="Component"><select required className={inputClass} value={action.component_id} onChange={(e) => setAction({ ...action, component_id: e.target.value })}>
                <option value="">Select…</option>{components.data?.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></Field>
              <Field label="Action type"><select className={inputClass} value={action.action_type} onChange={(e) => setAction({ ...action, action_type: e.target.value })}>
                <option value="follow_up_inspection">Follow-up inspection</option><option value="engineering_review">Engineering review</option>
                <option value="repair_recommendation">Repair recommendation</option><option value="monitor">Monitor</option></select></Field>
              <Field label="Description"><input required minLength={5} className={inputClass} value={action.description} onChange={(e) => setAction({ ...action, description: e.target.value })} /></Field>
              <Field label="Assigned to"><input className={inputClass} value={action.assigned_to} onChange={(e) => setAction({ ...action, assigned_to: e.target.value })} /></Field>
              <Field label="Due date"><input type="date" className={inputClass} value={action.due_date} onChange={(e) => setAction({ ...action, due_date: e.target.value })} /></Field>
              <Button type="submit" className="w-full">Add maintenance action</Button>
            </form>
          )}
        </div>
      </Panel>
    </>
  );
}
