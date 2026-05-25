import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'

function tryBind (port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(null))
    server.listen(port, () => {
      const addr = server.address() as AddressInfo
      server.close(() => resolve(addr.port))
    })
  })
}

export async function findFreePort (start: number): Promise<number> {
  const preferred = await tryBind(start)
  if (preferred !== null) return preferred
  // Let the OS assign a guaranteed-free ephemeral port
  return (await tryBind(0))!
}
