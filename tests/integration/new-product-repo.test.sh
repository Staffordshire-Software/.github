#!/usr/bin/env bash
# Integration test for scripts/new-product-repo.sh.
#
# Runs the bootstrap script end-to-end against a mocked `gh` shim and local
# bare git repos standing in for github.com, then asserts that:
#   - all template files land in the pushed repo
#   - placeholders are substituted everywhere
#   - the bootstrap commit is authored by Dan O'Dea with the right message
#   - branch protection is applied (PUT with the platform-conformance context)
#   - npm install ran
#   - the repo is registered in product-registry.md and pushed to the meta repo

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FAKE_REMOTES="$TMP/remotes"
LOG_DIR="$TMP/logs"
mkdir -p "$FAKE_REMOTES" "$LOG_DIR" "$TMP/bin"

FAILURES=0
check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "  ok: $desc"
  else
    echo "  FAIL: $desc"
    FAILURES=$((FAILURES + 1))
  fi
}

# --- gh shim ----------------------------------------------------------------
cat > "$TMP/bin/gh" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
log() { printf '%s\n' "$*" >> "$LOG_DIR/gh-calls.log"; }
case "$1 $2" in
  "auth status")
    exit 0 ;;
  "repo create")
    slug="${3#*/}"
    log "repo create $3"
    git init --bare --initial-branch=main "$FAKE_REMOTES/$slug.git" >/dev/null
    exit 0 ;;
  "repo clone")
    slug="${3#*/}"
    log "repo clone $3 -> $4"
    git clone "$FAKE_REMOTES/$slug.git" "$4" 2>/dev/null
    exit 0 ;;
  "api "*|api*)
    shift
    log "api $*"
    # Capture any JSON piped via --input -
    if printf '%s\n' "$*" | grep -q -- '--input'; then
      cat >> "$LOG_DIR/gh-api-input.log"
    fi
    echo '{}'
    exit 0 ;;
  *)
    log "UNEXPECTED: $*"
    exit 1 ;;
esac
SHIM
chmod +x "$TMP/bin/gh"

# --- npm shim (real npm install would hit the network) ----------------------
cat > "$TMP/bin/npm" <<'SHIM'
#!/usr/bin/env bash
printf '%s\n' "npm $*" >> "$LOG_DIR/npm-calls.log"
[ "$1" = "install" ] && echo '{"lockfileVersion": 3}' > package-lock.json
exit 0
SHIM
chmod +x "$TMP/bin/npm"

# --- meta repo standing in for Staffordshire-Software/.github ---------------
git init --bare --initial-branch=main "$FAKE_REMOTES/meta.git" >/dev/null
git clone "$FAKE_REMOTES/meta.git" "$TMP/meta" 2>/dev/null
cp -R "$REPO_ROOT/scripts" "$REPO_ROOT/templates" "$TMP/meta/"
cp "$REPO_ROOT/product-registry.md" "$TMP/meta/"
git -C "$TMP/meta" add -A
git -C "$TMP/meta" -c user.name=test -c user.email=test@test commit -qm 'seed meta repo'
git -C "$TMP/meta" push -q origin main

# --- run the bootstrap ------------------------------------------------------
echo "Running bootstrap script against gh shim..."
env PATH="$TMP/bin:$PATH" \
    LOG_DIR="$LOG_DIR" FAKE_REMOTES="$FAKE_REMOTES" \
    BOOTSTRAP_ORG="TestOrg" BOOTSTRAP_WORKDIR="$TMP/work/demo-app" \
    bash "$TMP/meta/scripts/new-product-repo.sh" \
    demo-app demo-key "A demo app with 'quotes', \"dquotes\" & ampersands" \
    > "$LOG_DIR/bootstrap.log" 2>&1 || {
  echo "FAIL: bootstrap script exited non-zero"
  cat "$LOG_DIR/bootstrap.log"
  exit 1
}

# --- assertions -------------------------------------------------------------
echo "Asserting on the pushed product repo..."
git clone "$FAKE_REMOTES/demo-app.git" "$TMP/verify" 2>/dev/null

for f in \
  .platform-conformance.yml \
  .github/PULL_REQUEST_TEMPLATE.md \
  .github/workflows/platform-conformance.yml \
  .github/workflows/ci.yml \
  README.md package.json package-lock.json \
  vitest.config.ts tsconfig.json .gitignore .eslintrc.json \
  app/layout.tsx app/page.tsx tests/smoke.test.ts; do
  check "pushed repo contains $f" test -f "$TMP/verify/$f"
done

check "no unsubstituted placeholders remain" \
  bash -c '! grep -rI --exclude-dir=.git -e "{{ORG}}" -e "{{REPO_SLUG}}" -e "{{PRODUCT_KEY}}" -e "{{DESCRIPTION}}" "$1"' _ "$TMP/verify"
check "slug substituted into package.json" grep -q '"name": "demo-app"' "$TMP/verify/package.json"
check "product key substituted into conformance config" grep -q 'key: "demo-key"' "$TMP/verify/.platform-conformance.yml"
check "org substituted into conformance repo field" grep -q 'repo: "TestOrg/demo-app"' "$TMP/verify/.platform-conformance.yml"
check "description substituted verbatim into README (markdown)" \
  grep -qF "A demo app with 'quotes', \"dquotes\" & ampersands" "$TMP/verify/README.md"
check "single quotes escaped in .tsx (TS string context)" \
  grep -qF "with \\'quotes\\'" "$TMP/verify/app/layout.tsx"
check "double quotes escaped in .yml (YAML string context)" \
  grep -qF '\"dquotes\"' "$TMP/verify/.platform-conformance.yml"
check "package.json remains valid JSON after substitution" \
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$TMP/verify/package.json"

AUTHOR="$(git -C "$TMP/verify" log -1 --format='%an <%ae>')"
check "commit authored by Dan O'Dea" test "$AUTHOR" = "Dan O'Dea <danodeawebdev@gmail.com>"
MSG="$(git -C "$TMP/verify" log -1 --format='%s')"
check "commit message is the bootstrap chore" test "$MSG" = "chore: bootstrap StaffySoft product repo"

echo "Asserting on branch protection call..."
check "gh api called on branches/main/protection" \
  grep -q 'api repos/TestOrg/demo-app/branches/main/protection' "$LOG_DIR/gh-calls.log"
check "protection call used PUT" grep -q -- '--method PUT' "$LOG_DIR/gh-calls.log"
check "protection requires platform-conformance + all four CI checks" \
  grep -q '"contexts": \["platform-conformance", "lint", "typecheck", "test", "build"\]' "$LOG_DIR/gh-api-input.log"
check "protection disallows force pushes" \
  grep -q '"allow_force_pushes": false' "$LOG_DIR/gh-api-input.log"
check "protection requires a review" \
  grep -q '"required_approving_review_count": 1' "$LOG_DIR/gh-api-input.log"

echo "Asserting on npm + registry..."
check "npm install ran" grep -q '^npm install' "$LOG_DIR/npm-calls.log"

git clone "$FAKE_REMOTES/meta.git" "$TMP/meta-verify" 2>/dev/null
check "registry row pushed to meta repo" \
  grep -q '| \[demo-app\](https://github.com/TestOrg/demo-app) | demo-key |' \
  "$TMP/meta-verify/product-registry.md"
check "registry commit authored by Dan O'Dea" \
  bash -c '[ "$(git -C "$0" log -1 --format="%an <%ae>")" = "Dan O'\''Dea <danodeawebdev@gmail.com>" ]' "$TMP/meta-verify"

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "❌ $FAILURES assertion(s) failed"
  exit 1
fi
echo "✅ all integration assertions passed"
