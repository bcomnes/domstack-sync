import type { FastifyListenOptions } from 'fastify'
import type { Server } from 'node:net'

export function getBoundPort (server: Server): number {
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a bound TCP listener')
  return address.port
}

export async function listenOnPort (
  fastify: { ready: () => PromiseLike<unknown>; listen: (opts: FastifyListenOptions) => Promise<string>; server: Server },
  port: number,
  fallback: boolean
): Promise<number> {
  // Startup errors from ready hooks are not bind failures.
  await fastify.ready()
  const host = '0.0.0.0'
  try {
    await fastify.listen({ port, host })
  } catch (error) {
    if (!fallback || port === 0 || (error as NodeJS.ErrnoException | null)?.code !== 'EADDRINUSE') throw error
    await fastify.listen({ port: 0, host })
  }
  return getBoundPort(fastify.server)
}
