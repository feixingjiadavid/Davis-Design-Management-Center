import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const login = readFileSync(new URL('../login.html', import.meta.url), 'utf8')
const requester = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const aiWorkspace = readFileSync(new URL('../ai-designer-workspace.html', import.meta.url), 'utf8')

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
})
