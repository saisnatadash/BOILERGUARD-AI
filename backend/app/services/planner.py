"""Shutdown and inspection planner: groups plan items by the method each one needs.

The planner never removes or bypasses statutory items. It only orders and groups work.
"""
from typing import Any

from app.models.entities import PlanItem

PRIORITY_RANK = {"critical": 0, "high": 1, "moderate": 2, "routine": 3}

METHOD_PHASES = [
    ("remote_robotic_candidate",
     "Candidates for remote or robotic methods",
     "Subject to engineering validation of the method, access and safety constraints for each component."),
    ("shutdown_required",
     "Requires boiler shutdown",
     "Access requires a shutdown. Cooling and scaffolding lead times apply and must be confirmed with the plant."),
    ("specialist_required",
     "Requires qualified specialist examination",
     "Must be carried out or certified by a qualified person under the applicable regulations."),
]


def build_schedule(items: list[PlanItem], component_codes: dict[int, str]) -> list[dict[str, Any]]:
    phases = []
    for method_class, title, note in METHOD_PHASES:
        group = [i for i in items if i.method_class == method_class and i.status != "completed"]
        group.sort(key=lambda i: (0 if i.statutory else 1, PRIORITY_RANK.get(i.priority, 9), i.id))
        phases.append({
            "method_class": method_class,
            "title": title,
            "note": note,
            "items": [
                {
                    "plan_item_id": i.id,
                    "component_code": component_codes.get(i.component_id, "?"),
                    "priority": i.priority,
                    "required_method": i.required_method,
                    "statutory": i.statutory,
                    "statutory_reference": i.statutory_reference,
                    "responsible_person": i.responsible_person,
                    "access_constraints": i.access_constraints,
                }
                for i in group
            ],
        })
    return phases
