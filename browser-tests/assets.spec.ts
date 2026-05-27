import { type Page } from '@playwright/test'
import { expect, gotoAndWaitForClient, test } from './support.ts'

test('injects direct stylesheet reloads from the public API and HTTP route', async ({ page, startServer }) => {
  const bs = await startServer()
  await gotoAndWaitForClient(page, bs, '/styles.html')

  await expect(page.locator('link[rel="stylesheet"]')).not.toHaveAttribute('href', /browsersync=/)

  bs.reload(['styles.css'])
  await expect.poll(() => hasCacheBustStylesheet(page)).toBe(true)

  await gotoAndWaitForClient(page, bs, '/styles.html')
  await expect(page.locator('link[rel="stylesheet"]')).not.toHaveAttribute('href', /browsersync=/)

  const res = await page.evaluate(async () => {
    const response = await fetch('/__bs/reload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: ['styles.css'] }),
    })
    return response.ok
  })
  expect(res).toBe(true)
  await expect.poll(() => hasCacheBustStylesheet(page)).toBe(true)
})

test('reloads imported stylesheets without a full page reload', async ({ page, startServer }) => {
  const bs = await startServer()
  await gotoAndWaitForClient(page, bs, '/import.html')

  await expect.poll(() => importedRuleHref(page)).not.toContain('browsersync=')

  bs.reload(['imported.css'])

  await expect.poll(() => importedRuleHref(page)).toContain('browsersync=')
})

test('cache-busts matching image src and inline style image URLs', async ({ page, startServer }) => {
  const bs = await startServer()
  await gotoAndWaitForClient(page, bs, '/images.html')

  bs.reload(['image.svg'])
  await expect.poll(() => page.locator('#asset-image').getAttribute('src')).toContain('browsersync=')
  await expect(page.locator('#inline-image')).not.toHaveAttribute('style', /browsersync=/)

  bs.reload(['background.svg'])
  await expect.poll(() => page.locator('#inline-image').getAttribute('style')).toContain('browsersync=')
})

test('shows the browser notification overlay', async ({ page, startServer }) => {
  const bs = await startServer()
  await gotoAndWaitForClient(page, bs, '/')

  bs.notify('Browser updated')

  await expect(page.locator('#__bs-notify__')).toHaveText('Browser updated')
})

async function hasCacheBustStylesheet (page: Page): Promise<boolean> {
  const hrefs = await stylesheetHrefs(page)
  return hrefs.some(href => href.includes('browsersync='))
}

async function stylesheetHrefs (page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map(link => link.href)
  })
}

async function importedRuleHref (page: Page): Promise<string> {
  return page.evaluate(() => {
    const sheet = document.styleSheets[0]
    const rule = sheet?.cssRules[0] as CSSImportRule | undefined
    return rule?.href ?? ''
  })
}
