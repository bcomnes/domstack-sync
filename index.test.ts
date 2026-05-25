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
  assert.strictEqual(opts.ghostMode.clicks, true)
  assert.strictEqual(opts.ghostMode.location, true)
  assert.deepStrictEqual(opts.ghostMode.forms, { submit: true, inputs: true, toggles: true })
  assert.strictEqual(opts.codeSync, true)
  assert.strictEqual(opts.reloadThrottle, 0)
  assert.strictEqual(opts.scrollThrottle, 0)
  assert.deepStrictEqual(opts.scrollElements, [])
  assert.deepStrictEqual(opts.scrollElementMapping, [])
  assert.strictEqual(opts.scrollProportionally, true)
  assert.deepStrictEqual(opts.injectFileTypes, ['css', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'map'])
  assert.strictEqual(opts.tagNames['css'], 'link')
  assert.strictEqual(opts.tagNames['png'], 'img')
  assert.deepStrictEqual(opts.watchEvents, ['change'])
})

test('parseOptions: custom values', () => {
  const opts = parseOptions({ port: 4000, server: './public', files: ['**/*.css'] })
  assert.strictEqual(opts.port, 4000)
  assert.strictEqual(opts.server, './public')
  assert.deepStrictEqual(opts.files, ['**/*.css'])
})

test('parseOptions: legacy boolean forms option maps to form sub-options', () => {
  const opts = parseOptions({ ghostMode: { forms: false } })
  assert.deepStrictEqual(opts.ghostMode.forms, { submit: false, inputs: false, toggles: false })
})
