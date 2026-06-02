import test from 'node:test'
import assert from 'node:assert'
import { createLogger } from './logger.ts'

class MemoryStream {
  chunks: string[] = []

  write (chunk: string | Uint8Array): boolean {
    this.chunks.push(String(chunk))
    return true
  }

  toString (): string {
    return this.chunks.join('')
  }
}

test('createLogger: prints BrowserSync-style prefixed messages and access URLs', () => {
  const stdout = new MemoryStream()
  const logger = createLogger('info', { stdout, stderr: stdout })

  logger.info('Serving files from: %s', 'public')
  logger.urls({
    local: 'http://localhost:3000',
    external: 'http://192.168.1.2:3000',
    ui: 'http://127.0.0.1:3001',
    uiExternal: 'http://192.168.1.2:3001',
  })

  const output = stdout.toString()
  assert.match(output, /\[domstack-sync\] Serving files from: public/)
  assert.match(output, /\[domstack-sync\] Access URLs:/)
  assert.match(output, /Local: http:\/\/localhost:3000/)
  assert.match(output, /External: http:\/\/192\.168\.1\.2:3000/)
  assert.match(output, /UI: http:\/\/127\.0\.0\.1:3001/)
  assert.match(output, /UI External: http:\/\/192\.168\.1\.2:3001/)
})

test('createLogger: respects silent and debug log levels', () => {
  const silentStdout = new MemoryStream()
  const silent = createLogger('silent', { stdout: silentStdout, stderr: silentStdout })

  silent.info('hidden')
  silent.warn('hidden')
  silent.urls({ local: 'http://localhost:3000' })

  assert.strictEqual(silentStdout.toString(), '')

  const infoStdout = new MemoryStream()
  const info = createLogger('info', { stdout: infoStdout, stderr: infoStdout })

  info.debug('debug hidden')
  info.info('info shown')

  assert.ok(!infoStdout.toString().includes('debug hidden'))
  assert.ok(infoStdout.toString().includes('info shown'))

  const debugStdout = new MemoryStream()
  const debug = createLogger('debug', { stdout: debugStdout, stderr: debugStdout })

  debug.debug('debug shown')

  assert.ok(debugStdout.toString().includes('debug shown'))
})

test('createLogger: exposes a pino instance with the same formatter', () => {
  const stdout = new MemoryStream()
  const logger = createLogger('debug', { stdout, stderr: stdout })

  logger.pino.info('pino event')
  logger.pino.child({ component: 'fastify' }).info({
    req: { method: 'GET', url: '/index.html' },
  }, 'incoming request')
  logger.pino.child({ component: 'fastify' }).info({
    req: { method: 'GET', url: '/index.html' },
    res: { statusCode: 200 },
    responseTime: 12.3,
  }, 'request completed')

  const output = stdout.toString()
  assert.match(output, /\[domstack-sync\] pino event/)
  assert.match(output, /\[domstack-sync\] HTTP request: GET \/index\.html/)
  assert.match(output, /\[domstack-sync\] HTTP response: GET \/index\.html -> 200 \(12ms\)/)
})
