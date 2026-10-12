"""Writes CPA's model catalog: upstream's models.json plus the overlay's entries upstream lacks.

Usage: python3 mediavee/build_catalog.py <upstream models.json> <overlay.json> <output>
An overlay entry whose id upstream already lists is skipped, so upstream's own entry wins once it lands.
"""

import json
import sys


def build(upstream: dict, overlay: dict) -> dict:
    out = dict(upstream)
    for section, entries in overlay.items():
        models = list(out.get(section, []))
        known = {m["id"] for m in models}
        models += [e for e in entries if e["id"] not in known]
        out[section] = models
    return out


def main() -> None:
    upstream_path, overlay_path, output_path = sys.argv[1:4]
    with open(upstream_path) as f:
        upstream = json.load(f)
    with open(overlay_path) as f:
        overlay = json.load(f)
    with open(output_path, "w") as f:
        json.dump(build(upstream, overlay), f, indent=2, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
