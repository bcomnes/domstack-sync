import test from 'node:test'
import assert from 'node:assert/strict'
import Fastify from 'fastify'
import { listenOnPort } from './ports.ts'

test('listenOnPort: retries a real collision on an OS-assigned port', async (t) => {
  const holder = Fastify()
  const contender = Fastify()
  t.after(async () => { await Promise.all([holder.close(), contender.close()]) })
  const preferred = await listenOnPort(holder, 0, false)
  const actual = await listenOnPort(contender, preferred, true)
  assert.notEqual(actual, preferred)
  assert.equal((await fetch(`http://127.0.0.1:${actual}`)).status, 404)
})

test('listenOnPort: does not retry startup-hook errors with a collision code', async (t) => {
  const server = Fastify()
  t.after(() => server.close())
  const error = Object.assign(new Error('plugin failed'), { code: 'EADDRINUSE' })
  server.addHook('onReady', async () => { throw error })
  const listen = t.mock.method(server, 'listen')
  await assert.rejects(listenOnPort(server, 3000, true), err => err === error)
  assert.equal(listen.mock.callCount(), 0)
})
