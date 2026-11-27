import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildCopy, loadRulesManifest, rulesToEnable } from './rules.ts';

const manifest = loadRulesManifest();
const copies = manifest.rules.flatMap(({ copy }) => (copy ? [copy.rule_id] : []));

describe('ai-agents-rules manifest', () => {
  it('has a query file for every copy, and a reason for every original without one', () => {
    assert.equal(manifest.rules.length, 18);
    assert.equal(copies.length, 9);
    manifest.rules.forEach(({ copy, no_copy_reason, name }) => {
      if (copy) {
        assert.ok(existsSync(new URL(`./rules/${copy.query_file}`, import.meta.url)), name);
      } else {
        assert.ok(no_copy_reason, name);
      }
    });
  });

  it('demo enables the promotion rule, the copies but the MCP child, and originals with no copy', () => {
    const demo = rulesToEnable('demo', manifest, copies);
    assert.equal(demo.length, 1 + 8 + 9);
    assert.ok(demo.includes(manifest.promotion_rule.rule_id));
    assert.ok(!demo.includes('616dd7cb-cee9-5220-a5d9-213116358999'));
    manifest.rules
      .filter(({ copy }) => copy)
      .forEach(({ rule_id }) => assert.ok(!demo.includes(rule_id)));
  });

  it('builds a disabled copy with the original name, the copy tag and its own query', () => {
    const entry = manifest.rules.find(({ copy }) => copy?.query_file.endsWith('.esql'));
    assert.ok(entry?.copy);
    const copy = buildCopy(
      {
        rule_id: entry.rule_id,
        name: entry.name,
        enabled: true,
        description: 'Original.',
        tags: ['Domain: GenAI'],
        type: 'esql',
        index: ['logs-*'],
        version: 3,
      },
      entry,
      manifest,
    );
    assert.equal(copy.rule_id, entry.copy.rule_id);
    assert.equal(copy.name, entry.name);
    assert.equal(copy.enabled, false);
    assert.deepEqual(copy.tags, ['Domain: GenAI', manifest.copy_tag]);
    assert.equal(copy.index, undefined);
    assert.equal(copy.version, undefined);
    assert.match(String(copy.query), /process\.ai_agent/);
  });
});
