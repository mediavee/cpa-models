# mediavee overlay

Mediavee's CPA reads its model catalog from this fork's `catalog` branch:
`https://raw.githubusercontent.com/mediavee/cpa-models/catalog/models.json` (CPA `models.catalog`).

That file is upstream's `models.json` plus the entries of `overlay.json` upstream does not list yet,
built by `build_catalog.py`. The `catalog` workflow merges `router-for-me/models` into `main` every hour,
rebuilds the catalog and pushes it when it changed. Upstream's `models.json` is never edited here, so the
merge cannot conflict.

The overlay holds Muse Wonder Full, which Meta serves to Muse Code Power and Maximum subscriptions but
upstream does not list, and GPT-6.2 Sol and Astra for the paid Codex plans until upstream adds them; those
copy GPT-6.1 Sol's and GPT-6 Astra's parameters. Remove an entry once upstream lists it; until then upstream's entry already wins.
