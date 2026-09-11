import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { BsWatcher } from './watcher.ts'
import type { WatchEvent } from './watcher.ts'

function makeTmpDir () {
  return mkdtempSync(join(tmpdir(), 'bs-watcher-test-'))
}

function withTimeout<T> (label: string, promise: Promise<T>, ms = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
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

for (const cwdSource of ['cwd', 'watchOptions'] as const) {
  test(`BsWatcher: object options inherit ${cwdSource} and watcher defaults`, { timeout: 8000 }, async (t) => {
    const dir = makeTmpDir()
    const file = join(dir, 'inherited.css')
    const ignoredFile = join(dir, 'ignored.css')
    writeFileSync(file, 'before')
    writeFileSync(ignoredFile, 'before')
    const watcher = new BsWatcher({
      files: [{ match: ['inherited.css', 'ignored.css'], options: { awaitWriteFinish: false } }],
      cwd: cwdSource === 'cwd' ? dir : join(dir, 'unused'),
      watchOptions: {
        ...(cwdSource === 'watchOptions' ? { cwd: dir } : {}),
        usePolling: true,
        interval: 10,
        ignored: (path: string) => path.endsWith('ignored.css'),
      },
      watchEvents: ['add', 'change'],
      debounceMs: 20,
    })
    t.after(async () => {
      await watcher.close()
      rmSync(dir, { recursive: true, force: true })
    })
    const events: WatchEvent[] = []
    watcher.on('change', event => events.push(event))
    // Observe Chokidar directly to wait for readiness without arbitrary startup sleeps.
    const underlying = watcher['watchers'][0]!
    await withTimeout('inherited watcher ready', once(underlying, 'ready'))
    const changed = withTimeout('inherited watcher change', once(watcher, 'change'))
    writeFileSync(file, 'after')
    writeFileSync(ignoredFile, 'after')
    await changed
    await new Promise(resolve => setTimeout(resolve, 100))

    assert.deepStrictEqual(events.map(({ event, path }) => ({ event, path })), [
      { event: 'change', path: 'inherited.css' },
    ])
    assert.strictEqual(underlying.options.ignoreInitial, true)
    assert.strictEqual(underlying.options.usePolling, true)
    assert.strictEqual(underlying.options.interval, 10)
  })
}

test('BsWatcher: entry options override inherited cwd, ignores, and ignoreInitial', { timeout: 8000 }, async (t) => {
  const dir = makeTmpDir()
  writeFileSync(join(dir, 'override.css'), 'body {}')
  const watcher = new BsWatcher({
    cwd: join(dir, 'unused'),
    watchOptions: { ignored: () => true, usePolling: true, interval: 10 },
    files: [{
      match: 'override.css',
      options: { cwd: dir, ignoreInitial: false, ignored: () => false },
    }],
    watchEvents: ['add'],
    debounceMs: 20,
  })
  t.after(async () => {
    await watcher.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const [event] = await withTimeout('entry override add', once(watcher, 'change'))
  assert.strictEqual(event.event, 'add')
  assert.strictEqual(event.path, 'override.css')
  assert.strictEqual(watcher['watchers'][0]!.options.usePolling, true)
})

test('BsWatcher: preserves explicit watchOptions.cwd', { timeout: 8000 }, async (t) => {
  const topLevelCwd = makeTmpDir()
  const explicitCwd = makeTmpDir()
  t.after(() => rmSync(topLevelCwd, { recursive: true, force: true }))
  t.after(() => rmSync(explicitCwd, { recursive: true, force: true }))
  const file = join(explicitCwd, 'explicit-cwd.css')
  writeFileSync(file, 'body {}')

  const watcher = new BsWatcher({
    files: ['explicit-cwd.css'],
    cwd: topLevelCwd,
    watchOptions: { cwd: explicitCwd },
    debounceMs: 50,
  })
  t.after(() => watcher.close())

  const changed = new Promise<WatchEvent>((resolve) => {
    watcher.once('change', resolve)
  })

  await new Promise(resolve => setTimeout(resolve, 500))
  writeFileSync(file, 'body { color: red; }')

  const evt = await withTimeout('explicit cwd watcher change', changed)
  assert.strictEqual(evt.event, 'change')
  assert.strictEqual(evt.path, 'explicit-cwd.css')
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

test('BsWatcher: close discards pending batches and ignores late events', { timeout: 8000 }, async (t) => {
  const file = 'pending.css'
  const watcher = new BsWatcher({
    files: [{ match: [] }],
    debounceMs: 200,
  })
  t.after(() => watcher.close())
  let batches = 0
  let events = 0
  watcher.on('changes', () => batches++)
  watcher.on('change', () => events++)
  const underlying = watcher['watchers'][0]!
  // Exercise shutdown independently of filesystem polling startup.
  underlying.emit('all', 'change', file)
  assert.strictEqual(watcher['pendingEvents'].length, 1)
  assert.strictEqual(batches, 0, 'close before the debounce timer fires')
  const onEvent = underlying.listeners('all')[0]!
  const closing = watcher.close()
  const closingAgain = watcher.close()
  await closing
  // Simulate an already queued callback from the underlying event source.
  onEvent('change', file)
  await new Promise(resolve => setTimeout(resolve, 300))
  assert.strictEqual(batches, 0)
  assert.strictEqual(events, 0)
  assert.strictEqual(closingAgain, closing, 'repeated close calls share completion')
})

test('BsWatcher: close inside a batch listener stops individual event delivery', { timeout: 8000 }, async (t) => {
  const watcher = new BsWatcher({
    files: [{ match: [] }],
    debounceMs: 20,
  })
  t.after(() => watcher.close())
  let events = 0
  watcher.on('change', () => events++)
  const closed = new Promise<void>((resolve, reject) => {
    watcher.once('changes', () => { watcher.close().then(resolve, reject) })
  })
  // Chokidar's ready event can precede the polling baseline; inject the event
  // so this test measures close-during-delivery rather than filesystem timing.
  watcher['watchers'][0]!.emit('all', 'change', 'batch.css')
  await withTimeout('close during batch', closed)
  assert.strictEqual(events, 0)
})

test('BsWatcher: close stops custom entry callbacks', async (t) => {
  let calls = 0
  const watcher = new BsWatcher({
    files: [{ match: [], fn: () => { calls++ } }],
  })
  t.after(() => watcher.close())
  const underlying = watcher['watchers'][0]!
  const onEvent = underlying.listeners('all')[0]!
  underlying.emit('all', 'change', 'before.css')
  assert.strictEqual(calls, 1)
  await watcher.close()
  onEvent('change', 'after.css')
  assert.strictEqual(calls, 1)
})
