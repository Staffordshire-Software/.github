# {{REPO_SLUG}}

{{DESCRIPTION}}

A StaffySoft product. Product key: `{{PRODUCT_KEY}}`.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit/component tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright end-to-end tests |

## Platform Conformance

This repo declares its conformance levels in
[`.platform-conformance.yml`](./.platform-conformance.yml). The
[`platform-conformance`](./.github/workflows/platform-conformance.yml) workflow
checks the declaration on every PR, and the org-wide drift monitor in
[Staffordshire-Software/.github](https://github.com/Staffordshire-Software/.github)
tracks this repo in the
[product registry](https://github.com/Staffordshire-Software/.github/blob/main/product-registry.md).

All checks start at `warned` (MVP-push default). Ratchet them to `required` as
the product hardens. The full standard is the
[StaffySoft Definition of Done](https://github.com/Staffordshire-Software/.github/blob/main/DEFINITION_OF_DONE.md).

## Environment variables

<!-- TODO: document required env vars. Secrets live in Vercel project env /
     1Password — never in the repo. -->

## Deploy

<!-- TODO: document deploy target (Vercel project) and preview-branch flow. -->
