import test from 'node:test'
import assert from 'node:assert'
import { createWsClient } from './ws.ts'
import type { UiState } from '../types.ts'
import type { WsStatus } from './ws.ts'

class MockWebSocket {
  static readonly OPEN = 1
  static readonly CLOSED = 3

  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  sent: string[] = []
  readonly url: string

  constructor (url: string) {
    this.url = url
  }

  send (data: string): void {
    this.sent.push(data)
  }

  close (): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  simulateOpen (): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateClose (): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  simulateMessage (message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

function installBrowserGlobals (t: test.TestContext): MockWebSocket[] {
  const sockets: MockWebSocket[] = []
  const originalWebSocket = globalThis.WebSocket
  const originalLocation = globalThis.location
  t.mock.method(console, 'info', () => {})

  class TestWebSocket extends MockWebSocket {
    constructor (url: string) {
      super(url)
      sockets.push(this)
    }
  }

  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    value: TestWebSocket,
  })
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      protocol: 'http:',
      host: 'localhost:3001',
    },
  })

  t.after(() => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: originalWebSocket,
    })
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })

  return sockets
}

function makeState (): UiState {
  return {
    serverUrl: 'http://localhost:3000',
    uiUrl: 'http://localhost:3001',
    localIp: '127.0.0.1',
    port: 3000,
    uiPort: 3001,
    mode: 'server',
    snippet: null,
    serverBaseDirs: [],
    proxyTarget: null,
    tunnelUrl: null,
    options: {
      ghostMode: {
        scroll: true,
        clicks: true,
        location: true,
        forms: { submit: true, inputs: true, toggles: true },
      },
      notify: true,
      codeSync: true,
      injectChanges: true,
      injectFileTypes: ['css'],
      tagNames: { css: 'link' },
      scrollElements: [],
      scrollElementMapping: [],
      scrollProportionally: true,
      scrollThrottle: 0,
    },
    connections: [],
    history: [],
    remoteDebug: {
      clientFiles: [],
      overlayGrid: {
        active: false,
        offsetY: '0',
        offsetX: '0',
        size: '16px',
        selector: 'body',
        color: 'rgba(0, 0, 0, .2)',
        horizontal: true,
        vertical: true,
      },
      noCache: { active: false },
      latency: { active: false, rate: 0 },
    },
    networkThrottle: {
      targets: [],
      servers: {},
    },
    plugins: [],
  }
}

test('ui ws: replays cached init when onUpdate is assigned late', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const sockets = installBrowserGlobals(t)
  const client = createWsClient()
  const state = makeState()

  sockets[0].simulateMessage({ type: 'init', data: state })

  let received: UiState | null = null
  client.onUpdate = nextState => { received = nextState }

  assert.deepStrictEqual(received, state)
  client.close()
})

test('ui ws: replays current status when onStatus is assigned late', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const sockets = installBrowserGlobals(t)
  const client = createWsClient()

  sockets[0].simulateOpen()

  let status: WsStatus | null = null
  client.onStatus = nextStatus => { status = nextStatus }

  assert.strictEqual(status, 'connected')
  client.close()
})

test('ui ws: send is guarded by socket open state', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const sockets = installBrowserGlobals(t)
  const client = createWsClient()

  client.send({ type: 'history:clear' })
  assert.deepStrictEqual(sockets[0].sent, [])

  sockets[0].simulateOpen()
  client.send({ type: 'history:clear' })
  assert.deepStrictEqual(sockets[0].sent, [JSON.stringify({ type: 'history:clear' })])
  client.close()
})

test('ui ws: reconnects with exponential backoff after close', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const sockets = installBrowserGlobals(t)
  createWsClient()

  sockets[0].simulateClose()
  assert.strictEqual(sockets.length, 1)
  t.mock.timers.tick(1000)
  assert.strictEqual(sockets.length, 2)

  sockets[1].simulateClose()
  t.mock.timers.tick(1999)
  assert.strictEqual(sockets.length, 2)
  t.mock.timers.tick(1)
  assert.strictEqual(sockets.length, 3)
})
