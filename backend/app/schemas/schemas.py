"""Pydantic request/response schemas. Input validation happens here, before any business logic runs."""
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Role = Literal["admin", "inspection_engineer", "maintenance_manager", "viewer"]
Category = Literal["Critical Review", "High Priority", "Moderate Priority", "Routine Monitoring", "Insufficient Evidence"]
DefectCategory = Literal[
    "surface_corrosion", "cracking_indicator", "oxidation", "surface_deterioration",
    "deposit_accumulation", "visible_deformation", "other",
]
Severity = Literal["low", "moderate", "severe"]
Quality = Literal["good", "fair", "poor"]
Method = Literal["ultrasonic_thickness", "visual_gauge", "thermal_survey", "eddy_current", "emat", "other"]
Parameter = Literal["wall_thickness", "scale_thickness", "surface_temperature"]
PARAMETER_UNITS = {"wall_thickness": "mm", "scale_thickness": "mm", "surface_temperature": "C"}


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth & users ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    role: Role
    password: str = Field(min_length=8, max_length=200)


class UserUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=200)


# ---------- assets ----------
class PlantCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9-]{3,40}$")
    name: str = Field(min_length=3, max_length=200)
    location: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)


class PlantOut(ORM):
    id: int
    code: str
    name: str
    location: str
    description: str | None
    is_demo: bool


class BoilerCreate(BaseModel):
    plant_id: int
    code: str = Field(pattern=r"^[A-Z0-9-]{3,40}$")
    name: str = Field(min_length=3, max_length=200)
    boiler_type: str = Field(min_length=3, max_length=120)
    rated_capacity_tph: float = Field(gt=0, lt=10_000)
    design_pressure_bar: float = Field(gt=0, lt=1_000)
    commissioned_year: int | None = Field(default=None, ge=1900, le=2100)
    description: str | None = Field(default=None, max_length=2000)


class BoilerOut(ORM):
    id: int
    plant_id: int
    code: str
    name: str
    boiler_type: str
    rated_capacity_tph: float
    design_pressure_bar: float
    commissioned_year: int | None
    description: str | None
    is_demo: bool


class ComponentCreate(BaseModel):
    boiler_id: int
    code: str = Field(pattern=r"^[A-Z0-9-]{3,60}$")
    name: str = Field(min_length=3, max_length=200)
    category: str = Field(min_length=3, max_length=60)
    diagram_key: str = Field(min_length=3, max_length=60)
    nominal_thickness_mm: float | None = Field(default=None, gt=0, lt=500)
    min_required_thickness_mm: float | None = Field(default=None, gt=0, lt=500)
    material: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def thresholds_consistent(self):
        n, m = self.nominal_thickness_mm, self.min_required_thickness_mm
        if n is not None and m is not None and m >= n:
            raise ValueError("min_required_thickness_mm must be lower than nominal_thickness_mm")
        return self


class ComponentOut(ORM):
    id: int
    boiler_id: int
    code: str
    name: str
    category: str
    diagram_key: str
    nominal_thickness_mm: float | None
    min_required_thickness_mm: float | None
    material: str | None
    description: str | None


# ---------- inspections ----------
class SessionCreate(BaseModel):
    boiler_id: int
    inspection_date: date
    inspection_type: Literal["annual", "online", "follow_up", "special"] = "annual"
    method: str = Field(min_length=3, max_length=120)
    conditions: dict[str, Any] = Field(default_factory=dict)
    observations: str | None = Field(default=None, max_length=5000)

    @field_validator("conditions")
    @classmethod
    def limit_conditions(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(v) > 20:
            raise ValueError("At most 20 inspection condition fields are allowed")
        for key, value in v.items():
            if len(str(key)) > 60 or len(str(value)) > 200:
                raise ValueError("Condition keys must be <= 60 and values <= 200 characters")
        return v


class SessionUpdate(BaseModel):
    status: Literal["open", "submitted", "closed"] | None = None
    conditions: dict[str, Any] | None = None
    observations: str | None = Field(default=None, max_length=5000)


class SessionOut(ORM):
    id: int
    code: str
    boiler_id: int
    inspection_date: date
    inspection_type: str
    method: str
    status: str
    conditions: dict
    observations: str | None
    is_demo: bool
    created_at: datetime


class EvidenceOut(ORM):
    id: int
    session_id: int
    component_id: int | None
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    width: int
    height: int
    caption: str | None
    source: str
    is_demo: bool
    created_at: datetime


class MeasurementCreate(BaseModel):
    component_id: int
    parameter: Parameter = "wall_thickness"
    value: float = Field(gt=0, lt=1000)
    method: Method
    location_key: str = Field(pattern=r"^[A-Za-z0-9._-]{2,80}$")
    location_label: str | None = Field(default=None, max_length=160)
    instrument: str | None = Field(default=None, max_length=120)
    quality: Quality = "good"
    recorded_at: datetime | None = None


class MeasurementOut(ORM):
    id: int
    session_id: int
    component_id: int
    parameter: str
    value: float
    unit: str
    method: str
    location_key: str
    location_label: str | None
    instrument: str | None
    quality: str
    source: str
    is_demo: bool
    recorded_at: datetime


class DefectCreate(BaseModel):
    component_id: int
    category: DefectCategory
    description: str = Field(min_length=5, max_length=1000)
    severity: Severity = "low"
    evidence_id: int | None = None


class DefectOut(ORM):
    id: int
    session_id: int
    component_id: int
    evidence_id: int | None
    analysis_run_id: int | None
    category: str
    description: str
    bbox: dict | None
    area_fraction: float | None
    ai_confidence: float | None
    origin: str
    status: str
    severity: str
    verification_note: str | None
    verified_at: datetime | None
    is_demo: bool
    created_at: datetime


class VerificationIn(BaseModel):
    action: Literal["verify", "reject", "require_testing"]
    severity: Severity | None = None
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def note_required_for_rejection(self):
        if self.action == "reject" and not (self.note and self.note.strip()):
            raise ValueError("A written reason is required to reject a finding")
        return self


class AnalysisRunOut(ORM):
    id: int
    evidence_id: int
    analyzer_name: str
    analyzer_version: str
    status: str
    summary: dict
    annotated_key: str | None
    is_demonstration: bool
    created_at: datetime


class RiskReviewIn(BaseModel):
    confirmed_category: Category
    note: str = Field(min_length=5, max_length=2000)


# ---------- robotics & sensors ----------
class DeviceCreate(BaseModel):
    code: str = Field(pattern=r"^[A-Z0-9-]{3,40}$")
    name: str = Field(min_length=3, max_length=200)
    device_type: Literal["robotic_crawler", "ultrasonic_gauge", "thermal_camera", "visual_camera", "sensor_gateway"]
    description: str | None = Field(default=None, max_length=1000)


class DeviceOut(ORM):
    id: int
    code: str
    name: str
    device_type: str
    status: str
    is_simulated: bool
    last_communication_at: datetime | None
    description: str | None


class BatchOut(ORM):
    id: int
    device_id: int
    session_id: int
    filename: str
    row_count: int
    accepted_count: int
    rejected_count: int
    quality_score: float
    errors: list
    is_demo: bool
    created_at: datetime


class SimulateBatchIn(BaseModel):
    session_id: int
    component_ids: list[int] | None = None


# ---------- planning & maintenance ----------
MethodClass = Literal["remote_robotic_candidate", "shutdown_required", "specialist_required"]
PlanPriority = Literal["critical", "high", "moderate", "routine"]


class PlanCreate(BaseModel):
    boiler_id: int
    name: str = Field(min_length=3, max_length=200)
    planned_start: date | None = None


class PlanOut(ORM):
    id: int
    boiler_id: int
    name: str
    planned_start: date | None
    status: str
    created_at: datetime


class PlanItemCreate(BaseModel):
    component_id: int
    priority: PlanPriority
    method_class: MethodClass
    required_method: str = Field(min_length=3, max_length=160)
    access_constraints: str | None = Field(default=None, max_length=1000)
    statutory: bool = False
    statutory_reference: str | None = Field(default=None, max_length=160)
    responsible_person: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def statutory_needs_reference(self):
        if self.statutory and not (self.statutory_reference and self.statutory_reference.strip()):
            raise ValueError("Statutory items must cite their statutory reference (e.g. the applicable Act or Regulation clause)")
        return self


class PlanItemOut(ORM):
    id: int
    plan_id: int
    component_id: int
    priority: str
    method_class: str
    required_method: str
    access_constraints: str | None
    statutory: bool
    statutory_reference: str | None
    responsible_person: str | None
    status: str


class PlanItemUpdate(BaseModel):
    status: Literal["planned", "completed"]


class MaintenanceCreate(BaseModel):
    component_id: int
    defect_id: int | None = None
    action_type: Literal["follow_up_inspection", "repair_recommendation", "monitor", "engineering_review"]
    description: str = Field(min_length=5, max_length=1000)
    assigned_to: str | None = Field(default=None, max_length=120)
    due_date: date | None = None


class MaintenanceOut(ORM):
    id: int
    component_id: int
    defect_id: int | None
    action_type: str
    description: str
    status: str
    assigned_to: str | None
    due_date: date | None
    created_at: datetime


class MaintenanceUpdate(BaseModel):
    status: Literal["open", "in_progress", "done"]


# ---------- reports ----------
class ReportCreate(BaseModel):
    session_id: int


class ReportOut(ORM):
    id: int
    session_id: int | None
    title: str
    kind: str
    checksum: str
    size_bytes: int
    generated_at: datetime


class AuditOut(ORM):
    id: int
    at: datetime
    user_email: str
    user_role: str
    action: str
    entity: str
    entity_id: str | None
    detail: str | None
