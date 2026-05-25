import { EventEmitter } from 'node:events'
import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ServerToClientMessage, GhostMessage } from './protocol.ts'
import type { Logger } from './logger.ts'

export interface BsClientInfo {
  id: string
  ua: string
  connectedAt: number
}

export interface SocketsOptions {
  logger: Logger
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
      const info: BsClientInfo = { id, ua, connectedAt: Date.now() }
      this.clientMap.set(ws, info)
      this.emit('client:connect', info)

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as GhostMessage
          // Relay ghost-mode events to all other connected clients
          this.broadcast(msg, ws)
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

  handleUpgrade (req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req)
    })
  }

  broadcast (msg: ServerToClientMessage, exclude?: WebSocket): void {
    const data = JSON.stringify(msg)
    for (const client of this.wss.clients) {
      if (client !== exclude && client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  getConnections (): BsClientInfo[] {
    return Array.from(this.clientMap.values())
  }

  close (): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
