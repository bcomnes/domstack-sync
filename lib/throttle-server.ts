import { Transform } from 'node:stream'
import { createConnection, createServer } from 'node:net'
import type { Server, Socket } from 'node:net'

export interface ThrottleTarget {
  hostname: string
  port: number
}

export interface ThrottleSpeed {
  speed: number
  latency: number
}

export interface ThrottleServerOptions {
  target: ThrottleTarget
  speed: ThrottleSpeed
  listenHost?: string
}

export interface ThrottleServerInstance {
  server: Server
  close: () => Promise<void>
}

export function createThrottleServer (opts: ThrottleServerOptions): ThrottleServerInstance {
  const sockets = new Set<Socket>()
  const server = createServer({ allowHalfOpen: true }, (local) => {
    sockets.add(local)
    local.once('close', () => sockets.delete(local))

    const remote = createConnection({
      host: opts.target.hostname,
      port: opts.target.port,
      allowHalfOpen: true,
    })

    sockets.add(remote)
    remote.once('close', () => sockets.delete(remote))

    const upstream = createRateLimitTransform(10 * 1024)
    const downstream = createRateLimitTransform(opts.speed.speed * 1024)

    setTimeout(() => {
      local.pipe(upstream).pipe(remote)
    }, opts.speed.latency)

    setTimeout(() => {
      remote.pipe(downstream).pipe(local)
    }, opts.speed.latency)

    local.on('error', () => {
      remote.destroy()
      local.destroy()
    })

    remote.on('error', () => {
      local.destroy()
      remote.destroy()
    })
  })

  return {
    server,
    close: () => new Promise((resolve, reject) => {
      for (const socket of sockets) socket.destroy()
      server.close(err => err ? reject(err) : resolve())
    }),
  }
}

function createRateLimitTransform (rate: number): Transform {
  let nextAt = Date.now()

  return new Transform({
    transform (chunk: Buffer, _encoding, callback) {
      const now = Date.now()
      const delay = Math.max(0, nextAt - now)
      nextAt = Math.max(now, nextAt) + Math.ceil((chunk.length / rate) * 1000)
      setTimeout(() => callback(null, chunk), delay)
    },
  })
}
