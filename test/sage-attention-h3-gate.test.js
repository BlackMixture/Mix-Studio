'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { h3SageAttentionDecision } = require('../lib/sage-attention');

// The four reports probeSageAttention() can hand the MiniMax H3 route, as that route
// sees them. Only the first two describe a machine that was actually inspected.
const verifiedReady = {
  ready: true,
  installable: true,
  pythonReady: true,
  verifiable: true,
  reason: '',
};
const verifiedUnusable = {
  ready: false,
  installable: false,
  pythonReady: true,
  verifiable: true,
  reason: 'Triton is not ready in the ComfyUI Python environment.',
};
const notInspected = {
  ready: false,
  installable: false,
  pythonReady: false,
  verifiable: false,
  reason: 'Mix Studio has no local ComfyUI Python environment to inspect.',
};

test('H3 SageAttention still refuses a render when the KJNodes patch node is missing', () => {
  for (const report of [verifiedReady, verifiedUnusable, notInspected]) {
    assert.deepEqual(h3SageAttentionDecision(report, false), { block: true, sageAttention: false });
  }
  assert.deepEqual(h3SageAttentionDecision({}, false), { block: true, sageAttention: false });
  // object_info is read from the connected ComfyUI, so this check holds even where the
  // local probe cannot run; only a real boolean true may unlock the render.
  assert.deepEqual(h3SageAttentionDecision(notInspected, undefined), { block: true, sageAttention: false });
});

test('H3 SageAttention refuses a render when the probe ran and found it unusable', () => {
  assert.deepEqual(h3SageAttentionDecision(verifiedUnusable, true), { block: true, sageAttention: false });
});

test('H3 SageAttention renders on standard attention when this machine cannot be inspected', () => {
  assert.deepEqual(h3SageAttentionDecision(notInspected, true), { block: false, sageAttention: false });
  // The unverifiable report is identified by its own field, but the ready/pythonReady
  // pair it travels with is the same signal, so the fallback must not depend on the
  // reason text.
  const pairOnly = { ready: false, pythonReady: false, verifiable: false, reason: 'reworded freely' };
  assert.deepEqual(h3SageAttentionDecision(pairOnly, true), { block: false, sageAttention: false });
});

test('H3 SageAttention uses the accelerator only when the probe verified it here', () => {
  assert.deepEqual(h3SageAttentionDecision(verifiedReady, true), { block: false, sageAttention: true });
});

test('H3 SageAttention decision fails safe on reports that predate the verifiable field', () => {
  // Absent is not the same as false: an older or partial report never unlocks a render
  // and never turns the accelerator on.
  assert.deepEqual(h3SageAttentionDecision({ ready: false, pythonReady: false }, true), { block: true, sageAttention: false });
  assert.deepEqual(h3SageAttentionDecision({}, true), { block: true, sageAttention: false });
  assert.deepEqual(h3SageAttentionDecision(undefined, true), { block: true, sageAttention: false });
});

test('H3 SageAttention decision table covers every probe and node combination', () => {
  const expected = [
    { nodeReady: false, ready: false, verifiable: false, block: true, sageAttention: false },
    { nodeReady: false, ready: false, verifiable: true, block: true, sageAttention: false },
    { nodeReady: false, ready: true, verifiable: false, block: true, sageAttention: false },
    { nodeReady: false, ready: true, verifiable: true, block: true, sageAttention: false },
    { nodeReady: true, ready: false, verifiable: false, block: false, sageAttention: false },
    { nodeReady: true, ready: false, verifiable: true, block: true, sageAttention: false },
    // Unreachable from the probe as written, and pinned deliberately: an unverifiable
    // report cannot enable the accelerator even when it also claims ready.
    { nodeReady: true, ready: true, verifiable: false, block: false, sageAttention: false },
    { nodeReady: true, ready: true, verifiable: true, block: false, sageAttention: true },
  ];
  for (const row of expected) {
    const report = { ready: row.ready, verifiable: row.verifiable };
    assert.deepEqual(
      h3SageAttentionDecision(report, row.nodeReady),
      { block: row.block, sageAttention: row.sageAttention },
      JSON.stringify(row),
    );
  }
});

test('H3 route rewrites the derived attention options before the render options read them', () => {
  // The decision itself is unit-tested above; what a unit test cannot see is whether the
  // route consults it, and whether the backend NAME is rewritten alongside the boolean --
  // a cleared boolean that still names 'sageattention' would build the wrong graph and
  // report a backend that was never verified. Assert on the route's own source, as the
  // dependency-manager and generation-capability suites do.
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const decisionAt = server.indexOf('h3SageAttentionDecision(sageRuntime, nodeReady)');
  const rewriteAt = server.indexOf("h3Attention = h3AttentionOptions('standard', false);");
  const syncAt = server.indexOf('h3SageAttention = h3Attention.sageAttention;');
  const optionsAt = server.indexOf('attentionBackend: h3Attention.attentionBackend,');
  assert.ok(decisionAt > 0, 'the route must ask the decision helper');
  assert.ok(rewriteAt > 0, 'the route must be able to rewrite the derived options');
  assert.ok(syncAt > 0, 'the boolean must be re-read from those options');
  assert.ok(optionsAt > 0, 'the render options must read the rewritten backend name');
  assert.ok(decisionAt < rewriteAt && rewriteAt < syncAt && syncAt < optionsAt,
    'the decision, the rewrite and the boolean must all precede the render options');
  // Both bindings are assignable and the rewrite goes through the same factory that
  // derived them, so the name and the boolean cannot disagree.
  assert.match(server, /let h3Attention = engine === 'h3'[\s\S]{0,120}h3AttentionOptions\(body\.attentionBackend, body\.sageAttention\)/);
  assert.match(server, /let h3SageAttention = engine === 'h3' && h3Attention\.sageAttention;/);
  // The helper decides this gate only, and it is consulted once.
  assert.equal((server.match(/h3SageAttentionDecision\(sageRuntime, nodeReady\)/g) || []).length, 1);
  // SLA is a separate backend: its binding stays const and its own gate is untouched, so
  // a request that selected 'sla' cannot be affected by the SageAttention decision.
  assert.match(server, /const h3SlaAttention = engine === 'h3' && h3Attention\.slaAttention;/);
  assert.match(server, /if \(!slaRuntime\.ready \|\| !nodeReady\) \{/);
  // One write reaches the graph builder, and both record derivations read it.
  assert.equal((server.match(/sageAttention: h3SageAttention,/g) || []).length, 1);
  assert.ok((server.match(/attentionBackend: engine === 'h3' \? opts\.attentionBackend : undefined,/g) || []).length >= 2);
  // Both refusal paths survive the narrowing.
  assert.match(server, /code: 'h3_sage_attention_unavailable'/);
  assert.match(server, /code: 'h3_sla_attention_unavailable'/);
});
