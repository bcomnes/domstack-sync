import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { WebSocketServer, WebSocket } from 'ws'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BsClientInfo } from '../sockets.ts'
import type { UiState, UiServerMessage, FileChange } from './types.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const MAX_HISTORY = 50

export interface UiServerOptions {
  uiPort: number
  serverUrl: string
  uiUrl: string
  localIp: string
  mainPort: number
  events: EventEmitter
  getConnections: () => BsClientInfo[]
}

export interface UiInstance {
  uiUrl: string
  uiPort: number
  exit: () => Promise<void>
}

const PAGES: Record<string, string> = {
  '/': 'Overview',
  '/sync-options': 'Sync Options',
  '/history': 'History',
  '/connections': 'Connections',
  '/network-throttle': 'Network Throttle',
  '/help': 'Help',
}

function htmlShell (title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} – domstack-sync</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <div id="app"></div>
  <script src="/app.js"></script>
</body>
</html>`
}

export async function createUiServer (opts: UiServerOptions): Promise<UiInstance> {
  const fastify = Fastify({ logger: false })
  const publicDir = resolve(__dirname, 'public')

  await fastify.register(fastifyStatic, { root: publicDir, prefix: '/' })

  // Register a real route for each UI page
  for (const [path, title] of Object.entries(PAGES)) {
    fastify.get(path, async (_req, reply) => {
      reply.header('content-type', 'text/html; charset=utf-8')
      return reply.send(htmlShell(title))
    })
  }

  // In-memory state
  let connections: BsClientInfo[] = opts.getConnections()
  const history: FileChange[] = []

  function buildState (): UiState {
    return {
      serverUrl: opts.serverUrl,
      uiUrl: opts.uiUrl,
      localIp: opts.localIp,
      port: opts.mainPort,
      uiPort: opts.uiPort,
      connections: [...connections],
      history: [...history],
    }
  }

  // WebSocket server for UI clients
  const wss = new WebSocketServer({ noServer: true })

  function broadcastUpdate (data: Partial<UiState>): void {
    const msg = JSON.stringify({ type: 'update', data } satisfies UiServerMessage)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  wss.on('connection', (ws) => {
    const init: UiServerMessage = { type: 'init', data: buildState() }
    ws.send(JSON.stringify(init))
  })

  // Listen to main BS server events
  opts.events.on('client:connect', (info: BsClientInfo) => {
    connections = [...connections, info]
    broadcastUpdate({ connections })
  })

  opts.events.on('client:disconnect', (id: string) => {
    connections = connections.filter(c => c.id !== id)
    broadcastUpdate({ connections })
  })

  opts.events.on('file:change', (change: FileChange) => {
    history.unshift(change)
    if (history.length > MAX_HISTORY) history.splice(MAX_HISTORY)
    broadcastUpdate({ history: [...history] })
  })

  fastify.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    }
  })

  await fastify.listen({ port: opts.uiPort, host: '0.0.0.0' })

  return {
    uiUrl: opts.uiUrl,
    uiPort: opts.uiPort,
    async exit () {
      await new Promise<void>((resolve, reject) => wss.close(err => err ? reject(err) : resolve()))
      await fastify.close()
    },
  }
}
