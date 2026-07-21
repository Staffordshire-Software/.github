#!/usr/bin/env bash
#
# new-product-repo.sh — bootstrap a fully-conformant StaffySoft product repo.
#
# Usage:
#   ./scripts/new-product-repo.sh <repo-slug> <product-key> "<description>"
#
# Example:
#   ./scripts/new-product-repo.sh dans-music-school dans-music-school "Scheduling and billing for Dan's Music School"
#
# What it does:
#   1. Creates Staffordshire-Software/<slug> as a private repo.
#   2. Clones it locally.
#   3. Copies templates/product-repo/ from this meta repo and substitutes
#      {{REPO_SLUG}}, {{PRODUCT_KEY}}, {{DESCRIPTION}}.
#   4. npm install (locks the vitest scaffold in place).
#   5. Commits as "chore: bootstrap StaffySoft product repo" (author Dan O'Dea)
#      and pushes main.
#   6. Applies branch protection: platform-conformance required, review
#      required, force-push disallowed.
#   7. Registers the repo in product-registry.md and pushes that too.
#
# Environment overrides (mainly for tests):
#   BOOTSTRAP_ORG       — GitHub org (default Staffordshire-Software)
#   BOOTSTRAP_WORKDIR   — where to clone the new repo (default /tmp/<slug>)
#   BOOTSTRAP_SKIP_REGISTRY_PUSH=1 — update product-registry.md but don't push

set -euo pipefail

ORG="${BOOTSTRAP_ORG:-Staffordshire-Software}"
GIT_AUTHOR="Dan O'Dea"
GIT_EMAIL="danodeawebdev@gmail.com"

err() { printf 'error: %s\n' "$*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

usage() {
  sed -n '3,7p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

[ $# -eq 3 ] || usage

SLUG="$1"
PRODUCT_KEY="$2"
DESCRIPTION="$3"

[[ "$SLUG" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || err "repo slug '$SLUG' must be lowercase alphanumeric with dots/dashes"
[[ "$PRODUCT_KEY" =~ ^[a-z0-9][a-z0-9-]*$ ]] || err "product key '$PRODUCT_KEY' must be lowercase alphanumeric with dashes"
[ -n "$DESCRIPTION" ] || err "description must not be empty"
case "$DESCRIPTION" in
  *$'\n'*|*$'\r'*) err "description must be a single line" ;;
esac

command -v gh >/dev/null || err "gh CLI is required (https://cli.github.com)"
command -v git >/dev/null || err "git is required"
command -v npm >/dev/null || err "npm is required"
gh auth status >/dev/null 2>&1 || err "gh is not authenticated — run 'gh auth login'"

# Resolve the meta repo root (this script lives in <meta>/scripts/).
META_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_DIR="$META_ROOT/templates/product-repo"
REGISTRY="$META_ROOT/product-registry.md"
[ -d "$TEMPLATE_DIR" ] || err "template dir not found: $TEMPLATE_DIR"
[ -f "$REGISTRY" ] || err "product registry not found: $REGISTRY"

WORK_DIR="${BOOTSTRAP_WORKDIR:-/tmp/$SLUG}"
[ -e "$WORK_DIR" ] && err "working dir $WORK_DIR already exists — remove it first"

# Portable in-place sed (BSD sed on macOS needs a backup suffix).
sed_inplace() {
  sed -i.bootstrap-bak "$@" && rm -f "${!#}.bootstrap-bak"
}

step "Creating $ORG/$SLUG (private)"
gh repo create "$ORG/$SLUG" --private --description "$DESCRIPTION"

step "Cloning into $WORK_DIR"
gh repo clone "$ORG/$SLUG" "$WORK_DIR"
git -C "$WORK_DIR" checkout -B main

step "Copying templates from $TEMPLATE_DIR"
cp -R "$TEMPLATE_DIR/." "$WORK_DIR/"

step "Substituting placeholders"
# Slug and product key are validated to safe charsets above. The free-text
# description is escaped per target syntax: templates emit it inside
# single-quoted strings in .ts/.tsx and double-quoted strings in .json/.yml,
# so quotes and backslashes must not break the generated file.
esc_sed() { printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'; }
DESC_TS="$(printf '%s' "$DESCRIPTION" | sed -e 's/\\/\\\\/g' -e "s/'/\\\\'/g")"
DESC_DQ="$(printf '%s' "$DESCRIPTION" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
E_SLUG="$(esc_sed "$SLUG")"; E_KEY="$(esc_sed "$PRODUCT_KEY")"
find "$WORK_DIR" -type f -not -path "$WORK_DIR/.git/*" | while IFS= read -r f; do
  if grep -qI '{{' "$f" 2>/dev/null; then
    case "$f" in
      *.ts|*.tsx)          desc="$DESC_TS" ;;
      *.json|*.yml|*.yaml) desc="$DESC_DQ" ;;
      *)                   desc="$DESCRIPTION" ;;
    esac
    sed_inplace \
      -e "s|{{REPO_SLUG}}|$E_SLUG|g" \
      -e "s|{{PRODUCT_KEY}}|$E_KEY|g" \
      -e "s|{{DESCRIPTION}}|$(esc_sed "$desc")|g" \
      "$f"
  fi
done

step "Running npm install"
(cd "$WORK_DIR" && npm install)

step "Committing and pushing"
git -C "$WORK_DIR" add -A
git -C "$WORK_DIR" \
  -c user.name="$GIT_AUTHOR" -c user.email="$GIT_EMAIL" \
  commit -m "chore: bootstrap StaffySoft product repo" \
  --author="$GIT_AUTHOR <$GIT_EMAIL>"
git -C "$WORK_DIR" push -u origin main

step "Applying branch protection on main"
# platform-conformance required, 1 review required, no force-push.
gh api "repos/$ORG/$SLUG/branches/main/protection" \
  --method PUT \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["platform-conformance"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

step "Registering in product-registry.md"
# Preflight: only auto-commit the registry when the meta checkout is on main
# with nothing staged/modified, so we never commit onto the wrong branch or
# sweep unrelated changes into the registry commit.
META_BRANCH="$(git -C "$META_ROOT" rev-parse --abbrev-ref HEAD)"
META_DIRTY="$(git -C "$META_ROOT" status --porcelain --untracked-files=no)"
# Fixed-string match — slugs may contain dots, which grep would otherwise
# treat as regex wildcards.
if grep -qF "| [$SLUG](" "$REGISTRY"; then
  echo "  $SLUG already registered — skipping"
else
  # Append the row directly after the last table row.
  printf '| [%s](https://github.com/%s/%s) | %s | In development | In development | 🟡 |\n' \
    "$SLUG" "$ORG" "$SLUG" "$PRODUCT_KEY" >> "$REGISTRY.row"
  awk -v row="$(cat "$REGISTRY.row")" '
    /^\|/ { last_table_line = NR }
    { lines[NR] = $0 }
    END {
      for (i = 1; i <= NR; i++) {
        print lines[i]
        if (i == last_table_line) print row
      }
    }
  ' "$REGISTRY" > "$REGISTRY.tmp" && mv "$REGISTRY.tmp" "$REGISTRY"
  rm -f "$REGISTRY.row"
  if [ "$META_BRANCH" != "main" ] || [ -n "$META_DIRTY" ]; then
    echo "  warning: meta repo not clean on main (branch: $META_BRANCH${META_DIRTY:+, uncommitted changes present})"
    echo "  product-registry.md was updated locally — commit and push it manually"
  else
    git -C "$META_ROOT" add "$(basename "$REGISTRY")"
    git -C "$META_ROOT" \
      -c user.name="$GIT_AUTHOR" -c user.email="$GIT_EMAIL" \
      commit -m "chore: register $SLUG in product registry" \
      --author="$GIT_AUTHOR <$GIT_EMAIL>"
    if [ "${BOOTSTRAP_SKIP_REGISTRY_PUSH:-0}" != "1" ]; then
      git -C "$META_ROOT" push || \
        echo "  warning: could not push registry update — push $META_ROOT manually"
    fi
  fi
fi

cat <<DONE

✅ $ORG/$SLUG bootstrapped.

  Repo:      https://github.com/$ORG/$SLUG
  Local:     $WORK_DIR
  Registry:  product-registry.md (row appended)

Next steps:
  1. Open a trivial PR to confirm the platform-conformance check passes.
  2. Wire the app to @staffysoft/core-client (auth, entitlements, trackEvent).
  3. Set up the Vercel project + env vars, Sentry DSN, uptime monitor.
  4. Ratchet .platform-conformance.yml checks from 'warned' to 'required'
     as each DoD item lands.
DONE
