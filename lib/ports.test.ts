import test from 'node:test'
import assert from 'node:assert'
import { createServer } from 'node:net'
import { findFreePort } from './ports.ts'

test('findFreePort returns preferred port when available', async () => {
  const port = await findFreePort(19000)
  assert.strictEqual(port, 19000)
})

test('findFreePort falls back to OS-assigned port when preferred is taken', async () => {
  // Hold port 19001 open so findFreePort must fall back
  const holder = createServer()
  await new Promise<void>(resolve => holder.listen(19001, resolve))

  try {
    const port = await findFreePort(19001)
    assert.ok(typeof port === 'number')
    assert.ok(port > 0)
    assert.notStrictEqual(port, 19001)
  } finally {
    await new Promise<void>(resolve => holder.close(() => resolve()))
  }
})

test('findFreePort returns a usable port (can bind again)', async () => {
  const port = await findFreePort(19002)
  // The server in findFreePort is already closed, so we should be able to bind
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, resolve)
  })
  await new Promise<void>(resolve => server.close(() => resolve()))
})
