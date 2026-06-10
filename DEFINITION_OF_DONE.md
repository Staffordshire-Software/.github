# StaffySoft — Definition of Done

Standards every commercially deployed StaffySoft repo must meet before shipping to real users.

- **MUST** items are blocking. A PR introducing new functionality cannot merge to `main` without them.
- **SHOULD** items are strong defaults. Deviation requires a comment in the PR.
- **NICE** items are aspirational.

This is canon. If you find yourself wanting to skip an item, open a PR against this file with the justification.

---

## 1. Auth & Identity

- **MUST** authenticate users via `@staffysoft/core-client`. No app-local user table.
- **MUST** use `getSession()` / `requireAuth()` from the SDK on every protected route.
- **SHOULD** support guest → user merge via `mergeGuest()` for any pre-signup activity.

## 2. Billing & Entitlements

- **MUST** check entitlements via `getEntitlements()` from the SDK. Apps do not own Stripe customers, subscriptions, or invoices — core does.
- **MUST** fail closed. If the entitlement check fails or is unreachable, deny access. No "default to free tier" silent fallback.
- **SHOULD** include the entitlement key in any billing-related audit log line.

## 3. Security

- **MUST** store secrets in Vercel project env or 1Password. Never committed to the repo.
- **MUST** enable Dependabot (or Renovate) for npm and GitHub Actions.
- **MUST** apply security headers via middleware: CSP, HSTS, X-Frame-Options, Referrer-Policy.
- **MUST** rate-limit auth and write endpoints (Upstash recommended).
- **MUST** keep an audit log for billing, admin, and entitlement changes.
- **SHOULD** run a security review on the diff before any release that touches auth, billing, or user-data routes.

## 4. Reliability

- **MUST** report errors to Sentry using the StaffySoft project DSN for that app.
- **MUST** expose `/api/health` returning DB + core reachability.
- **MUST** have an uptime monitor pinging `/api/health` at least every 5 minutes.
- **MUST** make every DB migration reversible. The PR introducing it documents the rollback step.
- **SHOULD** add performance tracing (Sentry Performance or Vercel Speed Insights) to the top 3 user flows.

## 5. Observability & Product Analytics

- **MUST** emit user-action events via the SDK's `trackEvent`. Analytics are routed through core — same architecture as Stripe — so cross-app behavior is correlatable.
- **SHOULD** wire PostHog session replay on the frontend, with PII masked by default.
- **SHOULD** define and track activation, retention, and revenue metrics in the PostHog project owned by core.

## 6. Legal & Compliance

- **MUST** publish Privacy Policy and Terms of Service pages, linked from the global footer.
- **MUST** support GDPR data export and delete via core's SDK endpoints.
- **MUST** route customer support to an inbox a human reads.
- **SHOULD** display a cookie banner if the app accepts EU traffic.
- **SHOULD** keep a Data Processing Agreement on file for every third-party processor (Stripe, Resend, Sentry, PostHog, Vercel).

## 7. CI / CD

- **MUST** run typecheck, lint, test, and build on every PR. All four are required checks.
- **MUST** require at least one review on `main`. No direct push.
- **MUST** deploy preview branches to Vercel for every PR.
- **SHOULD** tag releases on `main` and keep a `CHANGELOG.md`.

## 8. Product & UX

- **MUST** be mobile responsive. Phone-first is the StaffySoft default.
- **MUST** include empty, loading, and error states for every async surface.
- **MUST** meet WCAG AA contrast and support full keyboard navigation.
- **MUST** include SEO basics: title, meta description, OG image, `sitemap.xml`, `robots.txt`.
- **SHOULD** include a favicon set and platform-specific manifest icons.

## 9. Documentation

- **MUST** include a `README.md` covering: what the app does, how to run locally, required env vars, deploy targets.
- **MUST** record load-bearing decisions as ADRs in `docs/adr/`.
- **MUST** include a `RUNBOOK.md` covering: how to roll back a release, how to debug a paying customer, how to revoke entitlements.

## 10. Sellability

The portfolio thesis only works if every app is independently sellable. That requires:

- **MUST** export all user-owned data as one downloadable archive.
- **MUST** depend only on `@staffysoft/core-client` for cross-app coupling. No shared DB, no shared internal services.
- **MUST** keep StaffySoft branding out of DB schemas, table names, and persisted strings.
- **SHOULD** keep a `BILL_OF_MATERIALS.md` listing every third-party service, what data it sees, and what a buyer would inherit.

---

## Reviewing against this checklist

Every PR template in StaffySoft repos references this document. Reviewers should refuse to merge a PR that introduces a violation of a MUST item without a documented exception.
