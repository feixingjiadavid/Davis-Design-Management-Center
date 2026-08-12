import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const login = readFileSync(new URL('../login.html', import.meta.url), 'utf8')
const requester = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const aiWorkspace = readFileSync(new URL('../ai-designer-workspace.html', import.meta.url), 'utf8')
const humanDesignerWorkspace = readFileSync(new URL('../assistant-workspace.html', import.meta.url), 'utf8')

test('design-only accounts enter the designer workspace after login', () => {
  assert.match(login, /userData\.perms.*includes\(['"]design['"]\)/s)
  assert.match(login, /assistant-workspace\.html/)
})

test('Davis AI designer can be selected as an assignee', () => {
  assert.match(requester, /davis\.design\.ai/)
})

test('Davis AI designer enters a visible AI workflow workspace', () => {
  assert.match(login, /davis\.design\.ai[\s\S]*ai-designer-workspace\.html/)
  assert.match(aiWorkspace, /ai_design_jobs/)
  assert.match(aiWorkspace, /重新分析/)
  assert.match(aiWorkspace, /等待人工批准/)
  assert.match(aiWorkspace, /signedInName!==['"]davis\.design\.ai['"]/)
  assert.match(aiWorkspace, /assistant-workspace\.html/)
})

test('old human designer workspace forcibly redirects the AI account', () => {
  assert.match(humanDesignerWorkspace, /designerSessionName === ['"]davis\.design\.ai['"]/)
  assert.match(humanDesignerWorkspace, /location\.replace\(['"]ai-designer-workspace\.html['"]\)/)
})


test('AI workspace is fail-closed and bound to the exact authenticated account', () => {
  assert.match(aiWorkspace, /auth-pending/)
  assert.match(aiWorkspace, /supabase\.auth\.getUser\(\)/)
  assert.match(aiWorkspace, /signedInUser\.id!==AI_USER_ID/)
  assert.match(aiWorkspace, /davis\.design\.ai@webank\.com/)
  assert.match(aiWorkspace, /onAuthStateChange/)
  assert.doesNotMatch(aiWorkspace, /auth\.getSession\(\)/)
})

test('login cannot redirect a human account into the AI workspace', () => {
  assert.match(login, /isDavisAi/)
  assert.match(login, /!redirectUrl\.includes\(['"]\/ai-designer-workspace\.html['"]\)/)
})
