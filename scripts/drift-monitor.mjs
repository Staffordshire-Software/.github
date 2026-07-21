#!/usr/bin/env node
// drift-monitor.mjs — org-wide platform-conformance drift monitor.
//
// Scans every non-archived repo in the org, computes a conformance emoji for
// each, updates product-registry.md in place, flags unregistered repos, and
// opens/updates a "Conformance drift report YYYY-MM-DD" issue in the meta
// repo when any repo is 🔴.
//
// Zero-dependency on purpose: runs with plain `node` in the
// conformance-drift-monitor.yml workflow, and its parsing helpers are unit
// tested with `node --test`.
//
// Env:
//   GITHUB_TOKEN   — token with org repo read + issue write on the meta repo
//   ORG            — org login (default Staffordshire-Software)
//   REGISTRY_PATH  — path to product-registry.md (default ./product-registry.md)
//   META_REPO      — meta repo name for drift issues (default .github)
//   DRY_RUN=1      — compute + rewrite registry locally, but skip issue API writes

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const API = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Registry parsing/rendering (pure — unit tested)
// ---------------------------------------------------------------------------

function splitRow(line) {
  // "| a | b |" -> ["a", "b"]
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function repoNameFromCell(cell) {
  const m = cell.match(/^\[([^\]]+)\]\(/);
  return m ? m[1] : cell;
}

// Parse the registry table. Returns [{ lineIndex, repo, productKey, category,
// status, conformance }] for every data row.
export function parseRegistry(markdown) {
  const lines = markdown.split('\n');
  const rows = [];
  let headerSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) continue;
    const cells = splitRow(line);
    if (cells.length < 5) continue;
    if (!headerSeen) {
      if (cells[0].toLowerCase() === 'repo') headerSeen = true;
      continue;
    }
    if (/^[-: ]+$/.test(cells[0])) continue; // separator row
    rows.push({
      lineIndex: i,
      repo: repoNameFromCell(cells[0]),
      productKey: cells[1],
      category: cells[2],
      status: cells[3],
      conformance: cells[4],
    });
  }
  return rows;
}

// Replace the Conformance cell of `repo`'s row. Returns updated markdown
// (unchanged if the repo has no row).
export function setConformance(markdown, repo, emoji) {
  const lines = markdown.split('\n');
  const row = parseRegistry(markdown).find((r) => r.repo === repo);
  if (!row) return markdown;
  const cells = splitRow(lines[row.lineIndex]);
  cells[4] = emoji;
  lines[row.lineIndex] = `| ${cells.join(' | ')} |`;
  return lines.join('\n');
}

// A row appended by the monitor itself, with `?` metadata that no one has
// filled in yet. Such rows stay `🔴 unregistered` until product key,
// category, AND status are all completed by a human.
export function isPlaceholderRow(row) {
  return [row.productKey, row.category, row.status].includes('?');
}

// Comma-separated list of org repos the monitor should skip entirely —
// non-product repos (e.g. `core`) that intentionally have no registry row.
export function parseIgnoreList(value) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

// Append a row for a repo that exists in the org but not in the registry.
export function appendUnregistered(markdown, org, repo) {
  const lines = markdown.split('\n');
  const rows = parseRegistry(markdown);
  if (rows.some((r) => r.repo === repo)) return markdown;
  const lastLine = rows.length
    ? rows[rows.length - 1].lineIndex
    : lines.findIndex((l) => /^\s*\|[-: |]+\|\s*$/.test(l));
  if (lastLine === -1) return markdown;
  const row = `| [${repo}](https://github.com/${org}/${repo}) | ? | ? | ? | 🔴 unregistered |`;
  lines.splice(lastLine + 1, 0, row);
  return lines.join('\n');
}

// Minimal parser for the flat `checks:` block of .platform-conformance.yml.
// Unknown levels are collected in `invalid` so they surface as drift instead
// of silently passing as 🟢.
// TODO: sync from core#53 once the canonical schema/parser lands.
export const CHECK_LEVELS = ['required', 'warned', 'exempt'];

export function parseConformanceConfig(yamlText) {
  const lines = yamlText.split('\n');
  const start = lines.findIndex((l) => /^checks:\s*$/.test(l));
  if (start === -1) return null;
  const checks = {};
  const invalid = {};
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue; // blank/comment lines don't end the block
    if (!/^\s+\S/.test(line)) break; // next top-level key does
    const m = line.match(/^\s+([A-Za-z0-9_]+):\s*([A-Za-z]+)/);
    if (!m) continue;
    const [, key, level] = m;
    if (CHECK_LEVELS.includes(level)) checks[key] = level;
    else invalid[key] = level;
  }
  const total = Object.keys(checks).length + Object.keys(invalid).length;
  return total ? { checks, invalid } : null;
}

// 🔴 config missing/invalid (including unknown check levels), workflow
//    missing, or the latest run on main did not succeed (failure, cancelled,
//    timed_out, action_required, still running, or no runs at all — anything
//    but an explicit `success` is drift).
// 🟡 workflow green but some checks still `warned` (warned drift).
// 🟢 workflow green and every check `required` (or `exempt`).
export function computeEmoji({ config, workflowPresent, latestConclusion }) {
  if (!config) return '🔴';
  if (Object.keys(config.invalid ?? {}).length > 0) return '🔴';
  if (!workflowPresent) return '🔴';
  if (latestConclusion !== 'success') return '🔴';
  const levels = Object.values(config.checks);
  if (levels.some((l) => l === 'warned')) return '🟡';
  return '🟢';
}

export function buildReportBody(entries, dateStr, opts = {}) {
  const {
    org = entries[0]?.org ?? 'Staffordshire-Software',
    metaRepo = '.github',
    registryPath = 'product-registry.md',
  } = opts;
  const red = entries.filter((e) => e.emoji.startsWith('🔴'));
  const lines = [
    `Automated conformance drift report for ${dateStr}.`,
    '',
    `Registry: [${registryPath}](https://github.com/${org}/${metaRepo}/blob/main/${registryPath})`,
    '',
    '## 🔴 Repos with required drift',
    '',
  ];
  if (red.length === 0) {
    lines.push('None. 🎉');
  } else {
    for (const e of red) {
      lines.push(`- [${e.repo}](https://github.com/${e.org}/${e.repo}) — ${e.reason}`);
    }
  }
  lines.push('', '## Full scan', '');
  for (const e of entries) {
    lines.push(`- ${e.emoji} [${e.repo}](https://github.com/${e.org}/${e.repo}) — ${e.reason}`);
  }
  lines.push('', '_Generated by conformance-drift-monitor.yml_');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// GitHub API plumbing
// ---------------------------------------------------------------------------

async function gh(token, path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub API ${method} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return raw ? res.text() : res.json();
}

async function listOrgRepos(token, org) {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await gh(token, `/orgs/${org}/repos?per_page=100&page=${page}`);
    if (!batch || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.archived);
}

async function scanRepo(token, org, repo) {
  const configText = await gh(
    token,
    `/repos/${org}/${repo}/contents/.platform-conformance.yml?ref=main`,
    { raw: true },
  );
  const config = configText ? parseConformanceConfig(configText) : null;

  const runs = await gh(
    token,
    `/repos/${org}/${repo}/actions/workflows/platform-conformance.yml/runs?branch=main&per_page=1`,
  );
  const workflowPresent = runs !== null;
  const latestConclusion = runs?.workflow_runs?.[0]?.conclusion ?? null;

  const emoji = computeEmoji({ config, workflowPresent, latestConclusion });
  // Keep this chain aligned with computeEmoji: same conditions, same order.
  const invalidKeys = Object.keys(config?.invalid ?? {});
  const reason = !configText
    ? '.platform-conformance.yml missing'
    : !config
      ? '.platform-conformance.yml has no valid checks block'
      : invalidKeys.length > 0
        ? `invalid check level(s) in .platform-conformance.yml: ${invalidKeys.join(', ')}`
        : !workflowPresent
          ? 'platform-conformance workflow missing'
          : latestConclusion !== 'success'
            ? `platform-conformance not passing on main (latest: ${latestConclusion ?? 'no runs'})`
            : emoji === '🟡'
              ? 'warned drift (checks still at `warned`)'
              : 'clean';
  return { org, repo, emoji, reason };
}

async function upsertDriftIssue(token, org, metaRepo, body, dateStr, dryRun) {
  const title = `Conformance drift report ${dateStr}`;
  if (dryRun) {
    console.log(`[dry-run] would open/update issue: ${title}`);
    return;
  }
  const issues = (await gh(token, `/repos/${org}/${metaRepo}/issues?state=open&per_page=100`)) ?? [];
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = issues
    .filter((i) => !i.pull_request && i.title.startsWith('Conformance drift report'))
    .filter((i) => new Date(i.created_at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  if (recent) {
    await gh(token, `/repos/${org}/${metaRepo}/issues/${recent.number}`, {
      method: 'PATCH',
      body: { title, body },
    });
    console.log(`Updated drift issue #${recent.number}`);
  } else {
    const created = await gh(token, `/repos/${org}/${metaRepo}/issues`, {
      method: 'POST',
      body: { title, body },
    });
    console.log(`Opened drift issue #${created.number}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const org = process.env.ORG || 'Staffordshire-Software';
  const metaRepo = process.env.META_REPO || '.github';
  const registryPath = process.env.REGISTRY_PATH || 'product-registry.md';
  const ignoreRepos = parseIgnoreList(process.env.IGNORE_REPOS);
  const dryRun = process.env.DRY_RUN === '1';
  const dateStr = new Date().toISOString().slice(0, 10);

  const repos = await listOrgRepos(token, org);
  console.log(`Scanning ${repos.length} non-archived repos in ${org}...`);

  let registry = readFileSync(registryPath, 'utf8');
  const rowsByRepo = new Map(parseRegistry(registry).map((r) => [r.repo, r]));

  const entries = [];
  for (const r of repos) {
    if (r.name === metaRepo || ignoreRepos.has(r.name)) continue;
    const entry = await scanRepo(token, org, r.name);
    entries.push(entry);
    const row = rowsByRepo.get(r.name);
    if (row && !isPlaceholderRow(row)) {
      registry = setConformance(registry, r.name, entry.emoji);
    } else {
      // Missing row, or a placeholder row from an earlier run whose metadata
      // was never filled in — either way it stays flagged as unregistered.
      console.log(`Unregistered repo found: ${r.name}`);
      registry = appendUnregistered(registry, org, r.name);
      entry.emoji = '🔴 unregistered';
      entry.reason += row
        ? ' (registry row has placeholder metadata — fill in product key/category/status)'
        : ' (not in product-registry.md)';
    }
    console.log(`  ${entry.emoji} ${r.name}: ${entry.reason}`);
  }

  writeFileSync(registryPath, registry);
  console.log(`Registry updated: ${registryPath}`);

  const hasRed = entries.some((e) => e.emoji.startsWith('🔴'));
  if (hasRed) {
    const body = buildReportBody(entries, dateStr, { org, metaRepo, registryPath });
    await upsertDriftIssue(token, org, metaRepo, body, dateStr, dryRun);
  } else {
    console.log('No 🔴 rows — skipping drift issue.');
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
