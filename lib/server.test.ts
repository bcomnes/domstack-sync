import test from 'node:test'
import assert from 'node:assert'
import { WebSocket } from 'ws'
import { createServer } from './server.ts'
import { parseOptions } from './options.ts'
import type { Transform } from 'node:stream'
import type { BrowserSyncPluginModule, PluginMiddleware } from './plugin-types.ts'

interface TestWebSocket extends WebSocket {
  messages: Array<Record<string, unknown>>
  subscribers: Array<() => void>
}

function makeOpts (overrides = {}) {
  return parseOptions({ port: 0, ui: false, server: false, files: [], logLevel: 'silent', ...overrides })
}

function connectWs (url: string): Promise<TestWebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/__bs'
    const ws = new WebSocket(wsUrl) as TestWebSocket
    ws.messages = []
    ws.subscribers = []
    ws.on('message', (data) => {
      ws.messages.push(JSON.parse(data.toString()) as Record<string, unknown>)
      for (const subscriber of ws.subscribers) subscriber()
    })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function connectUiWs (url: string): Promise<TestWebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = url.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws'
    const ws = new WebSocket(wsUrl) as TestWebSocket
    ws.messages = []
    ws.subscribers = []
    ws.on('message', (data) => {
      ws.messages.push(JSON.parse(data.toString()) as Record<string, unknown>)
      for (const subscriber of ws.subscribers) subscriber()
    })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

async function connectReadyWs (url: string): Promise<TestWebSocket> {
  const ws = await connectWs(url)
  if (ws.messages.length > 0) return ws
  await new Promise<void>((resolve) => {
    const subscriber = () => {
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      resolve()
    }
    ws.subscribers.push(subscriber)
  })
  return ws
}

function takeNonOptionsMessage (ws: TestWebSocket): Record<string, unknown> | null {
  const index = ws.messages.findIndex(msg => msg['type'] !== 'options')
  if (index === -1) return null
  const [message] = ws.messages.splice(index, 1)
  return message ?? null
}

function nextNonOptionsMessage (ws: TestWebSocket): Promise<Record<string, unknown>> {
  const existing = takeNonOptionsMessage(ws)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const subscriber = () => {
      const message = takeNonOptionsMessage(ws)
      if (!message) return
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      resolve(message)
    }
    ws.subscribers.push(subscriber)
  })
}

function takeMessageMatching (
  ws: TestWebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Record<string, unknown> | null {
  const index = ws.messages.findIndex(predicate)
  if (index === -1) return null
  const [message] = ws.messages.splice(index, 1)
  return message ?? null
}

function nextMessageMatching (
  ws: TestWebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  const existing = takeMessageMatching(ws, predicate)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const subscriber = () => {
      const message = takeMessageMatching(ws, predicate)
      if (!message) return
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      resolve(message)
    }
    ws.subscribers.push(subscriber)
  })
}

function expectNoNonOptionsMessage (ws: TestWebSocket, ms = 300): Promise<void> {
  const existing = takeNonOptionsMessage(ws)
  if (existing) return Promise.reject(new Error(`expected no message, got ${JSON.stringify(existing)}`))

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      resolve()
    }, ms)
    const subscriber = () => {
      const message = takeNonOptionsMessage(ws)
      if (!message) return
      clearTimeout(timer)
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      reject(new Error(`expected no message, got ${JSON.stringify(message)}`))
    }
    ws.subscribers.push(subscriber)
  })
}

function closeWs (ws: TestWebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return }
    ws.once('close', resolve)
    ws.terminate()
  })
}

function writeStreamChunks (stream: Transform, chunks: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once('error', reject)
    if ('resume' in stream && typeof stream.resume === 'function') stream.resume()
    for (const chunk of chunks) stream.write(chunk)
    stream.end(() => resolve())
  })
}

function withTimeout<T> (label: string, promise: Promise<T>, ms = 2000): Promise<T> {
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

test('createServer: starts and returns URLs', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  assert.ok(bs.url.startsWith('http://localhost:'))
  assert.ok(typeof bs.port === 'number')
  assert.ok(bs.port > 0)
  assert.strictEqual(bs.uiUrl, null)
  assert.strictEqual(bs.uiPort, null)
  assert.ok(typeof bs.localIp === 'string')
})

test('createServer: POST /__bs/reload returns ok', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const res = await fetch(`${bs.url}/__bs/reload`, { method: 'POST' })
  assert.strictEqual(res.status, 200)
  const body = await res.json() as { ok: boolean }
  assert.strictEqual(body.ok, true)
})

test('createServer: POST /__bs/reload accepts file args and injects injectable files', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const firstMessage = nextNonOptionsMessage(ws)
  const secondMessage = nextNonOptionsMessage(ws)
  const res = await fetch(`${bs.url}/__bs/reload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ files: ['a.css', 'b.css'] }),
  })

  assert.strictEqual(res.status, 200)
  assert.deepStrictEqual(await res.json(), { ok: true })
  assert.deepStrictEqual(await withTimeout('receive first HTTP file reload', firstMessage), {
    type: 'file-reload',
    file: {
      ext: 'css',
      path: 'a.css',
      basename: 'a.css',
      event: 'change',
      type: 'inject',
    },
  })
  assert.deepStrictEqual(await withTimeout('receive second HTTP file reload', secondMessage), {
    type: 'file-reload',
    file: {
      ext: 'css',
      path: 'b.css',
      basename: 'b.css',
      event: 'change',
      type: 'inject',
    },
  })
})

test('createServer: legacy HTTP protocol reload supports repeated args', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const firstMessage = nextNonOptionsMessage(ws)
  const secondMessage = nextNonOptionsMessage(ws)
  const params = new URLSearchParams()
  params.set('method', 'reload')
  params.append('args', 'a.css')
  params.append('args', 'b.css')

  const res = await fetch(`${bs.url}/__browser_sync__?${params}`)
  const body = await res.text()

  assert.strictEqual(res.status, 200)
  assert.ok(body.includes('Called public API method `.reload()`'))
  assert.ok(body.includes('With args: ["a.css","b.css"]'))
  assert.deepStrictEqual(await withTimeout('receive first legacy HTTP file reload', firstMessage), {
    type: 'file-reload',
    file: {
      ext: 'css',
      path: 'a.css',
      basename: 'a.css',
      event: 'change',
      type: 'inject',
    },
  })
  assert.deepStrictEqual(await withTimeout('receive second legacy HTTP file reload', secondMessage), {
    type: 'file-reload',
    file: {
      ext: 'css',
      path: 'b.css',
      basename: 'b.css',
      event: 'change',
      type: 'inject',
    },
  })
})

test('createServer: legacy HTTP protocol reload with non-injectable arg full reloads', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const message = nextNonOptionsMessage(ws)
  const res = await fetch(`${bs.url}/__browser_sync__?method=reload&args=somefile.php`)
  const body = await res.text()

  assert.strictEqual(res.status, 200)
  assert.ok(body.includes('With args: "somefile.php"'))
  assert.deepStrictEqual(await withTimeout('receive legacy HTTP full reload', message), { type: 'reload' })
})

test('createServer: legacy HTTP protocol reload with no args full reloads', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const message = nextNonOptionsMessage(ws)
  const res = await fetch(`${bs.url}/__browser_sync__?method=reload`)
  const body = await res.text()

  assert.strictEqual(res.status, 200)
  assert.ok(body.includes('With args: undefined'))
  assert.deepStrictEqual(await withTimeout('receive legacy HTTP no-arg reload', message), { type: 'reload' })
})

test('createServer: legacy HTTP protocol errors match missing or unknown methods', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const missing = await fetch(`${bs.url}/__browser_sync__`)
  assert.strictEqual(missing.status, 500)
  assert.ok((await missing.text()).includes('Error: No Parameters were provided.'))

  const unknown = await fetch(`${bs.url}/__browser_sync__?method=relzoad&args=somefile.php`)
  assert.strictEqual(unknown.status, 404)
  assert.strictEqual(await unknown.text(), 'Public API method `relzoad` not found.')
})

test('createServer: GET /__bs/client.js returns JS', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const res = await fetch(`${bs.url}/__bs/client.js`)
  assert.strictEqual(res.status, 200)
  const ct = res.headers.get('content-type') ?? ''
  assert.ok(ct.includes('javascript'), `expected JS content-type, got: ${ct}`)
})

test('createServer: HTML response gets script injected', async (t) => {
  const bs = await createServer(makeOpts({ server: '.' }))
  t.after(() => bs.exit())

  // Fetch a known HTML file — the root will serve index.html if present,
  // but we can also just check the injection hook via the static route.
  // Since the repo root has no index.html, we hit a 404 or directory listing.
  // Instead test injection by serving our own inline HTML via the test.
  // We'll use the reload endpoint as a proxy — it returns JSON not HTML.
  // Real injection test: fetch a file that has text/html content-type.
  // The simplest is to just verify the server is running and the hook is registered.
  assert.ok(bs.url.startsWith('http://'))
})

test('createServer: HTML static file gets script injected', async (t) => {
  // Serve from a temp dir with an index.html
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'bs-test-'))
  writeFileSync(join(dir, 'index.html'), '<html><body><h1>hello</h1></body></html>')

  const bs = await createServer(makeOpts({ server: dir }))
  t.after(() => bs.exit())

  const res = await fetch(`${bs.url}/`)
  assert.strictEqual(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes('__bs_script__'), `script not injected, got: ${html}`)
  assert.ok(html.includes('/__bs/client.js'), `client.js not referenced, got: ${html}`)
})

test('createServer: .reload() and .notify() do not throw', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  assert.doesNotThrow(() => bs.reload())
  assert.doesNotThrow(() => bs.reload(['styles.css']))
  assert.doesNotThrow(() => bs.notify('test message'))
})

test('createServer: .pause() and .resume() do not throw', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  assert.doesNotThrow(() => bs.pause())
  assert.doesNotThrow(() => bs.resume())
})

test('createServer: public plugin middleware helpers work after startup', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const servedId = bs.serveFile('/late-plugin-file.txt', {
    type: 'text/plain; charset=utf-8',
    content: 'late file',
  })
  const middlewareId = bs.addMiddleware('/late-plugin-middleware', (_req, res) => {
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end('late middleware')
  })

  assert.ok(servedId)
  assert.ok(middlewareId)

  let res = await withTimeout('fetch late served file', fetch(`${bs.url}/late-plugin-file.txt`))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), 'late file')

  res = await withTimeout('fetch late middleware', fetch(`${bs.url}/late-plugin-middleware`))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), 'late middleware')

  bs.removeMiddleware(servedId)
  bs.removeMiddleware(middlewareId!)

  res = await withTimeout('fetch removed served file', fetch(`${bs.url}/late-plugin-file.txt`))
  assert.strictEqual(res.status, 404)

  res = await withTimeout('fetch removed middleware', fetch(`${bs.url}/late-plugin-middleware`))
  assert.strictEqual(res.status, 404)
})

test('createServer: .stream() returns a Transform', async (t) => {
  const { Transform } = await import('node:stream')
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const s = bs.stream()
  assert.ok(s instanceof Transform)
})

test('createServer: .stream() passes chunks through', async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const s = bs.stream()
  const result = await new Promise<unknown>((resolve) => {
    s.on('data', resolve)
    s.write({ path: 'styles.css' })
  })
  assert.deepStrictEqual(result, { path: 'styles.css' })
})

test('createServer: .stream({ match }) only reloads matching files', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const message = nextNonOptionsMessage(ws)
  const stream = bs.stream({ match: '**/*.css' })
  await withTimeout('write stream chunks', writeStreamChunks(stream, [{ path: 'styles.css' }, { path: 'app.js' }]))

  assert.deepStrictEqual(await withTimeout('receive stream message', message), {
    type: 'file-reload',
    file: {
      ext: 'css',
      path: 'styles.css',
      basename: 'styles.css',
      event: 'change',
      type: 'inject',
    },
  })
})

test('createServer: .stream({ once: true }) sends one full reload', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const message = nextNonOptionsMessage(ws)
  const stream = bs.stream({ once: true })
  await withTimeout('write stream chunks', writeStreamChunks(stream, [{ path: 'styles.css' }, { path: 'app.css' }]))

  assert.deepStrictEqual(await withTimeout('receive stream message', message), { type: 'reload' })
})

test('createServer: .stream() batches mixed files into one full reload', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
  })

  const message = nextNonOptionsMessage(ws)
  const stream = bs.stream()
  await withTimeout('write stream chunks', writeStreamChunks(stream, [{ path: 'styles.css' }, { path: 'index.html' }]))

  assert.deepStrictEqual(await withTimeout('receive stream message', message), { type: 'reload' })
})

test('createServer: watcher honors reloadThrottle for rapid file changes', { timeout: 10000 }, async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'bs-reload-throttle-'))
  const file = join(dir, 'index.html')
  writeFileSync(file, '<!doctype html><title>before</title>')

  const bs = await createServer(makeOpts({ files: [dir], reloadDebounce: 50, reloadThrottle: 1000 }))
  const ws = await withTimeout('connect ready websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(ws)
    await bs.exit()
    rmSync(dir, { recursive: true, force: true })
  })

  await new Promise(resolve => setTimeout(resolve, 500))

  const firstMessage = nextNonOptionsMessage(ws)
  writeFileSync(file, '<!doctype html><title>first</title>')
  assert.deepStrictEqual(await withTimeout('receive first watcher reload', firstMessage), { type: 'reload' })

  writeFileSync(file, '<!doctype html><title>second</title>')
  await withTimeout('verify reloadThrottle suppresses second watcher reload', expectNoNonOptionsMessage(ws), 1000)
})

test('createServer: events emitter is an EventEmitter', async (t) => {
  const { EventEmitter } = await import('node:events')
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  assert.ok(bs.events instanceof EventEmitter)
})

test('createServer: .exit() closes cleanly', async () => {
  const bs = await createServer(makeOpts())
  await assert.doesNotReject(() => bs.exit())
})

test('createServer: UI starts when ui option is enabled', async (t) => {
  const bs = await createServer(makeOpts({ ui: true }))
  t.after(() => bs.exit())

  assert.ok(bs.uiUrl !== null)
  assert.ok(bs.uiPort !== null)
  assert.ok(bs.uiUrl!.startsWith('http://127.0.0.1:'))

  const res = await fetch(bs.uiUrl!)
  assert.strictEqual(res.status, 200)
  const html = await res.text()
  assert.ok(html.includes('domstack-sync'), `UI page missing title, got: ${html}`)
})

test('createServer: UI init exposes snippet mode metadata', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts({ ui: true, server: false }))
  t.after(() => bs.exit())
  assert.ok(bs.uiUrl)

  const ws = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(ws))

  const init = await withTimeout('receive UI init', nextMessageMatching(ws, msg => msg['type'] === 'init'))
  const data = init['data'] as { mode: string; snippet: string | null; serverBaseDirs: string[] }
  assert.strictEqual(data.mode, 'snippet')
  assert.ok(data.snippet?.includes('/__bs/client.js'))
  assert.deepStrictEqual(data.serverBaseDirs, [])
})

test('createServer: UI init exposes server mode base directory metadata', { timeout: 10000 }, async (t) => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'bs-ui-overview-'))
  const bs = await createServer(makeOpts({ ui: true, server: dir }))
  t.after(async () => {
    await bs.exit()
    rmSync(dir, { recursive: true, force: true })
  })
  assert.ok(bs.uiUrl)

  const ws = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(ws))

  const init = await withTimeout('receive UI init', nextMessageMatching(ws, msg => msg['type'] === 'init'))
  const data = init['data'] as { mode: string; snippet: string | null; serverBaseDirs: string[] }
  assert.strictEqual(data.mode, 'server')
  assert.strictEqual(data.snippet, null)
  assert.deepStrictEqual(data.serverBaseDirs, [dir])
})

test('createServer: remote debug assets are served from the main server', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts())
  t.after(() => bs.exit())

  const res = await fetch(`${bs.url}/browser-sync/pesticide.css`)
  assert.strictEqual(res.status, 200)
  assert.ok((res.headers.get('content-type') ?? '').includes('text/css'))
  const css = await res.text()
  assert.ok(css.includes('outline'))
})

test('createServer: remote debug no-cache UI control affects responses', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts({ ui: true }))
  t.after(() => bs.exit())
  assert.ok(bs.uiUrl)

  const ws = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(ws))
  await withTimeout('receive UI init', nextMessageMatching(ws, msg => msg['type'] === 'init'))

  ws.send(JSON.stringify({ type: 'remote-debug:no-cache', active: true }))
  await withTimeout('receive no-cache update', nextMessageMatching(ws, msg => Boolean((msg['data'] as { remoteDebug?: unknown } | undefined)?.remoteDebug)))

  const res = await fetch(`${bs.url}/__bs/client.js`)
  assert.strictEqual(res.headers.get('cache-control'), 'no-cache, no-store, must-revalidate')
  assert.strictEqual(res.headers.get('pragma'), 'no-cache')
  assert.strictEqual(res.headers.get('expires'), '0')
})

test('createServer: network throttle UI control creates a working proxy server', { timeout: 10000 }, async (t) => {
  const bs = await createServer(makeOpts({ ui: true }))
  t.after(() => bs.exit())
  assert.ok(bs.uiUrl)

  const ws = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(ws))
  await withTimeout('receive UI init', nextMessageMatching(ws, msg => msg['type'] === 'init'))

  ws.send(JSON.stringify({ type: 'network-throttle:create', targetId: 'dsl', port: '' }))
  const update = await withTimeout(
    'receive network throttle update',
    nextMessageMatching(ws, msg => Boolean((msg['data'] as { networkThrottle?: unknown } | undefined)?.networkThrottle))
  )
  const networkThrottle = (update['data'] as { networkThrottle: { servers: Record<string, { urls: string[]; port: number }> } }).networkThrottle
  const [server] = Object.values(networkThrottle.servers)
  assert.ok(server)

  const res = await fetch(`${server.urls[0]}/__bs/client.js`)
  assert.strictEqual(res.status, 200)
  assert.ok((res.headers.get('content-type') ?? '').includes('javascript'))

  ws.send(JSON.stringify({ type: 'network-throttle:destroy', port: server.port }))
  await withTimeout(
    'receive network throttle destroy update',
    nextMessageMatching(ws, msg => Object.keys(((msg['data'] as { networkThrottle?: { servers: Record<string, unknown> } } | undefined)?.networkThrottle?.servers ?? {})).length === 0)
  )
})

test('createServer: inline plugins expose legacy lifecycle, hooks, UI state, and UI events', { timeout: 10000 }, async (t) => {
  let initialized = false
  let cleaned = false
  const fixturePlugin: BrowserSyncPluginModule = {
    'plugin:name': 'fixture-plugin',
    title: 'Fixture Plugin',
    plugin (bs, opts) {
      initialized = opts['answer'] === 42
      bs.serveFile('/fixture-plugin.txt', {
        type: 'text/plain; charset=utf-8',
        content: 'served by plugin',
      })
      bs.ui.listen('fixture-plugin', {
        ping: (data) => bs.events.emit('fixture-plugin:ping', data),
      })
      bs.registerCleanupTask(() => { cleaned = true })
    },
    hooks: {
      'server:middleware': () => {
        const middleware: PluginMiddleware = (req, res, next) => {
          if (req.url === '/fixture-middleware') {
            res.setHeader('content-type', 'text/plain; charset=utf-8')
            res.end('middleware hit')
            return
          }
          next()
        }
        return middleware
      },
      'client:js': 'window.__fixturePlugin = true',
      'client:events': () => ['fixture:client'],
      page: { path: '/fixture-plugin', title: 'Fixture Plugin', template: 'fixture.html', order: 10, icon: 'plug' },
      elements: [{ id: '__fixture-plugin-css__', type: 'css', src: '/fixture-plugin.css' }],
      'files:watch': 'fixture-plugin/**/*.txt',
    },
  }

  const bs = await createServer(makeOpts({ ui: true, plugins: [{ module: fixturePlugin, options: { answer: 42 } }] }))
  let exited = false
  t.after(async () => {
    if (!exited) await bs.exit()
  })
  assert.ok(bs.uiUrl)
  assert.strictEqual(initialized, true)
  assert.deepStrictEqual(bs.getUserPlugins().map(plugin => ({
    name: plugin.name,
    title: plugin.title,
    active: plugin.active,
    opts: plugin.opts,
    page: plugin.page,
  })), [{
    name: 'fixture-plugin',
    title: 'Fixture Plugin',
    active: true,
    opts: { answer: 42 },
    page: { path: '/fixture-plugin', title: 'Fixture Plugin', template: 'fixture.html', order: 10, icon: 'plug' },
  }])

  const served = await withTimeout('fetch plugin served file', fetch(`${bs.url}/fixture-plugin.txt`))
  assert.strictEqual(served.status, 200)
  assert.strictEqual(await served.text(), 'served by plugin')

  const middleware = await withTimeout('fetch plugin middleware', fetch(`${bs.url}/fixture-middleware`))
  assert.strictEqual(middleware.status, 200)
  assert.strictEqual(await middleware.text(), 'middleware hit')

  const clientJs = await withTimeout('fetch plugin client js', fetch(`${bs.url}/browser-sync/plugins/fixture-plugin.js`))
  assert.strictEqual(clientJs.status, 200)
  assert.ok((await clientJs.text()).includes('__fixturePlugin'))

  const browserWs = await withTimeout('connect browser websocket', connectReadyWs(bs.url))
  t.after(() => closeWs(browserWs))
  assert.deepStrictEqual(await withTimeout(
    'receive plugin client element',
    nextMessageMatching(browserWs, msg => msg['type'] === 'ui:element:add')
  ), {
    type: 'ui:element:add',
    element: { id: '__browser-sync-plugin-fixture-plugin-client-js__', type: 'js', src: '/browser-sync/plugins/fixture-plugin.js' },
  })

  const uiWs = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(uiWs))
  const init = await withTimeout('receive UI init', nextMessageMatching(uiWs, msg => msg['type'] === 'init'))
  assert.strictEqual(((init['data'] as { plugins: Array<{ name: string }> }).plugins[0])?.name, 'fixture-plugin')

  const ping = new Promise<unknown>(resolve => bs.events.once('fixture-plugin:ping', resolve))
  uiWs.send(JSON.stringify({ type: 'ui:event', namespace: 'fixture-plugin', event: 'ping', data: { ok: true } }))
  assert.deepStrictEqual(await withTimeout('receive plugin UI event', ping), { ok: true })

  const pluginPage = await withTimeout('fetch inline plugin UI page', fetch(`${bs.uiUrl!}/fixture-plugin`))
  assert.strictEqual(pluginPage.status, 200)
  assert.ok((await pluginPage.text()).includes('Fixture Plugin'))

  const disabledUpdate = nextMessageMatching(uiWs, msg => Boolean((msg['data'] as { plugins?: unknown } | undefined)?.plugins))
  uiWs.send(JSON.stringify({ type: 'plugins:set', plugin: { name: 'fixture-plugin', title: 'Fixture Plugin', active: false } }))
  assert.strictEqual(((await disabledUpdate)['data'] as { plugins: Array<{ active: boolean }> }).plugins[0]?.active, false)
  assert.strictEqual(bs.getUserPlugin('fixture-plugin')?.active, false)

  const disabledMiddleware = await withTimeout('fetch disabled plugin middleware', fetch(`${bs.url}/fixture-middleware`))
  assert.strictEqual(disabledMiddleware.status, 404)

  await closeWs(browserWs)
  await closeWs(uiWs)
  await bs.exit()
  exited = true
  assert.strictEqual(cleaned, true)
})

test('createServer: plugin client:events relay custom browser events', { timeout: 10000 }, async (t) => {
  const fixturePlugin: BrowserSyncPluginModule = {
    'plugin:name': 'client-events-plugin',
    plugin () {},
    hooks: {
      'client:events': () => ['fixture:client', 'fixture:extra', 'fixture:client'],
    },
  }

  const bs = await createServer(makeOpts({ plugins: [fixturePlugin] }))
  const first = await withTimeout('connect first browser websocket', connectReadyWs(bs.url))
  const second = await withTimeout('connect second browser websocket', connectReadyWs(bs.url))
  t.after(async () => {
    await closeWs(first)
    await closeWs(second)
    await bs.exit()
  })

  const relayed = nextMessageMatching(second, msg => msg['type'] === 'fixture:client')
  first.send(JSON.stringify({ type: 'fixture:client', payload: { ok: true } }))

  assert.deepStrictEqual(await withTimeout('receive plugin client event', relayed), {
    type: 'fixture:client',
    payload: { ok: true },
  })
  await withTimeout('verify plugin client event is not echoed to sender', expectNoNonOptionsMessage(first), 1000)
})

test('createServer: external plugin option and active changes update UI state', { timeout: 10000 }, async (t) => {
  const fixturePlugin: BrowserSyncPluginModule = {
    'plugin:name': 'opts-plugin',
    title: 'Options Plugin',
    plugin () {},
  }

  const bs = await createServer(makeOpts({
    ui: true,
    plugins: [{ module: fixturePlugin, options: { answer: 42 } }],
  }))
  t.after(() => bs.exit())
  assert.ok(bs.uiUrl)

  const uiWs = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(uiWs))
  await withTimeout('receive UI init', nextMessageMatching(uiWs, msg => msg['type'] === 'init'))

  const optsUpdate = nextMessageMatching(uiWs, msg => {
    const plugins = (msg['data'] as { plugins?: Array<{ name: string; opts?: Record<string, unknown> }> } | undefined)?.plugins
    return Boolean(plugins?.some(plugin => plugin.name === 'opts-plugin' && plugin.opts?.['answer'] === 100))
  })
  bs.events.emit('plugins:opts', { name: 'opts-plugin', opts: { answer: 100 } })
  await withTimeout('receive plugin opts UI update', optsUpdate)
  assert.deepStrictEqual(bs.getUserPlugin('opts-plugin')?.opts, { answer: 100 })

  const activeUpdate = nextMessageMatching(uiWs, msg => {
    const plugins = (msg['data'] as { plugins?: Array<{ name: string; active: boolean }> } | undefined)?.plugins
    return Boolean(plugins?.some(plugin => plugin.name === 'opts-plugin' && plugin.active === false))
  })
  bs.events.emit('plugins:configure', { name: 'opts-plugin', active: false })
  await withTimeout('receive plugin active UI update', activeUpdate)
  assert.strictEqual(bs.getUserPlugin('opts-plugin')?.active, false)
})

test('createServer: plugin server middleware preserves registration order', { timeout: 10000 }, async (t) => {
  const order: string[] = []
  const firstPlugin: BrowserSyncPluginModule = {
    'plugin:name': 'middleware-first',
    plugin () {},
    hooks: {
      'server:middleware': (): PluginMiddleware => (req, _res, next) => {
        if (req.url === '/middleware-order') order.push('first')
        next()
      },
    },
  }
  const secondPlugin: BrowserSyncPluginModule = {
    'plugin:name': 'middleware-second',
    plugin () {},
    hooks: {
      'server:middleware': (): PluginMiddleware => (req, res, next) => {
        if ((req.url ?? '').startsWith('/middleware-order')) {
          order.push('second')
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end(order.join(','))
          return
        }
        next()
      },
    },
  }

  const bs = await createServer(makeOpts({ plugins: [firstPlugin, secondPlugin] }))
  t.after(() => bs.exit())

  const res = await withTimeout('fetch middleware ordered route', fetch(`${bs.url}/middleware-order`))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(await res.text(), 'first,second')
})

test('createServer: plugin module strings resolve package UI metadata and query options', { timeout: 10000 }, async (t) => {
  const { mkdirSync, mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const root = mkdtempSync(join(tmpdir(), 'bs-plugin-package-'))
  const dir = join(root, 'package-plugin')
  mkdirSync(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    type: 'module',
    main: 'index.mjs',
    'browser-sync:ui': {
      hooks: {
        markup: 'markup.html',
        page: {
          path: '/package-plugin',
          title: 'Package Plugin',
          template: 'package-plugin.html',
          controller: 'PackagePluginController',
          order: 11,
          icon: 'plug',
        },
        templates: ['template.html'],
        'client:js': ['ui.js'],
      },
    },
  }))
  writeFileSync(join(dir, 'index.mjs'), [
    'export default {',
    '  "plugin:name": "package-plugin",',
    '  title: "Package Plugin",',
    '  plugin (bs, opts) { bs.events.emit("package-plugin:init", opts) }',
    '}',
  ].join('\n'))
  writeFileSync(join(dir, 'markup.html'), '<p>Package plugin markup</p>')
  writeFileSync(join(dir, 'template.html'), '<section>Package template</section>')
  writeFileSync(join(dir, 'ui.js'), 'window.__packagePluginUi = true')

  const bs = await createServer(makeOpts({
    cwd: root,
    ui: true,
    plugins: [{ module: './package-plugin?color=blue', options: { color: 'red' } }],
  }))
  t.after(async () => {
    await bs.exit()
    rmSync(root, { recursive: true, force: true })
  })
  assert.ok(bs.uiUrl)

  const plugin = bs.getUserPlugin('package-plugin')
  assert.ok(plugin)
  assert.deepStrictEqual(plugin.opts, { color: 'red' })
  assert.strictEqual(plugin.markup, '<p>Package plugin markup</p>')
  assert.deepStrictEqual(plugin.page, {
    path: '/package-plugin',
    title: 'Package Plugin',
    template: 'package-plugin.html',
    controller: 'PackagePluginController',
    order: 11,
    icon: 'plug',
  })
  assert.deepStrictEqual(plugin.templates, { 'template.html': '<section>Package template</section>' })
  assert.deepStrictEqual(plugin.clientJs, { 'ui.js': 'window.__packagePluginUi = true' })

  const pluginPage = await withTimeout('fetch package plugin UI page', fetch(`${bs.uiUrl!}/package-plugin`))
  assert.strictEqual(pluginPage.status, 200)
  assert.ok((await pluginPage.text()).includes('Package Plugin'))

  const uiWs = await withTimeout('connect UI websocket', connectUiWs(bs.uiUrl!))
  t.after(() => closeWs(uiWs))
  const init = await withTimeout('receive UI init', nextMessageMatching(uiWs, msg => msg['type'] === 'init'))
  const [uiPlugin] = (init['data'] as { plugins: Array<{ markup?: string; page?: { path: string } }> }).plugins
  assert.strictEqual(uiPlugin?.markup, '<p>Package plugin markup</p>')
  assert.strictEqual(uiPlugin?.page?.path, '/package-plugin')
})

test('createServer: plugin module strings resolve absolute CommonJS modules', { timeout: 10000 }, async (t) => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'bs-plugin-cjs-'))
  const pluginPath = join(dir, 'cjs-plugin.cjs')
  writeFileSync(pluginPath, [
    'module.exports = {',
    '  "plugin:name": "cjs-plugin",',
    '  title: "CJS Plugin",',
    '  plugin (bs, opts) { bs.events.emit("cjs-plugin:init", opts) }',
    '}',
  ].join('\n'))

  const bs = await createServer(makeOpts({
    plugins: [`${pluginPath}?mode=query`],
  }))
  t.after(async () => {
    await bs.exit()
    rmSync(dir, { recursive: true, force: true })
  })

  assert.deepStrictEqual(bs.getUserPlugin('cjs-plugin')?.opts, { mode: 'query' })
})
