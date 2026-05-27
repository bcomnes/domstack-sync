import { expect, test as base, type Page } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, parseOptions, type BsInstance } from '../index.ts'
import type { BsClientInfo } from '../lib/sockets.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const fixtureDir = resolve(__dirname, 'fixtures/basic')

type BsOptionsInput = Exclude<Parameters<typeof parseOptions>[0], undefined>

interface BrowserFixtures {
  startServer: (overrides?: BsOptionsInput) => Promise<BsInstance>
}

export const test = base.extend<BrowserFixtures>({
  startServer: async ({ browserName: _browserName, context }, use) => {
    const servers: BsInstance[] = []

    await use(async (overrides = {}) => {
      const bs = await createServer(parseOptions({
        port: 0,
        ui: false,
        server: fixtureDir,
        files: [],
        logLevel: 'silent',
        ...overrides,
      }))
      servers.push(bs)
      return bs
    })

    for (const page of context.pages()) {
      if (!page.isClosed()) await page.close().catch(() => {})
    }

    for (const bs of servers.reverse()) {
      await bs.exit()
    }
  },
})

export { expect }

export async function gotoAndWaitForClient (page: Page, bs: BsInstance, path: string): Promise<BsClientInfo> {
  const url = new URL(path, bs.url).href
  const update = waitForClientUpdate(bs, info => info.href === url)
  await page.goto(url)
  return update
}

export function waitForClientUpdate (
  bs: BsInstance,
  predicate: (info: BsClientInfo) => boolean,
  timeoutMs = 5_000
): Promise<BsClientInfo> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out waiting for client update'))
    }, timeoutMs)

    const onUpdate = (info: BsClientInfo): void => {
      if (!predicate(info)) return
      cleanup()
      resolve(info)
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      bs.events.off('client:update', onUpdate)
    }

    bs.events.on('client:update', onUpdate)
  })
}

export function waitForNoClientUpdate (
  bs: BsInstance,
  predicate: (info: BsClientInfo) => boolean,
  timeoutMs = 500
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)

    const onUpdate = (info: BsClientInfo): void => {
      if (!predicate(info)) return
      cleanup()
      reject(new Error('Unexpected client update'))
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      bs.events.off('client:update', onUpdate)
    }

    bs.events.on('client:update', onUpdate)
  })
}
