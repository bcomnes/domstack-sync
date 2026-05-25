import test from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { registerInjector } from './injector.ts'
import { buildSnippet } from './snippet.ts'

const snippet = buildSnippet({ port: 3000 })

async function makeServer () {
  const fastify = Fastify({ logger: false })
  registerInjector(fastify, snippet)
  return fastify
}

test('injector: injects into string HTML payload', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html; charset=utf-8')
    return '<html><body><h1>hi</h1></body></html>'
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(res.body.includes('__bs_script__'), 'script not injected')
  assert.ok(res.body.includes('</body>'), '</body> should still be present')
})

test('injector: injects into Buffer HTML payload', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return Buffer.from('<html><body><p>buf</p></body></html>')
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(res.body.includes('__bs_script__'), 'script not injected into Buffer payload')
})

test('injector: passes through non-HTML content-type unchanged', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'application/json')
    return '{"ok":true}'
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.strictEqual(res.body, '{"ok":true}')
  assert.ok(!res.body.includes('__bs_script__'))
})

test('injector: passes through null payload unchanged', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    await reply.send(null)
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(!res.body.includes('__bs_script__'))
})

test('injector: appends snippet when no </body> tag', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return 'fragment without body tag'
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(res.body.includes('__bs_script__'))
  assert.ok(res.body.startsWith('fragment without body tag'))
})

test('injector: content-length matches actual body size', async (t) => {
  const fastify = await makeServer()
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><body></body></html>'
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  const cl = Number(res.headers['content-length'])
  assert.strictEqual(cl, Buffer.byteLength(res.body, 'utf-8'))
})
