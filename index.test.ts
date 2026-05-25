import test from 'node:test'
import assert from 'node:assert'
import { parseOptions } from './index.ts'

test('parseOptions: defaults', () => {
  const opts = parseOptions({})
  assert.strictEqual(opts.port, 3000)
  assert.strictEqual(opts.server, false)
  assert.deepStrictEqual(opts.files, [])
  assert.strictEqual(opts.logLevel, 'info')
  assert.strictEqual(opts.ghostMode.scroll, true)
})

test('parseOptions: custom values', () => {
  const opts = parseOptions({ port: 4000, server: './public', files: ['**/*.css'] })
  assert.strictEqual(opts.port, 4000)
  assert.strictEqual(opts.server, './public')
  assert.deepStrictEqual(opts.files, ['**/*.css'])
})
