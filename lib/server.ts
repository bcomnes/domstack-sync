import Fastify from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import { EventEmitter } from 'node:events'
import { Transform } from 'node:stream'
import { readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerInjector } from './injector.ts'
import { BsSockets } from './sockets.ts'
import { buildSnippet } from './snippet.ts'
import { BsWatcher } from './watcher.ts'
import { findFreePort } from './ports.ts'
import { getLocalIp } from './ip.ts'
import { createLogger } from './logger.ts'
import { createUiServer } from './ui/server.ts'
import type { BsOptions } from './options.ts'
import type { WatchEvent } from './watcher.ts'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface BsInstance {
  url: string
  uiUrl: string | null
  localIp: string
  port: number
  uiPort: number | null
  /** Emits: 'client:connect' (BsClientInfo), 'client:disconnect' (id: string), 'file:change' (WatchEvent) */
  events: EventEmitter
  reload: (files?: string[]) => void
  notify: (message: string) => void
  stream: () => Transform
  exit: () => Promise<void>
  pause: () => void
  resume: () => void
}

export async function createServer (opts: BsOptions): Promise<BsInstance> {
  const logger = createLogger(opts.logLevel)
  const port = await findFreePort(opts.port)
  const localIp = getLocalIp()
  const events = new EventEmitter()

  const fastify = Fastify({ logger: false }).withTypeProvider<JsonSchemaToTsProvider>()

  if (opts.cors) {
    await fastify.register(fastifyCors)
  }

  const snippet = buildSnippet({ port })
  registerInjector(fastify, snippet)

  // Serve the client bundle
  fastify.get('/__bs/client.js', async (_req, reply) => {
    const clientPath = resolve(__dirname, 'client/dist/browser-sync-client.js')
    const content = readFileSync(clientPath)
    reply.header('content-type', 'application/javascript; charset=utf-8')
    return reply.send(content)
  })

  // HTTP reload API
  fastify.post('/__bs/reload', async (_req, reply) => {
    sockets.broadcast({ type: 'reload' })
    return reply.send({ ok: true })
  })

  // Static file serving
  if (opts.server !== false) {
    const root = resolve(opts.cwd, opts.server || '.')
    await fastify.register(fastifyStatic, {
      root,
      prefix: '/',
      index: ['index.html', 'index.htm'],
    })
  }

  // WebSocket support
  const sockets = new BsSockets({ logger })

  // Forward socket events onto the public EventEmitter
  sockets.on('client:connect', (info) => events.emit('client:connect', info))
  sockets.on('client:disconnect', (id) => events.emit('client:disconnect', id))

  fastify.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if ((req.url ?? '').startsWith('/__bs')) {
      sockets.handleUpgrade(req, socket, head)
    }
  })

  // File watcher
  let watcher: BsWatcher | null = null
  let paused = false

  if (opts.files.length > 0) {
    watcher = new BsWatcher({
      files: opts.files,
      cwd: opts.cwd,
      debounceMs: opts.reloadDebounce,
      watchOptions: opts.watchOptions,
    })

    watcher.on('change', (evt: WatchEvent) => {
      if (paused) return
      events.emit('file:change', evt)
      const isCss = extname(evt.path).toLowerCase() === '.css'
      if (isCss && opts.injectChanges) {
        sockets.broadcast({ type: 'css-reload', path: evt.path })
      } else {
        sockets.broadcast({ type: 'reload' })
      }
    })
  }

  await fastify.listen({ port, host: '0.0.0.0' })

  const url = `http://localhost:${port}`
  logger.info(`Server started at ${url}`)
  logger.info(`Network: http://${localIp}:${port}`)

  // UI panel
  let uiInstance: Awaited<ReturnType<typeof createUiServer>> | null = null

  if (opts.ui !== false) {
    const uiPort = typeof opts.ui === 'object'
      ? opts.ui.port
      : await findFreePort(port + 1)
    const uiUrl = `http://localhost:${uiPort}`

    uiInstance = await createUiServer({
      uiPort,
      serverUrl: url,
      uiUrl,
      localIp,
      mainPort: port,
      events,
      getConnections: () => sockets.getConnections(),
    })

    logger.info(`UI panel at ${uiUrl}`)
  }

  function doReload (files?: string[]): void {
    if (files?.length) {
      for (const f of files) {
        if (extname(f).toLowerCase() === '.css' && opts.injectChanges) {
          sockets.broadcast({ type: 'css-reload', path: f })
          return
        }
      }
    }
    sockets.broadcast({ type: 'reload' })
  }

  return {
    url,
    uiUrl: uiInstance?.uiUrl ?? null,
    localIp,
    port,
    uiPort: uiInstance?.uiPort ?? null,
    events,
    reload: doReload,
    notify (message: string) {
      sockets.broadcast({ type: 'notify', message })
    },
    stream () {
      return new Transform({
        objectMode: true,
        transform (chunk: { path: string }, _encoding, callback) {
          const p = chunk?.path ?? ''
          if (extname(p).toLowerCase() === '.css' && opts.injectChanges) {
            sockets.broadcast({ type: 'css-reload', path: p })
          } else {
            sockets.broadcast({ type: 'reload' })
          }
          callback(null, chunk)
        },
      })
    },
    async exit () {
      await watcher?.close()
      await uiInstance?.exit()
      await sockets.close()
      await fastify.close()
    },
    pause () { paused = true },
    resume () { paused = false },
  }
}
