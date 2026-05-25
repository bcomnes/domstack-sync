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
  const file = join(dir, 'test.txt')
  writeFileSync(file, 'before')

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
  writeFileSync(file, 'hello')

  const evt = await changed
  assert.ok(typeof evt.path === 'string')
  assert.ok(evt.path.includes('test.txt'))
  assert.ok(typeof evt.event === 'string')
  assert.strictEqual(evt.namespace, 'core')
})

test('BsWatcher: debounces rapid changes into one event', { timeout: 5000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'a.txt')
  writeFileSync(file, 'before')

  const watcher = new BsWatcher({
    files: [dir],
    debounceMs: 100,
  })
  t.after(() => watcher.close())

  let count = 0
  watcher.on('change', () => { count++ })

  await new Promise(resolve => setTimeout(resolve, 500))

  // Write multiple times rapidly
  writeFileSync(file, '1')
  writeFileSync(file, '2')
  writeFileSync(file, '3')

  // Wait for debounce to settle
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.ok(count <= 2, `expected <=2 events (debounced), got ${count}`)
})

test('BsWatcher: emits buffered changes batches with timestamps', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const cssFile = join(dir, 'styles.css')
  const htmlFile = join(dir, 'index.html')
  writeFileSync(cssFile, 'body {}')
  writeFileSync(htmlFile, '<!doctype html>')

  const watcher = new BsWatcher({
    files: [dir],
    debounceMs: 100,
  })
  t.after(() => watcher.close())

  const batch = new Promise<WatchEvent[]>((resolve) => {
    watcher.once('changes', resolve)
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(cssFile, 'body { color: red; }')
  writeFileSync(htmlFile, '<!doctype html><title>changed</title>')

  const events = await batch
  assert.ok(events.length >= 2, `expected at least 2 events, got ${events.length}`)
  assert.ok(events.some(evt => evt.path.includes('styles.css')))
  assert.ok(events.some(evt => evt.path.includes('index.html')))
  assert.ok(events.every(evt => typeof evt.timestamp === 'number' && evt.timestamp > 0))
})

test('BsWatcher: object watcher without fn uses default change pipeline', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'object-default.css')
  writeFileSync(file, 'body {}')

  const watcher = new BsWatcher({
    files: [{ match: file, options: { ignoreInitial: true } }],
    debounceMs: 50,
  })
  t.after(() => watcher.close())

  const changed = new Promise<WatchEvent>((resolve) => {
    watcher.once('change', resolve)
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(file, 'body { color: red; }')

  const evt = await changed
  assert.strictEqual(evt.event, 'change')
  assert.ok(evt.path.includes('object-default.css'))
})

test('BsWatcher: object watcher fn receives raw chokidar events', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'object-fn.css')
  writeFileSync(file, 'body {}')

  const seen = new Promise<{ event: string; path: string }>((resolve) => {
    const watcher = new BsWatcher({
      files: [{
        match: file,
        options: { ignoreInitial: true },
        fn: (event, path) => resolve({ event, path }),
      }],
      debounceMs: 50,
    })
    t.after(() => watcher.close())
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(file, 'body { color: blue; }')

  const evt = await seen
  assert.strictEqual(evt.event, 'change')
  assert.ok(evt.path.includes('object-fn.css'))
})

test('BsWatcher: configured watchEvents can opt into add events', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const watcher = new BsWatcher({
    files: [dir],
    debounceMs: 50,
    watchEvents: ['add'],
  })
  t.after(() => watcher.close())

  const added = new Promise<WatchEvent>((resolve) => {
    watcher.once('change', resolve)
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(join(dir, 'added.css'), 'body {}')

  const evt = await added
  assert.strictEqual(evt.event, 'add')
  assert.ok(evt.path.includes('added.css'))
})

test('BsWatcher: close resolves cleanly', async (t) => {
  const dir = makeTmpDir()
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const watcher = new BsWatcher({ files: [dir], debounceMs: 50 })
  await assert.doesNotReject(() => watcher.close())
})
