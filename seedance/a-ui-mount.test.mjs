import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../ai-assistant.html', import.meta.url), 'utf8');
const uiPatches = fs.readFileSync(new URL('./ui-patches.js', import.meta.url), 'utf8');
const supabaseConfig = fs.readFileSync(new URL('../supabase-config.js', import.meta.url), 'utf8');

test('ai-assistant execution chain mounts the A-version bootstrap', () => {
  const directHtmlMount = /<script\s+type=["']module["']\s+src=["']\.\/supabase-config\.js\?v=20260812-a-ui-mount["']><\/script>/.test(html);
  const stablePatchMount = /import\s+["']\.\.\/supabase-config\.js\?v=20260812-a-ui-mount["']/.test(uiPatches);

  assert.ok(
    directHtmlMount || stablePatchMount,
    'ai-assistant execution chain must load supabase-config.js so A-version UI modules can mount',
  );
});

test('A-version waits until the R50 project tree is actually rendered', () => {
  assert.match(supabaseConfig, /async function waitForR50ProjectTree\(/);
  assert.match(supabaseConfig, /await waitForR50ProjectTree\(\)/);
  assert.doesNotMatch(
    supabaseConfig,
    /queueMicrotask\(\(\) => \{\s*import\('\.\/seedance\/r54-paid-safety\.js'\)/,
    'A modules must not mount in a microtask before R50 renders the sidebar tree',
  );
});
