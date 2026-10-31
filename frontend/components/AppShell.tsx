"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, Boxes, ChevronLeft, ChevronRight, ClipboardList, Cpu, Gauge, LayoutDashboard, LogOut,
  Network, Radar, ScanSearch, Settings, ShieldAlert, Workflow, FileText,
} from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";

const NAV = [
  { group: "Command Centre", items: [{ href: "/dashboard", label: "Command Centre", icon: LayoutDashboard }] },
  {
    group: "Asset Intelligence",
    items: [
      { href: "/digital-twin", label: "Digital Twin", icon: Network },
      { href: "/assets", label: "Plants & Component Registry", icon: Boxes },
    ],
  },
  {
    group: "Inspection",
    items: [
      { href: "/inspections", label: "Inspection Workspace", icon: ClipboardList },
      { href: "/defect-intelligence", label: "AI Defect Intelligence", icon: ScanSearch },
      { href: "/robotics", label: "Robotics & Sensors", icon: Radar },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { href: "/boiler-memory", label: "Boiler Memory Engine", icon: Activity },
      { href: "/risk-intelligence", label: "Risk Intelligence", icon: ShieldAlert },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/inspection-planner", label: "Planner & Maintenance", icon: Workflow },
      { href: "/reports", label: "Engineering Reports", icon: FileText },
    ],
  },
  { group: "Administration", items: [{ href: "/settings", label: "Settings, Users & Audit", icon: Settings }] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("boilerguard.sidebar");
    if (saved === "collapsed") setCollapsed(true);
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  const toggle = () => {
    setCollapsed((c) => {
      window.localStorage.setItem("boilerguard.sidebar", c ? "open" : "collapsed");
      return !c;
    });
  };

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-graphite-950 text-sm text-steel-400">
        <span className="label-caps">Establishing secure session…</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-graphite-950">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-graphite-600 bg-graphite-900 transition-[width] duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        <div className="flex h-16 items-center justify-between border-b border-graphite-600 px-3">
          {!collapsed ? (
            <div className="min-w-0 rounded-md bg-white px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/boilerguard-logo.png" alt="BOILERGUARD AI" className="h-11 w-auto" />
            </div>
          ) : (
            <span className="mx-auto font-mono text-sm font-bold tracking-wider text-cyan">BG</span>
          )}
          <button onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded p-1.5 text-steel-400 hover:bg-graphite-700 hover:text-steel-100">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
          {NAV.map((section) => (
            <div key={section.group} className="mb-4">
              {!collapsed && <div className="label-caps mb-1.5 px-2">{section.group}</div>}
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} title={item.label}
                    className={`group relative mb-0.5 flex items-center gap-2.5 rounded px-2 py-2 text-[13px] transition-colors ${active ? "bg-cyan/10 text-cyan" : "text-steel-300 hover:bg-graphite-700 hover:text-steel-100"}`}>
                    {active && <span className="absolute left-0 top-1.5 h-[calc(100%-12px)] w-0.5 rounded bg-cyan" />}
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-graphite-600 p-3 text-xs">
          {!collapsed ? (
            <>
              <div className="truncate text-steel-200">{user.full_name}</div>
              <div className="label-caps mt-0.5 truncate">{user.role.replace(/_/g, " ")}</div>
              <button onClick={logout} className="mt-2 flex items-center gap-1.5 text-steel-400 hover:text-crit">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </>
          ) : (
            <button onClick={logout} aria-label="Sign out" className="text-steel-400 hover:text-crit"><LogOut className="h-4 w-4" /></button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-graphite-600 bg-graphite-950/90 px-6 backdrop-blur">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-steel-400">
            <Gauge className="h-3.5 w-3.5 text-cyan" />
            <span>Plant DEMO-TPP-01</span>
            <span className="text-steel-600">/</span>
            <span className="text-steel-300">BLR-01 (conceptual)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded border border-amber/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber md:inline">
              Simulated data · decision support only
            </span>
            <Cpu className="h-4 w-4 text-steel-500" />
          </div>
        </header>
        <main className="grid-bg flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
