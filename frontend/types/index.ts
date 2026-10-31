export type Category =
  | "Critical Review"
  | "High Priority"
  | "Moderate Priority"
  | "Routine Monitoring"
  | "Insufficient Evidence";

export const CATEGORIES: Category[] = [
  "Critical Review",
  "High Priority",
  "Moderate Priority",
  "Routine Monitoring",
  "Insufficient Evidence",
];

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "inspection_engineer" | "maintenance_manager" | "viewer";
  is_active: boolean;
}

export interface Plant { id: number; code: string; name: string; location: string; description: string | null; is_demo: boolean }
export interface Boiler {
  id: number; plant_id: number; code: string; name: string; boiler_type: string;
  rated_capacity_tph: number; design_pressure_bar: number; commissioned_year: number | null;
  description: string | null; is_demo: boolean;
}
export interface Component {
  id: number; boiler_id: number; code: string; name: string; category: string; diagram_key: string;
  nominal_thickness_mm: number | null; min_required_thickness_mm: number | null;
  material: string | null; description: string | null;
}

export interface Session {
  id: number; code: string; boiler_id: number; inspection_date: string; inspection_type: string;
  method: string; status: string; conditions: Record<string, unknown>; observations: string | null;
  is_demo: boolean; created_at: string;
}

export interface Evidence {
  id: number; session_id: number; component_id: number | null; filename: string; content_type: string;
  size_bytes: number; sha256: string; width: number; height: number; caption: string | null;
  source: string; is_demo: boolean; created_at: string;
}

export interface Measurement {
  id: number; session_id: number; component_id: number; parameter: string; value: number; unit: string;
  method: string; location_key: string; location_label: string | null; instrument: string | null;
  quality: string; source: string; is_demo: boolean; recorded_at: string;
}

export type DefectStatus = "ai_suspected" | "engineer_verified" | "rejected" | "requires_further_testing";

export interface Defect {
  id: number; session_id: number; component_id: number; evidence_id: number | null;
  analysis_run_id: number | null; category: string; description: string; bbox: Record<string, number> | null;
  area_fraction: number | null; ai_confidence: number | null; origin: string; status: DefectStatus;
  severity: string; verification_note: string | null; verified_at: string | null; is_demo: boolean; created_at: string;
}

export interface AnalysisRun {
  id: number; evidence_id: number; analyzer_name: string; analyzer_version: string; status: string;
  summary: { finding_count?: number; categories?: Record<string, number>; disclaimer?: string };
  annotated_key: string | null; is_demonstration: boolean; created_at: string;
}

export interface Factor {
  category: Category; factor: string; detail: string; points: number;
  evidence: { type: string; id: number; label: string }[];
}

export interface RiskAssessment {
  component_id: number; component_code: string; component_name: string; category: Category;
  priority_index: number; factors: Factor[]; limitations: string[]; recommended_follow_up: string;
  latest_min_thickness_mm: number | null; min_required_thickness_mm: number | null;
  engineering_status: {
    reviewed: boolean; confirmed_category: string | null; note: string | null;
    reviewed_at?: string; differs_from_computed: boolean;
  };
  disclaimer: string;
}

export interface TimelineEntry {
  session_id: number; session_code: string; inspection_date: string; session_status: string; is_demo: boolean;
  is_first_record: boolean;
  measurements: { id: number; value: number; location_key: string; quality: string; method: string; is_demo: boolean }[];
  defects: { id: number; category: string; status: string; severity: string }[];
  new_abnormalities: { id: number; category: string; status: string }[];
}

export interface Comparison {
  current_id: number; current_value: number; current_session_id: number; location_key: string;
  location_label: string | null; previous_id: number; previous_value: number | null; previous_session_id: number;
  comparable: boolean; reasons: string[]; loss_mm: number | null; loss_pct_of_nominal: number | null;
  significant: boolean; flagged: boolean; message: string;
}

export interface ComponentMemory {
  component: { id: number; code: string; name: string; category: string; nominal_thickness_mm: number | null; min_required_thickness_mm: number | null };
  record_counts: { inspections: number; measurements: number; defects: number; comparable_pairs: number };
  latest_session_code: string | null;
  latest_min_thickness_mm: number | null;
  timeline: TimelineEntry[];
  comparisons: Comparison[];
  thickness_series: { location_key: string; location_label: string; points: { session_id: number; value: number; quality: string; is_demo: boolean; recorded_at: string }[] }[];
  defect_progression: { category: string; state: string; observations: { defect_id: number; session_id: number; status: string; severity: string; area_fraction: number | null; ai_confidence: number | null }[] }[];
  flagged_changes: Comparison[];
  limitations: string[];
}

export interface TwinComponent {
  id: number; code: string; name: string; category: string; diagram_key: string;
  nominal_thickness_mm: number | null; min_required_thickness_mm: number | null;
  risk_category: Category; priority_index: number; latest_min_thickness_mm: number | null;
  inspections: number; open_findings: number; flagged_changes: number;
}

export interface Device {
  id: number; code: string; name: string; device_type: string; status: string; is_simulated: boolean;
  last_communication_at: string | null; description: string | null;
}

export interface SensorBatch {
  id: number; device_id: number; session_id: number; filename: string; row_count: number;
  accepted_count: number; rejected_count: number; quality_score: number; errors: unknown[]; is_demo: boolean; created_at: string;
}

export interface Plan { id: number; boiler_id: number; name: string; planned_start: string | null; status: string; created_at: string }
export interface PlanItem {
  id: number; plan_id: number; component_id: number; component_code?: string | null; priority: string; method_class: string;
  required_method: string; access_constraints: string | null; statutory: boolean; statutory_reference: string | null;
  responsible_person: string | null; status: string;
}
export interface ScheduleItem {
  plan_item_id: number; component_code: string; priority: string; required_method: string; statutory: boolean;
  statutory_reference: string | null; responsible_person: string | null; access_constraints: string | null;
}
export interface SchedulePhase { method_class: string; title: string; note: string; items: ScheduleItem[] }

export interface MaintenanceAction {
  id: number; component_id: number; defect_id: number | null; action_type: string; description: string;
  status: string; assigned_to: string | null; due_date: string | null; created_at: string;
}

export interface Report { id: number; session_id: number | null; title: string; kind: string; checksum: string; size_bytes: number; generated_at: string }

export interface AuditEntry { id: number; at: string; user_email: string; user_role: string; action: string; entity: string; entity_id: string | null; detail: string | null }

export interface DashboardSummary {
  counts: Record<string, number>;
  condition_distribution: { category: Category; count: number }[];
  inspection_status: { status: string; count: number }[];
  watchlist: { component_id: number; component_code: string; component_name: string; category: Category; priority_index: number; latest_min_thickness_mm: number | null; min_required_thickness_mm: number | null }[];
  feed: { at: string; actor: string; action: string; entity: string; entity_id: string | null; detail: string | null }[];
  disclaimer: string;
}
