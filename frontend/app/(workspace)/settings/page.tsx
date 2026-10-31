"use client";

import { useState } from "react";
import { apiGet, apiSend } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { useAuth } from "@/features/auth/AuthProvider";
import { Button, DataTable, Empty, Field, Notice, PageHeader, Panel, fmtDateTime, inputClass } from "@/components/ui";
import type { AuditEntry, User } from "@/types";

const ROLES = ["admin", "inspection_engineer", "maintenance_manager", "viewer"] as const;

export default function SettingsPage() {
  const { user, permissions, can, logout } = useAuth();
  const isAdmin = can("*");
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [auditQuery, setAuditQuery] = useState("");
  const [newUser, setNewUser] = useState({ email: "", full_name: "", role: "viewer", password: "" });

  const users = useApiData(() => (isAdmin ? apiGet<User[]>("/admin/users") : Promise.resolve([] as User[])), [isAdmin]);
  const audit = useApiData(
    () => (isAdmin ? apiGet<AuditEntry[]>(`/admin/audit?limit=200${auditQuery ? `&q=${encodeURIComponent(auditQuery)}` : ""}`) : Promise.resolve([] as AuditEntry[])),
    [isAdmin, auditQuery],
  );

  async function run(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      setMessage({ kind: "success", text: ok });
      await Promise.all([users.reload(), audit.reload()]);
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Request failed" });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings, users & audit trail"
        note="Role-based permissions are enforced by the API. This page only shows what your role may do." />

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Signed-in account">
          <dl className="space-y-2 text-sm">
            <div><dt className="label-caps">Name</dt><dd className="text-steel-200">{user?.full_name}</dd></div>
            <div><dt className="label-caps">Email</dt><dd className="font-mono text-steel-300">{user?.email}</dd></div>
            <div><dt className="label-caps">Role</dt><dd className="text-steel-200">{user?.role.replace(/_/g, " ")}</dd></div>
            <div>
              <dt className="label-caps">Permissions</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {permissions.map((p) => <span key={p} className="rounded border border-graphite-600 px-1.5 py-0.5 font-mono text-[10px] text-steel-400">{p}</span>)}
                {permissions.length === 0 && <span className="text-xs text-steel-500">read-only (view and download)</span>}
              </dd>
            </div>
          </dl>
          <Button className="mt-4" variant="ghost" onClick={logout}>Sign out</Button>
        </Panel>

        <Panel title="Demonstration data">
          <p className="text-sm text-steel-400">Reloads the labelled sample plant, three inspection cycles, sample images, measurements, analysis runs, devices and a planning draft. Your user accounts and the audit trail are kept.</p>
          {!isAdmin ? <Notice kind="info">Only administrators can reset demonstration data.</Notice> : (
            <div className="mt-3 space-y-2">
              {!confirmReset ? (
                <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset demonstration data…</Button>
              ) : (
                <div className="space-y-2 rounded border border-crit/50 p-3">
                  <p className="text-xs text-crit">This erases all inspection, asset, evidence and report records, then reloads the sample set. It cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button variant="danger" onClick={async () => { setConfirmReset(false); await run(() => apiSend("POST", "/admin/reset-demo"), "Demonstration dataset reloaded."); }}>Confirm reset</Button>
                    <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Create user">
          {!isAdmin ? <Notice kind="info">User management is restricted to administrators.</Notice> : (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => {
              await apiSend("POST", "/admin/users", newUser);
              setNewUser({ email: "", full_name: "", role: "viewer", password: "" });
            }, "User created."); }}>
              <Field label="Full name"><input required minLength={2} className={inputClass} value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} /></Field>
              <Field label="Email"><input required type="email" className={inputClass} value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} /></Field>
              <Field label="Role"><select className={inputClass} value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}</select></Field>
              <Field label="Temporary password (min. 8 characters)"><input required minLength={8} type="password" className={inputClass} value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></Field>
              <Button type="submit" variant="primary" className="w-full">Create user</Button>
            </form>
          )}
        </Panel>
      </div>

      {isAdmin && (
        <Panel title="Users & roles" className="mt-5">
          <DataTable headers={["Name", "Email", "Role", "Active"]} empty={users.data?.length === 0 ? "No users." : undefined}>
            {users.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 text-steel-200">{u.full_name}</td>
                <td className="px-3 py-2 font-mono text-xs text-steel-400">{u.email}</td>
                <td className="px-3 py-2">
                  <select className="rounded border border-graphite-600 bg-graphite-900 px-1.5 py-1 text-xs" value={u.role}
                    onChange={(e) => run(() => apiSend("PATCH", `/admin/users/${u.id}`, { role: e.target.value }), "Role updated.")}>
                    {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button className={`text-xs ${u.is_active ? "text-ok" : "text-steel-500"} hover:underline`}
                    onClick={() => run(() => apiSend("PATCH", `/admin/users/${u.id}`, { is_active: !u.is_active }), "Account status updated.")}>
                    {u.is_active ? "Active · deactivate" : "Inactive · activate"}
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {isAdmin && (
        <Panel title="Audit trail" className="mt-5"
          action={<input className={`${inputClass} w-64`} placeholder="Filter action, user or detail" value={auditQuery} onChange={(e) => setAuditQuery(e.target.value)} />}>
          <DataTable headers={["When", "Who", "Role", "Action", "Entity", "Detail"]} empty={audit.data?.length === 0 ? "No matching audit entries." : undefined}>
            {audit.data?.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-steel-500">{fmtDateTime(a.at)}</td>
                <td className="px-3 py-2 text-xs text-steel-300">{a.user_email}</td>
                <td className="px-3 py-2 text-xs text-steel-500">{a.user_role.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 font-mono text-xs text-amber">{a.action}</td>
                <td className="px-3 py-2 text-xs text-steel-400">{a.entity}{a.entity_id ? ` #${a.entity_id}` : ""}</td>
                <td className="max-w-[360px] px-3 py-2 text-xs text-steel-400">{a.detail}</td>
              </tr>
            ))}
          </DataTable>
          {!audit.data?.length && !audit.loading && <Empty>Actions appear here as users work.</Empty>}
        </Panel>
      )}
    </>
  );
}
