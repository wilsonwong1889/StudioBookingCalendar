from __future__ import annotations

import re
import unicodedata
from copy import deepcopy
from typing import Any


def slugify_staff_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    return slug or "staff-option"


def _coerce_price_cents(value: Any) -> int:
    if value in (None, ""):
        return 0
    return max(int(value), 0)


def normalize_string_list(value: Any) -> list[str]:
    if not value:
        return []

    if isinstance(value, str):
        source = re.split(r"[\n,]+", value)
    else:
        source = value

    normalized: list[str] = []
    seen: set[str] = set()
    for item in source:
        if item is None:
            continue
        text = str(item).strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
    return normalized


def normalize_staff_roles(value: Any) -> list[dict]:
    if not value:
        return []

    normalized_roles: list[dict] = []
    used_ids: set[str] = set()

    for item in value:
        if isinstance(item, str):
            name = item.strip()
            description = None
            add_on_price_cents = 0
            role_id = slugify_staff_key(name)
        elif isinstance(item, dict):
            name = str(item.get("name") or item.get("role") or item.get("title") or "").strip()
            description_value = item.get("description") or item.get("details") or None
            description = str(description_value).strip() if description_value else None
            add_on_price_cents = _coerce_price_cents(
                item.get("add_on_price_cents", item.get("price_cents", 0))
            )
            role_id = str(item.get("id") or slugify_staff_key(name)).strip()
            photo_url_value = item.get("photo_url") or item.get("profile_image_url") or None
            photo_url = str(photo_url_value).strip() if photo_url_value else None
            skills = normalize_string_list(item.get("skills"))
            talents = normalize_string_list(item.get("talents"))
        else:
            continue

        if not name:
            continue

        if not isinstance(item, dict):
            photo_url = None
            skills = []
            talents = []

        role_id = slugify_staff_key(role_id or name)
        unique_role_id = role_id
        suffix = 2
        while unique_role_id in used_ids:
            unique_role_id = f"{role_id}-{suffix}"
            suffix += 1
        used_ids.add(unique_role_id)

        normalized_roles.append(
            {
                "id": unique_role_id,
                "name": name,
                "description": description,
                "add_on_price_cents": add_on_price_cents,
                "photo_url": photo_url,
                "skills": skills,
                "talents": talents,
            }
        )

    return normalized_roles


def normalize_staff_selection_ids(value: Any) -> list[str]:
    if not value:
        return []

    selected_ids: list[str] = []
    seen: set[str] = set()

    for item in value:
        if isinstance(item, dict):
            candidate = item.get("id") or item.get("name")
        else:
            candidate = item
        if candidate is None:
            continue
        identifier = str(candidate).strip()
        if not identifier or identifier in seen:
            continue
        seen.add(identifier)
        selected_ids.append(identifier)

    return selected_ids


def resolve_staff_assignments(room_staff_roles: Any, selected_ids: Any) -> list[dict]:
    normalized_roles = normalize_staff_roles(room_staff_roles)
    requested_ids = normalize_staff_selection_ids(selected_ids)
    if not requested_ids:
        return []

    roles_by_lookup = {}
    for role in normalized_roles:
        roles_by_lookup[role["id"]] = role
        roles_by_lookup[role["name"].strip().lower()] = role

    assignments: list[dict] = []
    seen_ids: set[str] = set()
    for identifier in requested_ids:
        role = roles_by_lookup.get(identifier) or roles_by_lookup.get(identifier.lower())
        if not role:
            raise ValueError(f'"{identifier}" is not available for this room')
        if role["id"] in seen_ids:
            continue
        seen_ids.add(role["id"])
        assignments.append(deepcopy(role))

    return assignments


def staff_add_on_total_cents(staff_assignments: Any) -> int:
    return sum(
        _coerce_price_cents(assignment.get("add_on_price_cents"))
        for assignment in normalize_staff_roles(staff_assignments)
    )


def build_staff_snapshot(staff_profile: Any) -> dict:
    if hasattr(staff_profile, "id"):
        role_id = str(staff_profile.id)
        name = staff_profile.name
        description = staff_profile.description
        add_on_price_cents = staff_profile.add_on_price_cents
        photo_url = getattr(staff_profile, "photo_url", None)
        skills = getattr(staff_profile, "skills", None)
        talents = getattr(staff_profile, "talents", None)
    else:
        role_id = staff_profile.get("id")
        name = staff_profile.get("name")
        description = staff_profile.get("description")
        add_on_price_cents = staff_profile.get("add_on_price_cents", 0)
        photo_url = staff_profile.get("photo_url")
        skills = staff_profile.get("skills")
        talents = staff_profile.get("talents")

    return normalize_staff_roles(
        [
            {
                "id": role_id,
                "name": name,
                "description": description,
                "add_on_price_cents": add_on_price_cents,
                "photo_url": photo_url,
                "skills": skills,
                "talents": talents,
            }
        ]
    )[0]
