<!-- TODO: sync from core#53 — canonical PR template shape is finalized in
     https://github.com/Staffordshire-Software/core/issues/53. This copy is the
     org-wide template from Staffordshire-Software/.github until then. -->

## Summary

<!-- What does this change do and why? -->

## Definition of Done

Full canon: [DEFINITION_OF_DONE.md](https://github.com/Staffordshire-Software/.github/blob/main/DEFINITION_OF_DONE.md)
Conformance levels for this repo: [.platform-conformance.yml](../.platform-conformance.yml)

- [ ] Auth through `@staffysoft/core-client`
- [ ] Entitlements via `getEntitlements()` (if gated)
- [ ] No secrets in repo; Dependabot on
- [ ] Security headers + rate limiting on auth/write endpoints
- [ ] Sentry wired; `/api/health` covers any new dependency
- [ ] DB migrations reversible; rollback documented below
- [ ] Events emitted via `trackEvent` (analytics through core)
- [ ] Typecheck + lint + test + build pass
- [ ] Mobile responsive; empty / loading / error states present
- [ ] AA contrast + keyboard nav for any new UI
- [ ] README / ADRs / RUNBOOK updated if scope changed

## Rollback

<!-- How do we undo this if it goes wrong? -->

## Screenshots / Recording

<!-- For UI changes -->
