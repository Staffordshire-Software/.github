# StaffySoft Product Registry

Canonical list of every StaffySoft product repo. New rows are appended by
[`scripts/new-product-repo.sh`](./scripts/new-product-repo.sh); the
**Conformance** column is recomputed daily by the
[conformance drift monitor](./.github/workflows/conformance-drift-monitor.yml):

- 🟢 — platform-conformance workflow green and every check `required`
- 🟡 — workflow green but checks still at `warned` (warned drift)
- 🔴 — config or workflow missing, or failing on `main` (required drift)

Rows the monitor appends for unregistered repos carry `?` metadata and stay
`🔴 unregistered` until a human fills in the product key, category, and status.

**Categories:** Shipped/Paid, Shipped/Beta, In development, Marketing/Landing, OSS, Held.
**Statuses:** Live, Beta, In development, Held, Archived.

| Repo | Product key | Category | Status | Conformance |
|---|---|---|---|---|
| [performer-prompter](https://github.com/Staffordshire-Software/performer-prompter) | performer-prompter | Shipped/Paid | Live | 🟡 |
| [voice-note-atomizer](https://github.com/Staffordshire-Software/voice-note-atomizer) | voice-note-atomizer | Shipped/Paid | Live | 🔴 |
| [billing-helper](https://github.com/Staffordshire-Software/billing-helper) | billing-helper | Shipped/Beta | Beta | 🟡 |
| [tonesmith](https://github.com/Staffordshire-Software/tonesmith) | tonesmith | In development | In development | 🔴 |
| [portfolio](https://github.com/Staffordshire-Software/portfolio) | portfolio | Marketing/Landing | Live | 🔴 |
| [dansmusicstudio.com](https://github.com/Staffordshire-Software/dansmusicstudio.com) | dansmusicstudio | Marketing/Landing | Live | 🔴 |
| [interview-lifeguard](https://github.com/Staffordshire-Software/interview-lifeguard) | interview-lifeguard | In development | In development | 🔴 |
| [haverford](https://github.com/Staffordshire-Software/haverford) | haverford | In development | In development | 🔴 |
| [teacher-presell](https://github.com/Staffordshire-Software/teacher-presell) | teacher-presell | Marketing/Landing | Live | 🔴 |
| [lattice](https://github.com/Staffordshire-Software/lattice) | lattice | Held | Held | 🔴 |
| [musicos](https://github.com/Staffordshire-Software/musicos) | musicos | In development | In development | 🟡 |
