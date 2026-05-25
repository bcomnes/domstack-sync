import test from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { WebSocket } from 'ws'
import { createUiServer } from './server.ts'
import { findFreePort } from '../ports.ts'
import { applyGhostModePatch } from '../options.ts'
import type { BrowserLocationMessage } from '../protocol.ts'
import type { ClientRuntimeOptions, ClientRuntimeOptionsPatch } from '../protocol.ts'
import type { NetworkThrottleServerInfo, NetworkThrottleTarget } from './types.ts'

interface TestWebSocket extends WebSocket {
  messages: Array<Record<string, unknown>>
  subscribers: Array<() => void>
}

function defaultRuntimeOptions (): ClientRuntimeOptions {
  return {
    ghostMode: {
      scroll: true,
      clicks: true,
      location: true,
      forms: { submit: true, inputs: true, toggles: true },
    },
    notify: true,
    codeSync: true,
    injectChanges: true,
    injectFileTypes: ['css', 'png'],
    tagNames: { css: 'link', png: 'img' },
    scrollElements: [],
    scrollElementMapping: [],
    scrollProportionally: true,
    scrollThrottle: 0,
  }
}

function defaultUiCallbacks (): {
  sendUiElementAdd: () => void
  sendUiElementRemove: () => void
  sendOverlayGridCss: () => void
  setNoCache: () => void
  setLatency: () => void
  createThrottleServer: (target: NetworkThrottleTarget, port: string) => Promise<NetworkThrottleServerInfo>
  destroyThrottleServer: () => Promise<void>
} {
  return {
    sendUiElementAdd: () => {},
    sendUiElementRemove: () => {},
    sendOverlayGridCss: () => {},
    setNoCache: () => {},
    setLatency: () => {},
    createThrottleServer: async (target, port) => ({
      port: Number(port) || 3010,
      urls: [`http://localhost:${Number(port) || 3010}`],
      speed: target,
    }),
    destroyThrottleServer: async () => {},
  }
}

function connectWsWithFirstMessage (url: string): Promise<{ ws: TestWebSocket; message: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url) as TestWebSocket
    ws.messages = []
    ws.subscribers = []
    let opened = false
    let message: Record<string, unknown> | null = null

    function maybeResolve (): void {
      if (opened && message) resolve({ ws, message })
    }

    ws.once('open', () => {
      opened = true
      maybeResolve()
    })
    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString()) as Record<string, unknown>
      ws.messages.push(parsed)
      for (const subscriber of ws.subscribers) subscriber()
      message ??= parsed
      maybeResolve()
    })
    ws.once('error', reject)
  })
}

function nextMessage (ws: TestWebSocket): Promise<Record<string, unknown>> {
  const existing = ws.messages.shift()
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const subscriber = () => {
      const message = ws.messages.shift()
      if (!message) return
      ws.subscribers = ws.subscribers.filter(item => item !== subscriber)
      resolve(message)
    }
    ws.subscribers.push(subscriber)
  })
}

async function nextMessageMatching (
  ws: TestWebSocket,
  predicate: (message: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  while (true) {
    const message = await nextMessage(ws)
    if (predicate(message)) return message
  }
}

function terminateWs (ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return }
    ws.once('close', resolve)
    ws.terminate()
  })
}

test('createUiServer: options:set updates runtime options and broadcasts UI state', { timeout: 10000 }, async (t) => {
  let options = defaultRuntimeOptions()
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: () => options,
    sendBrowserLocation: () => {},
    setRuntimeOptions: (patch: ClientRuntimeOptionsPatch) => {
      options = {
        ...options,
        ...patch,
        ghostMode: applyGhostModePatch(options.ghostMode, patch.ghostMode),
      }
      return options
    },
    highlightClient: () => {},
    ...defaultUiCallbacks(),
  })
  t.after(() => ui.exit())

  const { ws, message: init } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))

  assert.strictEqual(init['type'], 'init')
  ws.messages.shift()

  const update = nextMessage(ws)
  ws.send(JSON.stringify({ type: 'options:set', data: { ghostMode: { scroll: false } } }))

  assert.deepStrictEqual(await update, {
    type: 'update',
    data: {
      options: {
        ...defaultRuntimeOptions(),
        ghostMode: {
          scroll: false,
          clicks: true,
          location: true,
          forms: { submit: true, inputs: true, toggles: true },
        },
      },
    },
  })
})

test('createUiServer: initial state includes overview mode metadata', { timeout: 10000 }, async (t) => {
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    mode: 'snippet',
    snippet: '<script async src="/__bs/client.js"></script>',
    serverBaseDirs: ['/tmp/project/public'],
    proxyTarget: null,
    tunnelUrl: null,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: () => {},
    ...defaultUiCallbacks(),
  })
  t.after(() => ui.exit())

  const { ws, message: init } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))

  assert.strictEqual(init['type'], 'init')
  const data = init['data'] as {
    mode: string
    snippet: string | null
    serverBaseDirs: string[]
    proxyTarget: string | null
    tunnelUrl: string | null
  }
  assert.strictEqual(data.mode, 'snippet')
  assert.strictEqual(data.snippet, '<script async src="/__bs/client.js"></script>')
  assert.deepStrictEqual(data.serverBaseDirs, ['/tmp/project/public'])
  assert.strictEqual(data.proxyTarget, null)
  assert.strictEqual(data.tunnelUrl, null)
})

test('createUiServer: tracks visited URLs from client updates', { timeout: 10000 }, async (t) => {
  const events = new EventEmitter()
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events,
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: () => {},
    ...defaultUiCallbacks(),
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))
  ws.messages.shift()

  const historyUpdate = nextMessage(ws)
  events.emit('client:update', {
    id: 'abc123',
    ua: 'Browser',
    connectedAt: Date.now(),
    pathname: '/products',
    path: '/products?page=1#details',
    href: 'http://localhost:3000/products?page=1#details',
  })

  assert.deepStrictEqual(await historyUpdate, {
    type: 'update',
    data: {
      history: [{ path: '/products?page=1#details', key: 1 }],
    },
  })
})

test('createUiServer: history actions send, remove, and clear visited URLs', { timeout: 10000 }, async (t) => {
  const events = new EventEmitter()
  const sentLocations: BrowserLocationMessage[] = []
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events,
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: (message) => { sentLocations.push(message) },
    highlightClient: () => {},
    ...defaultUiCallbacks(),
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))
  ws.messages.shift()

  const added = nextMessage(ws)
  events.emit('client:update', {
    id: 'abc123',
    ua: 'Browser',
    connectedAt: Date.now(),
    pathname: '/products',
    path: '/products',
    href: 'http://localhost:3000/products',
  })
  await added

  ws.send(JSON.stringify({ type: 'history:send-all', path: '/products' }))
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepStrictEqual(sentLocations, [{
    type: 'browser:location',
    override: true,
    path: '/products',
    url: 'http://localhost:3000/products',
  }])

  const removed = nextMessageMatching(ws, msg => Boolean((msg['data'] as { history?: unknown } | undefined)?.history))
  ws.send(JSON.stringify({ type: 'history:remove', path: '/products' }))
  assert.deepStrictEqual(await removed, {
    type: 'update',
    data: { history: [] },
  })

  const addedAgain = nextMessage(ws)
  events.emit('client:update', {
    id: 'abc123',
    ua: 'Browser',
    connectedAt: Date.now(),
    pathname: '/about',
    path: '/about',
    href: 'http://localhost:3000/about',
  })
  await addedAgain

  const cleared = nextMessageMatching(ws, msg => Boolean((msg['data'] as { history?: unknown } | undefined)?.history))
  ws.send(JSON.stringify({ type: 'history:clear' }))
  assert.deepStrictEqual(await cleared, {
    type: 'update',
    data: { history: [] },
  })
})

test('createUiServer: connection highlight action targets a client id', { timeout: 10000 }, async (t) => {
  const highlighted: string[] = []
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: (id) => { highlighted.push(id) },
    ...defaultUiCallbacks(),
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))

  ws.send(JSON.stringify({ type: 'connection:highlight', id: 'client-a' }))
  await new Promise(resolve => setTimeout(resolve, 50))

  assert.deepStrictEqual(highlighted, ['client-a'])
})

test('createUiServer: remote debug file and overlay actions target browser clients', { timeout: 10000 }, async (t) => {
  const added: unknown[] = []
  const removed: string[] = []
  const gridCss: string[] = []
  const uiPort = await findFreePort(0)
  const callbacks = defaultUiCallbacks()
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: () => {},
    ...callbacks,
    sendUiElementAdd: (element) => { added.push(element) },
    sendUiElementRemove: (id) => { removed.push(id) },
    sendOverlayGridCss: (innerHTML) => { gridCss.push(innerHTML) },
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))
  ws.messages.shift()

  const fileUpdate = nextMessageMatching(ws, msg => Boolean((msg['data'] as { remoteDebug?: unknown } | undefined)?.remoteDebug))
  ws.send(JSON.stringify({ type: 'remote-debug:file', name: 'pesticide', active: true }))
  const fileState = await fileUpdate
  assert.deepStrictEqual(added, [{
    id: '__browser-sync-pesticide__',
    type: 'css',
    src: '/browser-sync/pesticide.css',
  }])
  assert.strictEqual((fileState['data'] as { remoteDebug: { clientFiles: Array<{ name: string; active: boolean }> } }).remoteDebug.clientFiles.find(file => file.name === 'pesticide')?.active, true)

  const gridUpdate = nextMessageMatching(ws, msg => Boolean((msg['data'] as { remoteDebug?: unknown } | undefined)?.remoteDebug))
  ws.send(JSON.stringify({ type: 'remote-debug:overlay-grid', active: true }))
  const gridState = await gridUpdate
  assert.ok(gridCss[0]?.includes('body:after'))
  assert.strictEqual((gridState['data'] as { remoteDebug: { overlayGrid: { active: boolean } } }).remoteDebug.overlayGrid.active, true)

  ws.send(JSON.stringify({ type: 'remote-debug:overlay-grid:update', data: { size: '24px' } }))
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(gridCss.at(-1)?.includes('24px'))

  ws.send(JSON.stringify({ type: 'remote-debug:overlay-grid', active: false }))
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(removed.includes('__bs_overlay-grid-styles__'))
})

test('createUiServer: remote debug no-cache and latency mutate server controls', { timeout: 10000 }, async (t) => {
  const noCache: boolean[] = []
  const latency: number[] = []
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: () => {},
    ...defaultUiCallbacks(),
    setNoCache: (active) => { noCache.push(active) },
    setLatency: (ms) => { latency.push(ms) },
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))
  ws.messages.shift()

  ws.send(JSON.stringify({ type: 'remote-debug:no-cache', active: true }))
  ws.send(JSON.stringify({ type: 'remote-debug:latency', active: true, rate: 1.5 }))
  ws.send(JSON.stringify({ type: 'remote-debug:latency', active: false }))
  await new Promise(resolve => setTimeout(resolve, 50))

  assert.deepStrictEqual(noCache, [true])
  assert.deepStrictEqual(latency, [1500, 0])
})

test('createUiServer: network throttle creates and destroys proxy entries', { timeout: 10000 }, async (t) => {
  const created: Array<{ target: string; port: string }> = []
  const destroyed: number[] = []
  const uiPort = await findFreePort(0)
  const ui = await createUiServer({
    uiPort,
    serverUrl: 'http://localhost:3000',
    uiUrl: `http://localhost:${uiPort}`,
    localIp: '127.0.0.1',
    mainPort: 3000,
    events: new EventEmitter(),
    getConnections: () => [],
    getRuntimeOptions: defaultRuntimeOptions,
    setRuntimeOptions: defaultRuntimeOptions,
    sendBrowserLocation: () => {},
    highlightClient: () => {},
    ...defaultUiCallbacks(),
    createThrottleServer: async (target, port) => {
      created.push({ target: target.id, port })
      return { port: 4510, urls: ['http://localhost:4510'], speed: target }
    },
    destroyThrottleServer: async (port) => { destroyed.push(port) },
  })
  t.after(() => ui.exit())

  const { ws } = await connectWsWithFirstMessage(`ws://127.0.0.1:${uiPort}/ws`)
  t.after(() => terminateWs(ws))
  ws.messages.shift()

  const createUpdate = nextMessageMatching(ws, msg => Boolean((msg['data'] as { networkThrottle?: unknown } | undefined)?.networkThrottle))
  ws.send(JSON.stringify({ type: 'network-throttle:create', targetId: '3g', port: '4510' }))
  const createdState = (await createUpdate)['data'] as { networkThrottle: { servers: Record<string, { port: number }> } }
  assert.deepStrictEqual(created, [{ target: '3g', port: '4510' }])
  assert.strictEqual(createdState.networkThrottle.servers['4510']?.port, 4510)

  const destroyUpdate = nextMessageMatching(ws, msg => Boolean((msg['data'] as { networkThrottle?: unknown } | undefined)?.networkThrottle))
  ws.send(JSON.stringify({ type: 'network-throttle:destroy', port: 4510 }))
  const destroyedState = (await destroyUpdate)['data'] as { networkThrottle: { servers: Record<string, unknown> } }
  assert.deepStrictEqual(destroyed, [4510])
  assert.deepStrictEqual(destroyedState.networkThrottle.servers, {})
})
