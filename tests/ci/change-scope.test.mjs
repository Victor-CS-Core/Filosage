import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
const script = resolve('scripts/ci-change-scope.mjs');
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
  const write = (path, text = 'fixture\n') => { mkdirSync(dirname(join(cwd, path)), { recursive: true }); writeFileSync(join(cwd, path), text); };
  const commit = () => { git('add', '.'); git('commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD'); };
  write('README.md'); write('src/app.ts'); const base = commit();
  const classify = (event = 'pull_request', baseSha = base, head = git('rev-parse', 'HEAD')) => {
    const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8', env: { ...process.env, GITHUB_EVENT_NAME: event, CI_BASE_SHA: baseSha, CI_HEAD_SHA: head, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '' } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).full;
  };
  return { cwd, git, write, commit, base, classify };
}
test('documentation-only PR selects lightweight checks', t => { const f = fixture(t); f.write('docs/progress.md'); f.commit(); assert.equal(f.classify(), false); });
for (const path of ['src/app.ts', 'package-lock.json', '.github/workflows/test.yml', 'docs/data.json', 'notes.md', 'docs/tool.mjs']) {
  test(`full checks for ${path}`, t => { const f = fixture(t); f.write(path, 'changed\n'); f.commit(); assert.equal(f.classify(), true); });
}
test('documentation commit on an existing code PR still requires full checks', t => { const f = fixture(t); f.write('src/app.ts', 'changed'); f.commit(); f.write('docs/progress.md'); f.commit(); assert.equal(f.classify(), true); });
test('main, manual, empty and missing comparison evidence select full checks', t => { const f = fixture(t); assert.equal(f.classify(), true); f.write('docs/a.md'); f.commit(); for (const event of ['push', 'workflow_dispatch', 'unknown']) assert.equal(f.classify(event), true); assert.equal(f.classify('pull_request', '0'.repeat(40)), true); assert.equal(f.classify('pull_request', '--help'), true); });
test('rename from source into docs cannot hide a code deletion', t => { const f = fixture(t); mkdirSync(join(f.cwd, 'docs')); renameSync(join(f.cwd, 'src/app.ts'), join(f.cwd, 'docs/app.md')); f.commit(); assert.equal(f.classify(), true); });
test('symlinks and executable markdown do not qualify as documentation', t => { const f = fixture(t); mkdirSync(join(f.cwd, 'docs')); symlinkSync('../src/app.ts', join(f.cwd, 'docs/link.md')); f.commit(); assert.equal(f.classify(), true); });
test('unusual filenames and large diffs are completely classified', t => { const f = fixture(t); for(let i = 0; i < 305; i++) f.write(`docs/${i}.md`); f.write('docs/line\nbreak.md'); f.commit(); assert.equal(f.classify(), false); f.write('z-code.ts'); f.commit(); assert.equal(f.classify(), true); });

test('executable documentation requires full checks', t => { const f = fixture(t); f.write('docs/run.md'); f.git('add', '.'); f.git('update-index', '--chmod=+x', 'docs/run.md'); f.git('commit', '-qm', 'executable fixture'); assert.equal(f.classify(), true); });
