import { Readable } from 'node:stream'
import type { FastifyInstance } from 'fastify'

async function readStream (stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export function registerInjector (fastify: FastifyInstance, snippet: string): void {
  fastify.addHook('onSend', async (_request, reply, payload) => {
    const ct = reply.getHeader('content-type') as string | undefined
    if (!ct?.includes('text/html')) return payload

    let html: string
    if (typeof payload === 'string') {
      html = payload
    } else if (Buffer.isBuffer(payload)) {
      html = payload.toString('utf-8')
    } else if (payload instanceof Readable) {
      html = await readStream(payload)
    } else {
      return payload
    }

    const injected = html.includes('</body>')
      ? html.replace('</body>', `${snippet}</body>`)
      : html + snippet

    // Update content-length to match modified payload
    reply.header('content-length', Buffer.byteLength(injected, 'utf-8'))

    return injected
  })
}
