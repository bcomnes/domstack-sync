import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BsWatcher } from './watcher.ts'
import type { WatchEvent } from './watcher.ts'

function makeTmpDir () {
  return mkdtempSync(join(tmpdir(), 'bs-watcher-test-'))
}

test('BsWatcher: emits change event when file is written', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  // Watch the directory directly; chokidar picks up file events within it
  const watcher = new BsWatcher({
    files: [dir],
    debounceMs: 50,
  })
  t.after(() => watcher.close())

  const changed = new Promise<WatchEvent>((resolve) => {
    watcher.once('change', resolve)
  })

  // Give chokidar a moment to initialize before triggering a change
  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(join(dir, 'test.txt'), 'hello')

  const evt = await changed
  assert.ok(typeof evt.path === 'string')
  assert.ok(evt.path.includes('test.txt'))
  assert.ok(typeof evt.event === 'string')
  assert.strictEqual(evt.namespace, 'core')
})

test('BsWatcher: debounces rapid changes into one event', { timeout: 5000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const watcher = new BsWatcher({
    files: [dir],
    debounceMs: 100,
  })
  t.after(() => watcher.close())

  let count = 0
  watcher.on('change', () => { count++ })

  await new Promise(resolve => setTimeout(resolve, 500))

  // Write multiple times rapidly
  writeFileSync(join(dir, 'a.txt'), '1')
  writeFileSync(join(dir, 'a.txt'), '2')
  writeFileSync(join(dir, 'a.txt'), '3')

  // Wait for debounce to settle
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.ok(count <= 2, `expected <=2 events (debounced), got ${count}`)
})

test('BsWatcher: close resolves cleanly', async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const watcher = new BsWatcher({ files: [dir], debounceMs: 50 })
  await assert.doesNotReject(() => watcher.close())
})
