import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../dist/main.mjs', import.meta.url), 'utf8');
const deployment = 'QmQUcPAEpUQJL3AYK21hsgNnj6XmWepTXJXySHdFXMmp7p';
const meta = { deployment, hasIndexingErrors: false, block: { number: 1, hash: '0x' + '1'.repeat(64) } };
const never = () => new Promise(() => {});

async function harness(mode) {
  let clock = 1_800_000_000_000, fetches = 0;
  const signals = [], timers = new Set();
  class Clock extends Date { static now() { return clock; } }
  const context = vm.createContext({ Date: Clock, AbortController,
    setTimeout(fn, delay) {
      const timer = setTimeout(() => { timers.delete(timer); clock += delay; fn(); }, 5);
      timers.add(timer); return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
    fetch: async (_url, options) => {
      fetches++; signals.push(options.signal);
      assert.ok(options.signal instanceof AbortSignal);
      if (mode === 'fetch-stall') return never();
      return { ok: mode !== 'http-error', status: mode === 'http-error' ? 503 : 200,
        json: async () => {
          if (mode === 'body-stall') return never();
          if (mode === 'run-deadline') clock += 600_001;
          return mode === 'graph-error' ? { errors: [{ message: 'unavailable' }] } : { data: { _meta: meta, vaultIncentivesModules: [] } };
        } };
    },
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => { throw Error('Unexpected runtime dependency'); });
  await module.evaluate();
  return { run: module.namespace.returnTags, signals, timers, fetches: () => fetches };
}

for (const mode of ['fetch-stall', 'body-stall', 'http-error', 'graph-error', 'run-deadline']) {
  test('throws and releases its transport timer on ' + mode, { timeout: 1000 }, async () => {
    const h = await harness(mode);
    await assert.rejects(h.run('146', 'synthetic-query-capability'));
    assert.equal(h.fetches(), 1);
    assert.ok(h.signals[0].aborted);
    assert.equal(h.timers.size, 0);
  });
}
test('a complete empty source is returned only after its final seal', async () => {
  const h = await harness('healthy');
  assert.equal((await h.run('146', 'synthetic-query-capability')).length, 0);
  assert.equal(h.fetches(), 3);
  assert.ok(h.signals.every(signal => signal.aborted));
  assert.equal(h.timers.size, 0);
});
test('invalid chain or key fails before a request or timer', async () => {
  const h = await harness('healthy');
  await assert.rejects(h.run('1', 'synthetic-query-capability'));
  await assert.rejects(h.run('146', ''));
  assert.equal(h.fetches(), 0); assert.equal(h.timers.size, 0);
});
