import test from 'node:test'
import assert from 'node:assert'
import { createServer } from 'node:http'
import { WebSocket } from 'ws'
import { BsSockets } from './sockets.ts'
import { createLogger } from './logger.ts'

function makeLogger () {
  return createLogger('silent')
}

function startHttpServer (sockets: BsSockets): Promise<{ url: string; httpClose: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('upgrade', (req, socket, head) => {
      sockets.handleUpgrade(req, socket, head)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      resolve({
        url: `ws://127.0.0.1:${addr.port}`,
        httpClose: () => server.close(),
      })
    })
    server.on('error', reject)
  })
}

function connectWs (url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function connectWsWithFirstMessage (url: string): Promise<{ ws: WebSocket; message: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let opened = false
    let message: string | null = null

    function maybeResolve () {
      if (opened && message !== null) resolve({ ws, message })
    }

    ws.once('open', () => {
      opened = true
      maybeResolve()
    })
    ws.once('message', (d) => {
      message = d.toString()
      maybeResolve()
    })
    ws.once('error', reject)
  })
}

function terminateWs (ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return }
    ws.once('close', resolve)
    ws.terminate()
  })
}

test('BsSockets: getConnections returns empty initially', () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  assert.deepStrictEqual(sockets.getConnections(), [])
})

test('BsSockets: sends runtime options on connection when provided', async () => {
  const sockets = new BsSockets({
    logger: makeLogger(),
    getRuntimeOptions: () => ({
      ghostMode: {
        scroll: false,
        clicks: true,
        location: true,
        forms: { submit: false, inputs: false, toggles: false },
      },
      notify: false,
      codeSync: true,
      injectChanges: false,
      injectFileTypes: ['css', 'png'],
      tagNames: { css: 'link', png: 'img' },
      scrollElements: [],
      scrollElementMapping: [],
      scrollProportionally: true,
      scrollThrottle: 25,
    }),
  })
  const { url, httpClose } = await startHttpServer(sockets)

  try {
    const { ws, message } = await connectWsWithFirstMessage(url)
    await terminateWs(ws)

    assert.deepStrictEqual(JSON.parse(message), {
      type: 'options',
      data: {
        ghostMode: {
          scroll: false,
          clicks: true,
          location: true,
          forms: { submit: false, inputs: false, toggles: false },
        },
        notify: false,
        codeSync: true,
        injectChanges: false,
        injectFileTypes: ['css', 'png'],
        tagNames: { css: 'link', png: 'img' },
        scrollElements: [],
        scrollElementMapping: [],
        scrollProportionally: true,
        scrollThrottle: 25,
      },
    })
  } finally {
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: client:connect fires on connection', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  try {
    const connected = new Promise<{ id: string; ua: string; connectedAt: number }>((resolve) => {
      sockets.once('client:connect', resolve)
    })

    const ws = await connectWs(url)
    const info = await connected
    await terminateWs(ws)

    assert.ok(typeof info.id === 'string')
    assert.ok(info.id.length > 0)
    assert.ok(typeof info.connectedAt === 'number')
  } finally {
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: getConnections returns connected clients', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  try {
    const connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws = await connectWs(url)
    await connected

    const conns = sockets.getConnections()
    assert.strictEqual(conns.length, 1)
    assert.ok(typeof conns[0]?.id === 'string')

    await terminateWs(ws)
  } finally {
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: client:disconnect fires on close', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  try {
    const connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws = await connectWs(url)
    await connected

    const disconnected = new Promise<string>((resolve) => sockets.once('client:disconnect', resolve))
    await terminateWs(ws)
    const id = await disconnected

    assert.ok(typeof id === 'string')
    assert.strictEqual(sockets.getConnections().length, 0)
  } finally {
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: broadcast sends to all connected clients', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    const msg1 = new Promise<string>((resolve) => ws1.once('message', (d) => resolve(d.toString())))
    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))

    sockets.broadcast({ type: 'reload' })

    const [m1, m2] = await Promise.all([msg1, msg2])
    assert.deepStrictEqual(JSON.parse(m1), { type: 'reload' })
    assert.deepStrictEqual(JSON.parse(m2), { type: 'reload' })
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: sendToClient sends to a single connected client', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    const [target] = sockets.getConnections()
    assert.ok(target)

    const msg1 = new Promise<string>((resolve) => ws1.once('message', (d) => resolve(d.toString())))
    const ws2Received = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 300)
      ws2.once('message', () => { clearTimeout(timer); resolve(true) })
    })

    assert.strictEqual(sockets.sendToClient(target.id, { type: 'highlight' }), true)

    const [m1, ws2Got] = await Promise.all([msg1, ws2Received])
    assert.deepStrictEqual(JSON.parse(m1), { type: 'highlight' })
    assert.strictEqual(ws2Got, false)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: getConnections includes parsed browser metadata', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  try {
    const connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws = new WebSocket(url, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/124.0.1 Safari/537.36' } })
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    await connected

    const [connection] = sockets.getConnections()
    assert.deepStrictEqual(connection?.browser, { name: 'Chrome', version: '124.0.1' })

    await terminateWs(ws)
  } finally {
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: broadcast excludes sender', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    // ws2 sends a ghost message; ws1 should receive it but ws2 should not
    const msg1 = new Promise<string>((resolve) => ws1.once('message', (d) => resolve(d.toString())))
    const ws2Received = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 300)
      ws2.once('message', () => { clearTimeout(timer); resolve(true) })
    })

    const ghostMsg = { type: 'scroll', position: { raw: { x: 0, y: 100 }, proportional: 0.5 }, tagName: 'document', index: 0, mappingIndex: -1, pathname: '/' }
    ws2.send(JSON.stringify(ghostMsg))

    const [m1, ws2Got] = await Promise.all([msg1, ws2Received])
    assert.deepStrictEqual(JSON.parse(m1), ghostMsg)
    assert.strictEqual(ws2Got, false, 'sender should not receive its own broadcast')
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: relay does not forward to clients on a different pathname', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    // ws1 sends on /page-a; ws2 is still on the default '/' pathname
    // relay should only forward to clients on /page-a — ws2 won't match
    const ws2Received = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 300)
      ws2.once('message', () => { clearTimeout(timer); resolve(true) })
    })
    ws1.send(JSON.stringify({ type: 'scroll', position: { raw: { x: 0, y: 0 }, proportional: 0 }, tagName: 'document', index: 0, mappingIndex: -1, pathname: '/page-a' }))

    const ws2Got = await ws2Received
    assert.strictEqual(ws2Got, false, 'clients on different pathnames should not receive ghost messages')
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: scroll:element relay stays scoped to matching pathname', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    ws2.send(JSON.stringify({ type: 'client-info', pathname: '/page-a' }))

    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))
    const scrollElementMsg = {
      type: 'scroll:element',
      position: { raw: { x: 0, y: 50 }, proportional: 0.25 },
      tagName: 'DIV',
      index: 0,
      mappingIndex: -1,
      pathname: '/page-a',
    }
    ws1.send(JSON.stringify(scrollElementMsg))

    const m2 = await msg2
    assert.deepStrictEqual(JSON.parse(m2), scrollElementMsg)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: browser:location broadcasts regardless of current pathname', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    ws2.send(JSON.stringify({ type: 'client-info', pathname: '/other' }))

    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))
    const locationMsg = { type: 'browser:location', path: '/page-a' }
    ws1.send(JSON.stringify(locationMsg))

    const m2 = await msg2
    assert.deepStrictEqual(JSON.parse(m2), locationMsg)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: form:submit relay stays scoped to matching pathname', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    ws2.send(JSON.stringify({ type: 'client-info', pathname: '/form-page' }))

    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))
    const formMsg = { type: 'form:submit', tagName: 'FORM', index: 0, action: 'submit', pathname: '/form-page' }
    ws1.send(JSON.stringify(formMsg))

    const m2 = await msg2
    assert.deepStrictEqual(JSON.parse(m2), formMsg)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: form:reset relay stays scoped to matching pathname', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    ws2.send(JSON.stringify({ type: 'client-info', pathname: '/form-page' }))

    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))
    const formMsg = { type: 'form:reset', tagName: 'FORM', index: 0, action: 'reset', pathname: '/form-page' }
    ws1.send(JSON.stringify(formMsg))

    const m2 = await msg2
    assert.deepStrictEqual(JSON.parse(m2), formMsg)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: client-info initializes pathname before first ghost event', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  const { url, httpClose } = await startHttpServer(sockets)

  const clients: WebSocket[] = []
  try {
    const c1Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws1 = await connectWs(url)
    clients.push(ws1)
    await c1Connected

    const c2Connected = new Promise<void>((resolve) => sockets.once('client:connect', resolve))
    const ws2 = await connectWs(url)
    clients.push(ws2)
    await c2Connected

    ws2.send(JSON.stringify({ type: 'client-info', pathname: '/page-a' }))

    const msg2 = new Promise<string>((resolve) => ws2.once('message', (d) => resolve(d.toString())))
    const ghostMsg = { type: 'scroll', position: { raw: { x: 0, y: 50 }, proportional: 0.25 }, tagName: 'document', index: 0, mappingIndex: -1, pathname: '/page-a' }
    ws1.send(JSON.stringify(ghostMsg))

    const m2 = await msg2
    assert.deepStrictEqual(JSON.parse(m2), ghostMsg)
  } finally {
    await Promise.all(clients.map(terminateWs))
    httpClose()
    await sockets.close()
  }
})

test('BsSockets: close resolves cleanly with no clients', async () => {
  const sockets = new BsSockets({ logger: makeLogger() })
  await assert.doesNotReject(() => sockets.close())
})
