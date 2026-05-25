import test from 'node:test'
import assert from 'node:assert'
import { openReconnecting } from './reconnect.ts'
import type { WebSocketLike } from './reconnect.ts'

class MockSocket implements WebSocketLike {
  readyState = 0
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onmessage: ((e: { data: unknown }) => void) | null = null
  sent: string[] = []

  send (data: string) { this.sent.push(data) }
  simulateOpen () { this.readyState = 1; this.onopen?.() }
  simulateClose () { this.readyState = 3; this.onclose?.() }
  simulateMessage (data: unknown) { this.onmessage?.({ data }) }
}

function makeFactory () {
  const sockets: MockSocket[] = []
  return {
    sockets,
    factory: () => { const s = new MockSocket(); sockets.push(s); return s },
  }
}

test('reconnect: calls factory once on init', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  openReconnecting({ url: 'ws://test', factory, onmessage: () => {} })
  assert.strictEqual(sockets.length, 1)
})

test('reconnect: reconnects after close with initial delay', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  openReconnecting({ url: 'ws://test', factory, onmessage: () => {}, initialDelay: 1000 })
  sockets[0].simulateClose()
  assert.strictEqual(sockets.length, 1)
  t.mock.timers.tick(1000)
  assert.strictEqual(sockets.length, 2)
})

test('reconnect: doubles delay on repeated closes', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  openReconnecting({ url: 'ws://test', factory, onmessage: () => {}, initialDelay: 1000, maxDelay: 30000 })

  sockets[0].simulateClose()
  t.mock.timers.tick(1000)      // reconnect after 1000ms (next delay = 2000)
  sockets[1].simulateClose()
  t.mock.timers.tick(1999)      // not enough
  assert.strictEqual(sockets.length, 2)
  t.mock.timers.tick(1)         // now at 2000ms
  assert.strictEqual(sockets.length, 3)
})

test('reconnect: resets delay to initial on successful open', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  openReconnecting({ url: 'ws://test', factory, onmessage: () => {}, initialDelay: 1000 })

  sockets[0].simulateClose()
  t.mock.timers.tick(1000)      // reconnect (delay was 1000, next = 2000)
  sockets[1].simulateOpen()     // reset delay back to 1000
  sockets[1].simulateClose()
  t.mock.timers.tick(1000)      // should reconnect after 1000, not 2000
  assert.strictEqual(sockets.length, 3)
})

test('reconnect: caps delay at maxDelay', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const delays: number[] = []
  openReconnecting({
    url: 'ws://test',
    factory,
    onclose: (d) => delays.push(d),
    onmessage: () => {},
    initialDelay: 1000,
    maxDelay: 3000,
  })

  sockets[0].simulateClose(); t.mock.timers.tick(1000)  // delay=1000, next=2000
  sockets[1].simulateClose(); t.mock.timers.tick(2000)  // delay=2000, next=3000
  sockets[2].simulateClose(); t.mock.timers.tick(3000)  // delay=3000 (capped)
  sockets[3].simulateClose(); t.mock.timers.tick(3000)  // still 3000

  assert.deepStrictEqual(delays, [1000, 2000, 3000, 3000])
})

test('reconnect: calls onopen callback on connect', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  let opens = 0
  openReconnecting({ url: 'ws://test', factory, onopen: () => opens++, onmessage: () => {} })
  sockets[0].simulateOpen()
  assert.strictEqual(opens, 1)
})

test('reconnect: calls onclose callback with retry delay', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const delays: number[] = []
  openReconnecting({
    url: 'ws://test',
    factory,
    onclose: (d) => delays.push(d),
    onmessage: () => {},
    initialDelay: 500,
  })
  sockets[0].simulateClose()
  assert.deepStrictEqual(delays, [500])
})

test('reconnect: forwards messages to onmessage handler', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const received: unknown[] = []
  openReconnecting({ url: 'ws://test', factory, onmessage: (e) => received.push(e.data) })
  sockets[0].simulateMessage('hello')
  assert.deepStrictEqual(received, ['hello'])
})

test('reconnect: send() transmits data when socket is open', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const conn = openReconnecting({ url: 'ws://test', factory, onmessage: () => {} })
  sockets[0].simulateOpen()
  conn.send('{"type":"scroll"}')
  assert.deepStrictEqual(sockets[0].sent, ['{"type":"scroll"}'])
})

test('reconnect: send() is a no-op when socket is not open', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const conn = openReconnecting({ url: 'ws://test', factory, onmessage: () => {} })
  // readyState is 0 (CONNECTING)
  conn.send('{"type":"scroll"}')
  assert.deepStrictEqual(sockets[0].sent, [])
})

test('reconnect: send() uses the new socket after reconnect', (t) => {
  t.mock.timers.enable(['setTimeout'])
  const { sockets, factory } = makeFactory()
  const conn = openReconnecting({ url: 'ws://test', factory, onmessage: () => {}, initialDelay: 100 })
  sockets[0].simulateOpen()
  sockets[0].simulateClose()
  t.mock.timers.tick(100)
  sockets[1].simulateOpen()
  conn.send('data')
  assert.deepStrictEqual(sockets[0].sent, [], 'old socket should not receive data')
  assert.deepStrictEqual(sockets[1].sent, ['data'], 'new socket should receive data')
})
