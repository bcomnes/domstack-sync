import test from 'node:test'
import assert from 'node:assert'
import {
  appendSessionToken,
  createSessionToken,
  isAuthorizedWebSocketRequest,
} from './session-token.ts'

test('session token: generated tokens are distinct and URL-safe', () => {
  const first = createSessionToken()
  const second = createSessionToken()

  assert.match(first, /^[A-Za-z0-9_-]+$/)
  assert.notStrictEqual(first, second)
})

test('session token: authorizes only the exact path and token', () => {
  const token = 'expected-token'

  assert.strictEqual(isAuthorizedWebSocketRequest('/__bs?token=expected-token', '/__bs', token), true)
  assert.strictEqual(isAuthorizedWebSocketRequest('/__bs?token=wrong', '/__bs', token), false)
  assert.strictEqual(isAuthorizedWebSocketRequest('/__bs-extra?token=expected-token', '/__bs', token), false)
})

test('session token: appends to URLs with and without existing parameters', () => {
  assert.strictEqual(appendSessionToken('/__bs', 'a b'), '/__bs?token=a%20b')
  assert.strictEqual(appendSessionToken('/client.js?v=1', 'token'), '/client.js?v=1&token=token')
})
