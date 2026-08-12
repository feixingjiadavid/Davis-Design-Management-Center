import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const worker = readFileSync(new URL('../supabase/functions/ai-design-analyze/index.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260812094500_ai_design_jobs.sql', import.meta.url), 'utf8')
const requester = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('AI design assignment is queued without image or video generation', () => {
  assert.match(migration, /davis\.design\.ai/)
  assert.match(migration, /ai_design_jobs/)
  assert.doesNotMatch(worker, /seedance|image generation|images\/generations/i)
})

test('worker stops after analysis and waits for generation confirmation', () => {
  assert.match(worker, /ready_for_generation/)
  assert.match(worker, /等待人工确认进入设计生成/)
})

test('external model receives only allowlisted task fields', () => {
  assert.match(worker, /JSON\.stringify\(safeTask\)/)
  assert.doesNotMatch(worker, /JSON\.stringify\(task\)/)
  assert.match(worker, /file_name: task\.file_name/)
  assert.doesNotMatch(worker, /file_data: task\.file_data/)
  assert.doesNotMatch(worker, /link: task\.link/)
  assert.doesNotMatch(worker, /source_file_link: task\.source_file_link/)
})

test('assigning a request to Davis AI starts analysis without blocking submission', () => {
  assert.match(requester, /functions\.invoke\(['"]ai-design-analyze['"]/)
  assert.match(requester, /void window\.supabase\.functions\.invoke/)
})


test('AI analysis generates and submits a visual framework through the existing workflow', () => {
  assert.match(worker, /frameworkSvg/)
  assert.match(worker, /data:image\/svg\+xml;base64/)
  assert.match(worker, /action: "ai_framework_preview"/)
  assert.match(worker, /internal_only: true/)
  assert.match(worker, /status: "processing"/)
  assert.match(worker, /status: "framework_ready_for_review"/)
  assert.doesNotMatch(worker, /action: "submit_framework"/)
  assert.doesNotMatch(worker, /status: "pending_approval"/)
  assert.match(worker, /AI account required/)
})
