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

    ws2.send(JSON.stringify({ type: 'scroll', x: 0, y: 100 }))

    const [m1, ws2Got] = await Promise.all([msg1, ws2Received])
    assert.deepStrictEqual(JSON.parse(m1), { type: 'scroll', x: 0, y: 100 })
    assert.strictEqual(ws2Got, false, 'sender should not receive its own broadcast')
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
