# Staffordshire Software

A small portfolio of focused web apps, sharing one auth and billing core so each app can be sold independently when the time comes.

- **[staffordshire-software/core](https://github.com/Staffordshire-Software/core)** — auth, billing, entitlements, analytics. Every other app is a client of this.
- **Definition of Done** for any commercially deployed repo: [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md)
- **Product registry** — canonical list of every product repo, with daily-updated conformance status: [product-registry.md](https://github.com/Staffordshire-Software/.github/blob/main/product-registry.md). New repos start from [`scripts/new-product-repo.sh`](https://github.com/Staffordshire-Software/.github/blob/main/scripts/new-product-repo.sh).

## Standards

Every commercial app inherits the same checklist: core auth, core billing, Sentry, PostHog through core, reversible migrations, phone-first responsive, exportable user data. See the DoD for the full canon.
