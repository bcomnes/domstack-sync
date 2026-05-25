import { expect, gotoAndWaitForClient, test } from './support.ts'
import type { BrowserSyncPluginModule } from '../lib/plugin-types.ts'

test('renders all built-in UI pages in Chromium', async ({ page, startServer }) => {
  const bs = await startServer({ ui: true })
  const pages = [
    ['/', 'Overview'],
    ['/sync-options', 'Sync Options'],
    ['/history', 'History'],
    ['/connections', 'Connections'],
    ['/remote-debug', 'Remote Debug'],
    ['/plugins', 'Plugins'],
    ['/network-throttle', 'Network Throttle'],
    ['/help', 'Help'],
  ] as const

  for (const [path, heading] of pages) {
    await page.goto(`${bs.uiUrl}${path}`)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }

  await expect(page.getByText('Programmatic API')).toBeVisible()
})

test('sync-options UI mutates live browser click syncing', async ({ context, page, startServer }) => {
  const bs = await startServer({ ui: true })
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/clicks.html#source'),
    gotoAndWaitForClient(target, bs, '/clicks.html#target'),
  ])

  const ui = await context.newPage()
  await ui.goto(`${bs.uiUrl}/sync-options`)
  const clickSync = ui.locator('.option-item').filter({ hasText: 'Click sync' })

  await clickSync.locator('label.toggle').click()
  await expect(clickSync.locator('input[name="active"]')).not.toBeChecked()

  await page.locator('#second-button').click()
  await page.waitForTimeout(500)
  await expect(target.locator('body')).not.toHaveAttribute('data-clicked', 'second')

  await clickSync.locator('label.toggle').click()
  await expect(clickSync.locator('input[name="active"]')).toBeChecked()

  await page.locator('#first-button').click()
  await expect.poll(() => target.evaluate(() => document.body.dataset['clicked'] ?? '')).toBe('first')
})

test('history UI tracks pages, syncs all browsers, removes entries, and clears history', async ({ context, page, startServer }) => {
  const bs = await startServer({ ui: true })
  await gotoAndWaitForClient(page, bs, '/clicks.html#client')
  await gotoAndWaitForClient(page, bs, '/forms.html#client')

  const ui = await context.newPage()
  await ui.goto(`${bs.uiUrl}/history`)
  await expect(ui.locator('.history-list')).toContainText('/clicks.html')
  await expect(ui.locator('.history-list')).toContainText('/forms.html')

  await ui.locator('.history-item').filter({ hasText: '/clicks.html' }).getByRole('button', { name: 'Sync all' }).click()
  await expect(page).toHaveURL(/\/clicks\.html/)

  await ui.locator('.history-item').filter({ hasText: '/forms.html' }).locator('button[title="Remove"]').click()
  await expect(ui.locator('.history-list')).not.toContainText('/forms.html')

  await ui.getByRole('button', { name: 'Clear all' }).click()
  await expect(ui.getByText('Pages opened in connected browsers will appear here.')).toBeVisible()
})

test('remote debug UI injects client CSS and overlay grid DOM nodes', async ({ context, page, startServer }) => {
  const bs = await startServer({ ui: true })
  await gotoAndWaitForClient(page, bs, '/')

  const ui = await context.newPage()
  await ui.goto(`${bs.uiUrl}/remote-debug`)

  await ui.locator('.option-item').filter({ hasText: 'CSS Outlining' }).locator('label.toggle').click()
  await expect(page.locator('#__browser-sync-pesticide__')).toBeAttached()

  await ui.locator('.option-item').filter({ hasText: 'Grid overlay' }).locator('label.toggle').click()
  await expect(page.locator('#__bs_overlay-grid-styles__')).toBeAttached()
})

test('network throttle UI creates and removes a throttle server entry', async ({ page, startServer }) => {
  const bs = await startServer({ ui: true })
  await page.goto(`${bs.uiUrl}/network-throttle`)

  await page.getByRole('button', { name: 'Create Server' }).click()
  await expect(page.locator('.throttle-server-list')).toContainText('dsl')

  await page.getByRole('button', { name: /Destroy server/ }).click()
  await expect(page.getByText('No throttle servers running.')).toBeVisible()
})

test('plugins UI renders configured plugins and plugin pages', async ({ page, startServer }) => {
  const plugin: BrowserSyncPluginModule = {
    'plugin:name': 'browser-plugin',
    title: 'Browser Plugin',
    plugin () {},
    hooks: {
      page: {
        path: '/browser-plugin',
        title: 'Browser Plugin Page',
        order: 9,
      },
    },
  }
  const bs = await startServer({ ui: true, plugins: [plugin] })

  await page.goto(`${bs.uiUrl}/plugins`)
  await expect(page.getByText('Browser Plugin', { exact: true })).toBeVisible()

  await page.goto(`${bs.uiUrl}/browser-plugin`)
  await expect(page.getByRole('heading', { name: 'Browser Plugin Page', level: 1 })).toBeVisible()
})
