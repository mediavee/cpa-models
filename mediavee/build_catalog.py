"""Writes CPA's model catalog.

Usage: python3 mediavee/build_catalog.py <upstream models.json> <overlay.json> <output> [corrections.json]

Upstream models.json is not edited, so the hourly upstream merge stays conflict-free.
The overlay adds ids upstream does not list yet. corrections.json drops ids the channel
cannot serve, patches fields on ids that remain, and adds ids that are still missing.
When the fourth argument is omitted, corrections are read from mediavee/corrections.json.
"""

import json
import sys
from pathlib import Path


def build(upstream: dict, overlay: dict, corrections: dict = None) -> dict:
    out = json.loads(json.dumps(upstream))
    _add_missing(out, overlay)
    _apply(out, corrections or {})
    return out


def _add_missing(out: dict, extra: dict) -> None:
    for section, entries in extra.items():
        models = list(out.get(section, []))
        known = {model["id"] for model in models}
        models.extend(entry for entry in entries if entry["id"] not in known)
        out[section] = models


def _apply(out: dict, corrections: dict) -> None:
    for section, ids in corrections.get("drop", {}).items():
        dropped = set(ids)
        out[section] = [model for model in out.get(section, []) if model["id"] not in dropped]
    _add_missing(out, corrections.get("add", {}))
    for section, patches in corrections.get("fields", {}).items():
        by_id = {model["id"]: model for model in out.get(section, [])}
        for model_id, patch in patches.items():
            model = by_id.get(model_id)
            if model is None:
                raise SystemExit(f"correction target missing: {section}/{model_id}")
            _merge(model, patch)


def _merge(dest: dict, patch: dict) -> None:
    for key, value in patch.items():
        current = dest.get(key)
        if isinstance(value, dict) and isinstance(current, dict):
            _merge(current, value)
        else:
            dest[key] = value


def main() -> None:
    if len(sys.argv) not in (4, 5):
        raise SystemExit(
            "usage: build_catalog.py <upstream> <overlay> <output> [corrections]"
        )
    upstream_path, overlay_path, output_path = sys.argv[1:4]
    corrections_path = (
        Path(sys.argv[4])
        if len(sys.argv) == 5
        else Path(__file__).with_name("corrections.json")
    )
    upstream = json.loads(Path(upstream_path).read_text())
    overlay = json.loads(Path(overlay_path).read_text())
    corrections = (
        json.loads(corrections_path.read_text()) if corrections_path.is_file() else {}
    )
    text = json.dumps(build(upstream, overlay, corrections), indent=2, ensure_ascii=False)
    Path(output_path).write_text(text + "\n")


if __name__ == "__main__":
    main()
