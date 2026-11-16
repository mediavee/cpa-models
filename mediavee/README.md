# mediavee overlay

Mediavee's CPA reads its model catalog from this fork's `catalog` branch:
`https://raw.githubusercontent.com/mediavee/cpa-models/catalog/models.json` (CPA `models.catalog`).

That file is built by `build_catalog.py` from upstream's `models.json`, plus:

- `overlay.json` — full entries for ids upstream does not list yet. An id upstream already lists is skipped, so upstream's own entry wins once it lands. Remove the entry at that point.
- `corrections.json` — drops, field patches, and adds that must survive the hourly merge of `router-for-me/models` into `main`. Upstream's `models.json` is never edited here, so that merge cannot conflict. A field patch names an id that the build has to find, and the build fails if it does not.

The `catalog` workflow merges upstream into `main` every hour, rebuilds the catalog, and pushes the `catalog` branch when it changed.
