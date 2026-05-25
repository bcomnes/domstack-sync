import test from 'node:test'
import assert from 'node:assert'
import { stripAnsi } from './strip-ansi.ts'

// SGR — Select Graphic Rendition (color, bold, underline, reset)
test('strips underline sequence', () => {
  assert.strictEqual(stripAnsi('[4mUnicorn[0m'), 'Unicorn')
})

test('strips color sequences', () => {
  assert.strictEqual(
    stripAnsi('[0m[4m[42m[31mfoo[39m[49m[0m'),
    'foo'
  )
})

test('strips mixed inline sequences', () => {
  assert.strictEqual(stripAnsi('foo[4mbar[0mbaz'), 'foobarbaz')
})

// OSC — Operating System Command (hyperlinks etc.)
test('strips OSC hyperlink sequence', () => {
  assert.strictEqual(
    stripAnsi(']8;;https://github.comClick]8;;'),
    'Click'
  )
})

test('strips OSC with ESC\\ terminator', () => {
  assert.strictEqual(
    stripAnsi(']8;;https://example.com\\Link]8;;\\'),
    'Link'
  )
})

// C1 CSI (8-bit,  introducer)
test('strips C1 CSI sequence', () => {
  assert.strictEqual(stripAnsi('4mUnicornm'), 'Unicorn')
})

// Fast path — no ANSI codes
test('returns plain string unchanged', () => {
  assert.strictEqual(stripAnsi('hello world'), 'hello world')
})

test('returns empty string unchanged', () => {
  assert.strictEqual(stripAnsi(''), '')
})

test('handles string with only ANSI codes', () => {
  assert.strictEqual(stripAnsi('[31m[0m'), '')
})

// Type safety
test('throws on non-string input', () => {
  assert.throws(
    // @ts-expect-error — intentionally wrong type
    () => stripAnsi(42),
    TypeError
  )
})

test('throws on null input', () => {
  assert.throws(
    // @ts-expect-error — intentionally wrong type
    () => stripAnsi(null),
    TypeError
  )
})
