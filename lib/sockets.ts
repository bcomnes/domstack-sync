import { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ServerToClientMessage, GhostMessage, PathScopedGhostMessage, ClientInfoMessage, ClientRuntimeOptions } from './protocol.ts'
import type { Logger } from './logger.ts'

export interface BrowserInfo {
  name: string
  version: string
}

export interface BsClientInfo {
  id: string
  ua: string
  browser: BrowserInfo
  connectedAt: number
  pathname: string
  path: string
  href: string | null
}

export interface SocketsOptions {
  logger: Logger
  getRuntimeOptions?: () => ClientRuntimeOptions
  getPluginClientEvents?: () => string[]
}

export class BsSockets extends EventEmitter {
  readonly wss: WebSocketServer
  private readonly opts: SocketsOptions
  private readonly clientMap = new Map<WebSocket, BsClientInfo>()

  constructor (opts: SocketsOptions) {
    super()
    this.opts = opts
    this.wss = new WebSocketServer({ noServer: true })

    this.wss.on('connection', (ws, req) => {
      const id = Math.random().toString(36).slice(2, 10)
      const ua = (req as IncomingMessage).headers['user-agent'] ?? 'Unknown'
      const info: BsClientInfo = { id, ua, browser: parseBrowser(ua), connectedAt: Date.now(), pathname: '/', path: '/', href: null }
      this.clientMap.set(ws, info)
      this.emit('client:connect', info)

      const runtimeOptions = this.opts.getRuntimeOptions?.()
      if (runtimeOptions && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'options', data: runtimeOptions } satisfies ServerToClientMessage))
      }

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as unknown
          this.handleClientMessage(msg, ws)
        } catch {
          this.opts.logger.warn('Invalid WS message from client')
        }
      })

      ws.on('close', () => {
        this.clientMap.delete(ws)
        this.emit('client:disconnect', id)
      })
    })
  }

  handleClientMessage (msg: unknown, sender: WebSocket): void {
    const senderInfo = this.clientMap.get(sender)
    if (!senderInfo) return
    if (!isMessageObject(msg)) return

    if (isClientInfoMessage(msg)) {
      senderInfo.pathname = msg.pathname
      senderInfo.path = msg.path ?? msg.pathname
      senderInfo.href = msg.href ?? null
      this.emit('client:update', { ...senderInfo })
      return
    }

    if (isGhostMessage(msg)) {
      this.relay(msg, sender)
      return
    }

    if (this.isPluginClientEvent(msg)) {
      this.broadcast(msg as ServerToClientMessage, sender)
    }
  }

  handleUpgrade (req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req)
    })
  }

  relay (msg: GhostMessage, sender: WebSocket): void {
    const senderInfo = this.clientMap.get(sender)
    if (!senderInfo) return
    if (msg.type === 'browser:location') {
      this.broadcast(msg, sender)
      return
    }
    this.relayPathScoped(msg, sender, senderInfo)
  }

  relayPathScoped (msg: PathScopedGhostMessage, sender: WebSocket, senderInfo: BsClientInfo): void {
    senderInfo.pathname = msg.pathname
    this.emit('client:update', { ...senderInfo })
    this.broadcast(msg, sender)
  }

  broadcast (msg: ServerToClientMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(msg)
    for (const client of this.wss.clients) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  sendToClient (id: string, msg: ServerToClientMessage): boolean {
    const data = JSON.stringify(msg)
    for (const [client, info] of this.clientMap) {
      if (info.id === id && client.readyState === WebSocket.OPEN) {
        client.send(data)
        return true
      }
    }
    return false
  }

  getConnections (): BsClientInfo[] {
    return Array.from(this.clientMap.values())
  }

  close (): Promise<void> {
    for (const client of this.wss.clients) {
      client.terminate()
    }
    this.clientMap.clear()

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  private isPluginClientEvent (msg: MessageObject): boolean {
    return this.opts.getPluginClientEvents?.().includes(msg.type) ?? false
  }
}

interface MessageObject {
  type: string
  [key: string]: unknown
}

function isMessageObject (msg: unknown): msg is MessageObject {
  return Boolean(msg && typeof msg === 'object' && typeof (msg as { type?: unknown }).type === 'string')
}

function isClientInfoMessage (msg: unknown): msg is ClientInfoMessage {
  if (!isMessageObject(msg)) return false
  return msg.type === 'client-info' &&
    typeof msg['pathname'] === 'string' &&
    (msg['path'] === undefined || typeof msg['path'] === 'string') &&
    (msg['href'] === undefined || typeof msg['href'] === 'string')
}

function isGhostMessage (msg: unknown): msg is GhostMessage {
  if (!isMessageObject(msg)) return false
  if (msg.type === 'browser:location') return true
  return isPathScopedGhostMessage(msg)
}

function isPathScopedGhostMessage (msg: unknown): msg is PathScopedGhostMessage {
  if (!isMessageObject(msg)) return false
  return typeof msg['pathname'] === 'string' && [
    'scroll',
    'scroll:element',
    'click',
    'input:text',
    'input:toggles',
    'form:submit',
    'form:reset',
    'input',
  ].includes(msg.type)
}

function parseBrowser (ua: string): BrowserInfo {
  const patterns: Array<[string, RegExp]> = [
    ['Edge', /Edg\/([\d.]+)/],
    ['Chrome', /Chrome\/([\d.]+)/],
    ['Firefox', /Firefox\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ]

  for (const [name, pattern] of patterns) {
    const match = ua.match(pattern)
    if (match?.[1]) return { name, version: match[1] }
  }

  return { name: 'Unknown', version: '' }
}
