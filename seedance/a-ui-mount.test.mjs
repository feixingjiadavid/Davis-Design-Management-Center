import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../ai-assistant.html', import.meta.url), 'utf8');

test('ai-assistant loads the A-version bootstrap entry', () => {
  assert.match(
    html,
    /<script\s+type=["']module["']\s+src=["']\.\/supabase-config\.js\?v=20260812-a-ui-mount["']><\/script>/,
    'ai-assistant.html must explicitly load supabase-config.js so A-version UI modules can mount',
  );
});
