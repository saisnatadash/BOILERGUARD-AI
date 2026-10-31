"use client";

import type { Category, TwinComponent } from "@/types";

/**
 * Conceptual 2D schematic. It is NOT an engineering drawing of any plant.
 * Regions are keyed by diagram_key, which is set in the component registry.
 */
const REGIONS: Record<string, { x: number; y: number; w: number; h: number; label: string; labelAt?: "in" | "below" }> = {
  drum: { x: 240, y: 28, w: 160, h: 34, label: "Steam drum" },
  furnace: { x: 130, y: 96, w: 160, h: 270, label: "Furnace" },
  "ww-left": { x: 120, y: 96, w: 12, h: 270, label: "WW-L", labelAt: "below" },
  "ww-right": { x: 290, y: 96, w: 12, h: 270, label: "WW-R", labelAt: "below" },
  sh: { x: 326, y: 96, w: 62, h: 120, label: "Superheater" },
  rh: { x: 398, y: 96, w: 62, h: 120, label: "Reheater" },
  "eco-1": { x: 326, y: 236, w: 134, h: 46, label: "Economiser" },
  "eco-2": { x: 326, y: 292, w: 134, h: 46, label: "Economiser", labelAt: "below" },
  "hdr-fw": { x: 110, y: 392, w: 300, h: 14, label: "Feedwater header", labelAt: "below" },
  "hdr-ms": { x: 480, y: 96, w: 14, h: 270, label: "Main steam header", labelAt: "below" },
};

export const RISK_COLOUR: Record<Category, string> = {
  "Critical Review": "#ff5c39",
  "High Priority": "#f5a623",
  "Moderate Priority": "#e3c35b",
  "Routine Monitoring": "#3fb950",
  "Insufficient Evidence": "#6b7584",
};

export function BoilerSchematic({
  components, selectedId, onSelect,
}: { components: TwinComponent[]; selectedId: number | null; onSelect: (id: number) => void }) {
  const byKey = new Map<string, TwinComponent>();
  components.forEach((c) => byKey.set(c.diagram_key, c));

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 660 470" className="h-auto w-full select-none" role="img"
        aria-label="Conceptual boiler schematic. Select a component region to inspect it.">
        <defs>
          <pattern id="fine-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(138,150,165,0.08)" strokeWidth="1" />
          </pattern>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width="660" height="470" fill="url(#fine-grid)" />

        {/* casing outline (decorative, not a component) */}
        <rect x="104" y="20" width="420" height="400" rx="8" fill="none" stroke="#2a313c" strokeDasharray="4 4" />
        <text x="112" y="458" className="font-mono" fill="#6b7584" fontSize="10" letterSpacing="2">CONCEPTUAL SAMPLE MODEL · NOT TO SCALE</text>

        {Object.entries(REGIONS).map(([key, r]) => {
          const comp = byKey.get(key);
          const colour = comp ? RISK_COLOUR[comp.risk_category] : "#3a424f";
          const selected = comp && comp.id === selectedId;
          const interactive = Boolean(comp);
          const labelY = r.labelAt === "below" ? r.y + r.h + 14 : r.y - 6;
          const labelX = r.labelAt === "below" ? r.x + r.w / 2 : r.x + r.w / 2;
          return (
            <g key={key}
              role={interactive ? "button" : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={comp ? `${comp.code} ${comp.name}, ${comp.risk_category}` : `${r.label} (no component mapped)`}
              onClick={() => comp && onSelect(comp.id)}
              onKeyDown={(e) => { if (comp && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(comp.id); } }}
              className={interactive ? "cursor-pointer" : "cursor-default"}
              style={{ outline: "none" }}>
              <rect x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} rx="4" fill="transparent" />
              <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="3"
                fill={selected ? "rgba(34,211,238,0.12)" : comp ? `${colour}1f` : "rgba(58,66,79,0.25)"}
                stroke={selected ? "#22d3ee" : colour}
                strokeWidth={selected ? 2.5 : comp && comp.risk_category === "Critical Review" ? 2.5 : 1.5}
                strokeDasharray={comp ? undefined : "3 3"}
                filter={selected ? "url(#glow)" : undefined}
                className="transition-all duration-200 hover:opacity-90" />
              {r.labelAt === "below" ? (
                <text x={labelX} y={labelY} textAnchor="middle" fontSize="10" fill="#aab4c1" className="font-mono">
                  {comp ? comp.code : r.label}
                </text>
              ) : (
                <text x={labelX} y={labelY} textAnchor="middle" fontSize="10" fill="#aab4c1" className="font-mono">
                  {comp ? comp.code : r.label}
                </text>
              )}
              {comp && comp.open_findings > 0 && (
                <g>
                  <circle cx={r.x + r.w - 2} cy={r.y + 2} r="7" fill="#f5a623" />
                  <text x={r.x + r.w - 2} y={r.y + 5.5} textAnchor="middle" fontSize="9" fill="#0a0c0f" className="font-mono">{comp.open_findings}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* flow annotations (static, conceptual) */}
        <text x="24" y="250" fontSize="10" fill="#6b7584" className="font-mono" transform="rotate(-90 24 250)">FLUE GAS →</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-steel-400">
        {(Object.keys(RISK_COLOUR) as Category[]).map((c) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: RISK_COLOUR[c] }} />{c}
          </span>
        ))}
      </div>
    </div>
  );
}
