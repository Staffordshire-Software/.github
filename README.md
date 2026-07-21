# Staffordshire-Software/.github

Org-wide meta repo: the [Definition of Done](./DEFINITION_OF_DONE.md), the
default [PR template](./PULL_REQUEST_TEMPLATE.md), the
[product registry](./product-registry.md), and the tooling that keeps every
StaffySoft repo conformant.

## How to start a new StaffySoft product repo

One command:

```bash
./scripts/new-product-repo.sh <repo-slug> <product-key> "<description>"
```

Example:

```bash
./scripts/new-product-repo.sh dans-music-school dans-music-school "Scheduling and billing for Dan's Music School"
```

The script (requires an authenticated `gh` CLI):

1. Creates `Staffordshire-Software/<repo-slug>` as a private repo.
2. Copies the conformant scaffold from [`templates/product-repo/`](./templates/product-repo)
   — `.platform-conformance.yml` (all checks `warned`), PR template,
   `platform-conformance` + `ci` workflows, Next.js/vitest/Playwright skeleton —
   substituting the slug, product key, and description.
3. Runs `npm install`, commits as
   `chore: bootstrap StaffySoft product repo`, and pushes `main`.
4. Applies branch protection: `platform-conformance` plus the four CI checks
   (`lint`, `typecheck`, `test`, `build`) required, one review required,
   force-push disallowed.
5. Registers the repo in [`product-registry.md`](./product-registry.md).

## Platform Conformance

- The schema for `.platform-conformance.yml`, the canonical PR template, and
  the enforcement workflow are defined by the Platform Conformance ADR
  ([core#53](https://github.com/Staffordshire-Software/core/issues/53)). The
  copies in `templates/product-repo/` carry `TODO: sync from core#53` markers
  until that lands.
- [`product-registry.md`](./product-registry.md) is the canonical list of all
  product repos. The
  [conformance drift monitor](./.github/workflows/conformance-drift-monitor.yml)
  scans the org daily (03:00 America/New_York), recomputes each repo's
  🟢/🟡/🔴 conformance column, flags unregistered repos, and opens or updates a
  "Conformance drift report" issue here when anything is 🔴.
  - The monitor uses the `DRIFT_MONITOR_TOKEN` secret to see private repos
    across the org. On private repos it needs **Contents: read** (config +
    repo listing), **Actions: read** (platform-conformance run status), and
    **Issues: write** (drift report); a token missing any of these 403s and
    aborts the scan. Without the secret it falls back to the default workflow
    token, which the workflow grants those same scopes, but only sees this repo.
  - Non-product repos (currently just `core`) are excluded from the scan via
    the `IGNORE_REPOS` env in the workflow, so they are never flagged as
    unregistered.

## Tests

```bash
node --test tests/*.test.mjs                        # drift-monitor unit tests
bash tests/integration/new-product-repo.test.sh     # bootstrap script against a gh shim
```
