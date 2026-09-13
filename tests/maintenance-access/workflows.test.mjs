import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
test('all three serialized workflows persist intent before access and always clean up afterward', () => {
 for(const file of ['azure-staging.yml','azure-candidate-verification.yml','azure-promote-staging.yml']) {
  const source=readFileSync(new URL(`../../.github/workflows/${file}`,import.meta.url),'utf8');
  assert.match(source,/group: azure-blue-green-\$\{\{ vars.AZURE_CONTAINER_APP_NAME \}\}/);
  assert.match(source,/cancel-in-progress: false/); assert.match(source,/environment: azure-staging/);
  const steps=source.split(/(?= {6}- )/).slice(1);
  const index=mode=>steps.findIndex(s=>s.includes(`run: node scripts/maintenance-runner-access.mjs ${mode}`));
  const persist=steps.findIndex(s=>s.includes('Persist owned access intent before any ingress mutation'));
  assert.ok(index('prepare')<persist&&persist<index('apply'));
  assert.match(steps[persist],/if-no-files-found: error/);
  assert.ok(index('apply')<steps.findIndex(s=>s.includes('run: node scripts/azure-blue-green.mjs ')));
  assert.match(steps[index('cleanup')],/if: always\(\)/);
  assert.match(steps.at(-1),/if: always\(\)/);assert.match(steps.at(-1),/maintenance-access-evidence/);
 }
});
