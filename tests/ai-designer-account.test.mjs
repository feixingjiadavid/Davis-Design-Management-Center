import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const login = readFileSync(new URL('../login.html', import.meta.url), 'utf8')
const requester = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('design-only accounts enter the designer workspace after login', () => {
  assert.match(login, /userData\.perms.*includes\(['"]design['"]\)/s)
  assert.match(login, /assistant-workspace\.html/)
})

test('Davis AI designer can be selected as an assignee', () => {
  assert.match(requester, /davis\.design\.ai/)
})
