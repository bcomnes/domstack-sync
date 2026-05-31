import { expect, test } from './support.ts'
import { createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildSnippet } from '../lib/snippet.ts'

test('injects and connects the browser client on a static HTML page', async ({ page, startServer }) => {
  const bs = await startServer()
  const clientConnected = new Promise<void>((resolve) => {
    bs.events.once('client:connect', () => resolve())
  })

  await page.goto(bs.url)

  await expect(page.getByRole('heading', { name: 'Browser smoke fixture' })).toBeVisible()
  await expect(page.locator('#__bs_script__')).toBeAttached()
  await clientConnected
})

test('snippet mode connects when pasted into a page served from another origin', async ({ page, startServer }) => {
  const bs = await startServer({ server: false })
  const external = createHttpServer((_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><title>External snippet fixture</title><h1>External snippet fixture</h1>${buildSnippet({ port: bs.port })}`)
  })

  await listen(external)
  try {
    const address = external.address() as AddressInfo
    const clientConnected = new Promise<void>((resolve) => {
      bs.events.once('client:connect', () => resolve())
    })

    await page.goto(`http://127.0.0.1:${address.port}/`)

    await expect(page.getByRole('heading', { name: 'External snippet fixture' })).toBeVisible()
    await withTimeout('external snippet client connection', clientConnected)
  } finally {
    await close(external)
  }
})

function listen (server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close (server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve())
  })
}

function withTimeout<T> (label: string, promise: Promise<T>, ms = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
