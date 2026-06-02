import test from 'node:test'
import assert from 'node:assert'
import { buildSnippet } from './snippet.ts'

test('buildSnippet: snippet mode loads the client from the sync server port on the page hostname', () => {
  const snippet = buildSnippet({ port: 3000, version: '1.2.3' })

  assert.ok(snippet.includes("location.hostname + ':3000/__bs/client.js?v=1.2.3'"), snippet)
  assert.ok(!snippet.includes("script.src = '/__bs/client.js"), snippet)
})
