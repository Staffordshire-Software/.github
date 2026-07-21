import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRegistry,
  repoNameFromCell,
  setConformance,
  appendUnregistered,
  parseConformanceConfig,
  computeEmoji,
  buildReportBody,
  isPlaceholderRow,
  parseIgnoreList,
} from '../scripts/drift-monitor.mjs';

const SAMPLE = `# StaffySoft Product Registry

Some prose.

| Repo | Product key | Category | Status | Conformance |
|---|---|---|---|---|
| [performer-prompter](https://github.com/Staffordshire-Software/performer-prompter) | performer-prompter | Shipped/Paid | Live | 🟡 |
| [voice-note-atomizer](https://github.com/Staffordshire-Software/voice-note-atomizer) | voice-note-atomizer | Shipped/Paid | Live | 🔴 |
| plain-cell-repo | plain | OSS | Live | 🟢 |

Trailing prose.
`;

test('repoNameFromCell strips markdown links', () => {
  assert.equal(repoNameFromCell('[foo](https://github.com/x/foo)'), 'foo');
  assert.equal(repoNameFromCell('foo'), 'foo');
});

test('parseRegistry extracts all data rows, skipping header and separator', () => {
  const rows = parseRegistry(SAMPLE);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.repo),
    ['performer-prompter', 'voice-note-atomizer', 'plain-cell-repo'],
  );
  assert.equal(rows[0].productKey, 'performer-prompter');
  assert.equal(rows[0].category, 'Shipped/Paid');
  assert.equal(rows[0].status, 'Live');
  assert.equal(rows[0].conformance, '🟡');
});

test('parseRegistry returns empty array when there is no table', () => {
  assert.deepEqual(parseRegistry('# Nothing here\n\nJust prose.\n'), []);
});

test('setConformance rewrites only the target row', () => {
  const updated = setConformance(SAMPLE, 'voice-note-atomizer', '🟢');
  const rows = parseRegistry(updated);
  assert.equal(rows.find((r) => r.repo === 'voice-note-atomizer').conformance, '🟢');
  assert.equal(rows.find((r) => r.repo === 'performer-prompter').conformance, '🟡');
  assert.match(updated, /Trailing prose\./);
});

test('setConformance is a no-op for unknown repos', () => {
  assert.equal(setConformance(SAMPLE, 'no-such-repo', '🟢'), SAMPLE);
});

test('appendUnregistered adds a red row after the last table row', () => {
  const updated = appendUnregistered(SAMPLE, 'Staffordshire-Software', 'rogue-repo');
  const rows = parseRegistry(updated);
  assert.equal(rows.length, 4);
  const rogue = rows.find((r) => r.repo === 'rogue-repo');
  assert.equal(rogue.conformance, '🔴 unregistered');
  // Row lands inside the table, before trailing prose.
  assert.ok(updated.indexOf('rogue-repo') < updated.indexOf('Trailing prose.'));
});

test('appendUnregistered does not duplicate an existing row', () => {
  const updated = appendUnregistered(SAMPLE, 'Staffordshire-Software', 'plain-cell-repo');
  assert.equal(updated, SAMPLE);
});

test('parseConformanceConfig reads the flat checks block', () => {
  const cfg = parseConformanceConfig(
    'version: 1\nchecks:\n  auth_via_core_client: warned\n  sentry_wired: required\nother:\n  nope: x\n',
  );
  assert.deepEqual(cfg, {
    checks: { auth_via_core_client: 'warned', sentry_wired: 'required' },
    invalid: {},
  });
});

test('parseConformanceConfig collects unknown levels as invalid', () => {
  const cfg = parseConformanceConfig(
    'checks:\n  a: requireded\n  b: required\n  c: bogus\n',
  );
  assert.deepEqual(cfg, {
    checks: { b: 'required' },
    invalid: { a: 'requireded', c: 'bogus' },
  });
});

test('parseConformanceConfig returns null without a checks block', () => {
  assert.equal(parseConformanceConfig('version: 1\n'), null);
  assert.equal(parseConformanceConfig('checks:\nno_indent: required\n'), null);
});

test('computeEmoji: missing config or workflow, or failing main, is red', () => {
  const config = { checks: { a: 'required' } };
  assert.equal(computeEmoji({ config: null, workflowPresent: true, latestConclusion: 'success' }), '🔴');
  assert.equal(computeEmoji({ config, workflowPresent: false, latestConclusion: null }), '🔴');
  assert.equal(computeEmoji({ config, workflowPresent: true, latestConclusion: 'failure' }), '🔴');
});

test('computeEmoji: invalid check levels are red, never green', () => {
  assert.equal(
    computeEmoji({
      config: { checks: { b: 'required' }, invalid: { a: 'requireded' } },
      workflowPresent: true,
      latestConclusion: 'success',
    }),
    '🔴',
  );
});

test('isPlaceholderRow flags any unfilled metadata column, not just product key', () => {
  const filled = { repo: 'x', productKey: 'x', category: 'OSS', status: 'Live' };
  assert.equal(isPlaceholderRow(filled), false);
  assert.equal(isPlaceholderRow({ ...filled, productKey: '?' }), true);
  assert.equal(isPlaceholderRow({ ...filled, category: '?' }), true);
  assert.equal(isPlaceholderRow({ ...filled, status: '?' }), true);
});

test('parseIgnoreList splits, trims, and drops empties', () => {
  assert.deepEqual([...parseIgnoreList('core, infra ,')], ['core', 'infra']);
  assert.deepEqual([...parseIgnoreList('')], []);
  assert.deepEqual([...parseIgnoreList(undefined)], []);
});

test('computeEmoji: any non-success conclusion is red, including no runs at all', () => {
  const config = { checks: { a: 'required' } };
  for (const latestConclusion of [null, 'cancelled', 'timed_out', 'action_required']) {
    assert.equal(
      computeEmoji({ config, workflowPresent: true, latestConclusion }),
      '🔴',
      `latestConclusion=${latestConclusion} should be red`,
    );
  }
});

test('computeEmoji: warned drift is yellow, all-required clean is green', () => {
  assert.equal(
    computeEmoji({
      config: { checks: { a: 'warned', b: 'required' } },
      workflowPresent: true,
      latestConclusion: 'success',
    }),
    '🟡',
  );
  assert.equal(
    computeEmoji({
      config: { checks: { a: 'required', b: 'exempt' } },
      workflowPresent: true,
      latestConclusion: 'success',
    }),
    '🟢',
  );
});

test('buildReportBody lists red repos first and the full scan after', () => {
  const entries = [
    { org: 'Staffordshire-Software', repo: 'ok-repo', emoji: '🟢', reason: 'clean' },
    { org: 'Staffordshire-Software', repo: 'bad-repo', emoji: '🔴', reason: 'config missing' },
    { org: 'Staffordshire-Software', repo: 'rogue', emoji: '🔴 unregistered', reason: 'not registered' },
  ];
  const body = buildReportBody(entries, '2026-07-21');
  assert.match(body, /drift report for 2026-07-21/);
  const redSection = body.split('## Full scan')[0];
  assert.match(redSection, /bad-repo/);
  assert.match(redSection, /rogue/);
  assert.doesNotMatch(redSection, /- \[ok-repo\]/);
  assert.match(body.split('## Full scan')[1], /ok-repo/);
});

test('buildReportBody links the registry using the provided org/meta-repo/path', () => {
  const body = buildReportBody(
    [{ org: 'MyOrg', repo: 'a', emoji: '🔴', reason: 'config missing' }],
    '2026-07-21',
    { org: 'MyOrg', metaRepo: 'meta', registryPath: 'registry.md' },
  );
  assert.match(body, /https:\/\/github\.com\/MyOrg\/meta\/blob\/main\/registry\.md/);
});

test('buildReportBody with no red entries says none', () => {
  const body = buildReportBody(
    [{ org: 'o', repo: 'a', emoji: '🟢', reason: 'clean' }],
    '2026-07-21',
  );
  assert.match(body, /None\. 🎉/);
});
