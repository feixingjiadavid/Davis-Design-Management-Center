import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../ai-assistant.html', import.meta.url), 'utf8');
const uiPatches = fs.readFileSync(new URL('./ui-patches.js', import.meta.url), 'utf8');

test('ai-assistant execution chain mounts the A-version bootstrap', () => {
  const directHtmlMount = /<script\s+type=["']module["']\s+src=["']\.\/supabase-config\.js\?v=20260812-a-ui-mount["']><\/script>/.test(html);
  const stablePatchMount = /import\s+["']\.\.\/supabase-config\.js\?v=20260812-a-ui-mount["']/.test(uiPatches);

  assert.ok(
    directHtmlMount || stablePatchMount,
    'ai-assistant execution chain must load supabase-config.js so A-version UI modules can mount',
  );
});
