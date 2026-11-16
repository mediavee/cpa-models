import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const builder = join(root, 'mediavee/build_catalog.py');

function model(catalog, section, id) {
  const found = catalog[section]?.filter((entry) => entry.id === id) ?? [];
  assert.equal(found.length, 1, `${section}/${id}`);
  return found[0];
}

async function build(upstream, overlay, corrections) {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-build-'));
  try {
    const upstreamPath = join(dir, 'upstream.json');
    const overlayPath = join(dir, 'overlay.json');
    const correctionsPath = join(dir, 'corrections.json');
    const outputPath = join(dir, 'out.json');
    await writeFile(upstreamPath, JSON.stringify(upstream));
    await writeFile(overlayPath, JSON.stringify(overlay ?? {}));
    await writeFile(correctionsPath, JSON.stringify(corrections ?? {}));
    execFileSync('python3', [builder, upstreamPath, overlayPath, outputPath, correctionsPath], {
      encoding: 'utf8',
    });
    return JSON.parse(await readFile(outputPath, 'utf8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a bad window stays served until a correction replaces it', async () => {
  const upstream = {
    claude: [{ id: 'claude-sonnet-4-6', context_length: 200000, max_completion_tokens: 64000 }],
  };
  const uncorrected = await build(upstream, {}, {});
  assert.equal(uncorrected.claude[0].context_length, 200000);
  assert.equal(uncorrected.claude[0].max_completion_tokens, 64000);

  const corrected = await build(upstream, {}, {
    fields: {
      claude: {
        'claude-sonnet-4-6': { context_length: 1000000, max_completion_tokens: 128000 },
      },
    },
  });
  assert.equal(corrected.claude[0].context_length, 1000000);
  assert.equal(corrected.claude[0].max_completion_tokens, 128000);
});

test('drops ids the channel cannot serve and keeps the others', async () => {
  const upstream = {
    kimi: [{ id: 'kimi-k2' }, { id: 'kimi-k3' }],
  };
  const catalog = await build(upstream, {}, { drop: { kimi: ['kimi-k2'] } });
  assert.deepEqual(catalog.kimi.map((entry) => entry.id), ['kimi-k3']);
});

test('adds a missing id and does not duplicate one upstream already lists', async () => {
  const upstream = { claude: [{ id: 'already', context_length: 1 }] };
  const entry = { id: 'already', context_length: 9 };
  const added = { id: 'fresh', context_length: 2 };
  const catalog = await build(upstream, { claude: [entry] }, { add: { claude: [added, entry] } });
  assert.deepEqual(catalog.claude.map((item) => item.id), ['already', 'fresh']);
  assert.equal(catalog.claude[0].context_length, 1);
});

test('a field correction for a missing id fails the build', async () => {
  await assert.rejects(
    () => build({ claude: [] }, {}, { fields: { claude: { missing: { context_length: 1 } } } }),
    /correction target missing: claude\/missing/,
  );
});

test('the repo corrections match the provider and template windows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-served-'));
  try {
    const outputPath = join(dir, 'out.json');
    execFileSync('python3', [
      builder,
      join(root, 'models.json'),
      join(root, 'mediavee/overlay.json'),
      outputPath,
    ], { encoding: 'utf8' });
    const catalog = JSON.parse(await readFile(outputPath, 'utf8'));

    for (const id of ['kimi-k2', 'kimi-k2-thinking', 'kimi-k2.5', 'kimi-k2.6']) {
      assert.equal(catalog.kimi.some((entry) => entry.id === id), false, id);
    }
    for (const id of [
      'claude-opus-4-1-20250805',
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022',
    ]) {
      assert.equal(catalog.claude.some((entry) => entry.id === id), false, id);
    }

    const sonnet = model(catalog, 'claude', 'claude-sonnet-4-6');
    assert.equal(sonnet.context_length, 1000000);
    assert.equal(sonnet.max_completion_tokens, 128000);
    const antigravitySonnet = model(catalog, 'antigravity', 'claude-sonnet-4-6');
    assert.equal(antigravitySonnet.context_length, 1000000);
    assert.equal(antigravitySonnet.max_completion_tokens, 128000);
    assert.equal(antigravitySonnet.thinking.max, 128000);

    const fable = model(catalog, 'claude', 'claude-fable-5-2');
    assert.equal(fable.context_length, 1000000);
    assert.equal(fable.max_completion_tokens, 128000);

    for (const id of [
      'grok-4.20-0309-reasoning',
      'grok-4.20-0309-non-reasoning',
      'grok-4.20-multi-agent-0309',
    ]) {
      assert.equal(model(catalog, 'xai', id).context_length, 1000000, id);
    }
    for (const id of [
      'muse-wonder-1.0',
      'muse-wonder-1.0-contributor',
      'muse-wonder-full-1.0',
      'muse-wonder-full-1.0-contributor',
    ]) {
      assert.equal(model(catalog, 'meta', id).context_length, 1048576, id);
    }

    const k27 = model(catalog, 'kimi', 'kimi-k2.7-code');
    assert.equal(k27.context_length, 1048576);
    assert.equal(k27.thinking.zero_allowed, true);
    assert.deepEqual(k27.thinking.levels, ['low', 'high', 'max']);

    for (const section of ['codex-team', 'codex-plus', 'codex-pro']) {
      const sol = model(catalog, section, 'gpt-6.1-sol');
      assert.equal(sol.context_length, 500000, section);
      assert.deepEqual(sol.thinking.levels, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
    }
    for (const section of ['codex-free', 'codex-team', 'codex-plus', 'codex-pro']) {
      assert.equal(model(catalog, section, 'gpt-5.6-terra').context_length, 272000, section);
      assert.equal(model(catalog, section, 'gpt-5.6-luna').context_length, 272000, section);
      assert.equal(model(catalog, section, 'gpt-5.6-luna').thinking.levels.includes('ultra'), false);
      const gpt55 = model(catalog, section, 'gpt-5.5');
      assert.equal(gpt55.context_length, 500000, section);
      assert.equal(gpt55.native_capabilities.web_search, true);
      assert.deepEqual(gpt55.thinking.levels, ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
    }
    for (const section of ['codex-team', 'codex-plus', 'codex-pro']) {
      const older = model(catalog, section, 'gpt-5.6-sol');
      assert.equal(older.context_length, 272000, section);
      assert.equal(older.thinking.levels.at(-1), 'ultra');
    }

    assert.equal(model(catalog, 'vertex', 'gemini-omni-1.2-flash').max_completion_tokens, 260640);
    assert.equal(model(catalog, 'vertex', 'gemini-omni-1.2-flash').context_length, 131072);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
