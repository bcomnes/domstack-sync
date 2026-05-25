import test from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { registerInjector } from './injector.ts'
import { buildSnippet } from './snippet.ts'

const snippet = buildSnippet({ port: 3000 })

type InjectorOptions = Parameters<typeof registerInjector>[2]

async function makeServer (options?: InjectorOptions) {
  const fastify = Fastify({ logger: false })
  registerInjector(fastify, snippet, options)
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

test('injector: can be disabled with snippet false parity', async (t) => {
  const fastify = await makeServer({ enabled: false })
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><body><h1>no snippet</h1></body></html>'
  })
  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(!res.body.includes('__bs_script__'))
  assert.ok(res.body.includes('no snippet'))
})

test('injector: respects whitelist and blacklist paths', async (t) => {
  const fastify = await makeServer({
    whitelist: ['/allowed'],
    blacklist: ['/allowed/blocked'],
  })
  t.after(() => fastify.close())
  fastify.get('/allowed', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><body><h1>allowed</h1></body></html>'
  })
  fastify.get('/allowed/blocked', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><body><h1>blocked</h1></body></html>'
  })
  fastify.get('/outside', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><body><h1>outside</h1></body></html>'
  })

  const allowed = await fastify.inject({ method: 'GET', url: '/allowed' })
  assert.ok(allowed.body.includes('__bs_script__'))

  const blocked = await fastify.inject({ method: 'GET', url: '/allowed/blocked' })
  assert.ok(!blocked.body.includes('__bs_script__'))

  const outside = await fastify.inject({ method: 'GET', url: '/outside' })
  assert.ok(!outside.body.includes('__bs_script__'))
})

test('injector: supports custom snippet rule and rewrite rules', async (t) => {
  const fastify = await makeServer({
    rule: {
      match: /<head>/i,
      fn: (snippet, match) => `${match}${snippet}`,
    },
    rewriteRules: [
      {
        match: /Legacy title/g,
        fn: () => 'Modern title',
      },
    ],
  })
  t.after(() => fastify.close())
  fastify.get('/', async (_req, reply) => {
    reply.header('content-type', 'text/html')
    return '<html><head><title>Legacy title</title></head><body><h1>custom</h1></body></html>'
  })

  const res = await fastify.inject({ method: 'GET', url: '/' })
  assert.ok(res.body.includes('<title>Modern title</title>'))
  assert.ok(res.body.indexOf('__bs_script__') < res.body.indexOf('</head>'))
})
