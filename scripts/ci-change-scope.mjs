import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// Only non-executable prose is eligible. Unknown files and incomplete Git
// evidence select full testing; no provider changed-file pagination is used.
const documentation = (path) => path === 'README.md' || path === 'AGENTS.md'
  || (path.startsWith('docs/') && path.endsWith('.md'));
const git = (...args) => execFileSync('git', args, {
  encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let full = true;
let reason = 'Full checks are required for this event or unavailable comparison evidence.';
const base = process.env.CI_BASE_SHA;
const head = process.env.CI_HEAD_SHA;
if (process.env.GITHUB_EVENT_NAME === 'pull_request'
  && /^[a-f0-9]{40}$/.test(base ?? '') && /^[a-f0-9]{40}$/.test(head ?? '')) {
  try {
    if (git('rev-parse', 'HEAD').trim() !== head) throw new Error('Checkout mismatch');
    const mergeBase = git('merge-base', base, head).trim();
    const diff = git('diff', '--raw', '-z', '--no-renames', mergeBase, head, '--');
    const parts = diff.split('\0');
    if (parts.pop() !== '') throw new Error('Incomplete diff');
    if (parts.length === 0 || parts.length % 2 !== 0) throw new Error('Empty or invalid diff');
    full = false;
    for (let i = 0; i < parts.length; i += 2) {
      const metadata = parts[i].match(/^:(\d{6}) (\d{6}) [a-f0-9]+ [a-f0-9]+ ([AMD])$/);
      if (!metadata || ![metadata[1], metadata[2]].every(mode => ['000000', '100644'].includes(mode))
        || !documentation(parts[i + 1])) { full = true; break; }
    }
    reason = full ? 'The PR includes code, configuration, data, or other non-prose changes.'
      : 'The complete PR diff contains only non-executable documentation.';
  } catch { /* Fail closed to full testing without printing Git data. */ }
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `full=${full}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `### CI scope: ${full ? 'full' : 'documentation only'}\n\n${reason}\n\n${full ? 'All engineering jobs are required.' : 'Secret and wiki validation still run. This is not full release evidence.'}\n`);
console.log(JSON.stringify({ full, reason }));
