import { expect, test } from './support.ts'

// Theme selection must work before (and without) the UI client running.
test.use({ javaScriptEnabled: false })

const themes = [
  { scheme: 'light', background: 'rgb(248, 250, 252)', card: 'rgb(255, 255, 255)', text: 'rgb(15, 23, 42)' },
  { scheme: 'dark', background: 'rgb(15, 17, 23)', card: 'rgb(26, 29, 39)', text: 'rgb(226, 232, 240)' },
] as const

for (const theme of themes) {
  test(`all built-in UI pages follow the ${theme.scheme} system preference without JavaScript`, async ({ page, startServer }) => {
    const bs = await startServer({ ui: true })
    await page.emulateMedia({ colorScheme: theme.scheme })
    for (const path of ['/', '/sync-options', '/history', '/connections', '/remote-debug', '/plugins', '/network-throttle', '/help']) {
      await page.goto(`${bs.uiUrl}${path}`)
      await expect(page.locator('html')).toHaveCSS('color-scheme', theme.scheme)
      await expect(page.locator('body')).toHaveCSS('background-color', theme.background)
      await expect(page.locator('body')).toHaveCSS('color', theme.text)
      await expect(page.locator('.nav')).toHaveCSS('background-color', theme.card)
      await expect(page.locator('.card').first()).toHaveCSS('background-color', theme.card)
    }
  })
}

test('system preference changes update the open page and form controls without reloading', async ({ page, startServer }) => {
  const bs = await startServer({ ui: true })
  const response = await page.request.post(`${bs.uiUrl}/actions/remote-debug/overlay-grid`, {
    form: { active: 'true', returnTo: '/remote-debug' },
  })
  expect(response.ok()).toBe(true)
  await page.goto(`${bs.uiUrl}/remote-debug`)
  const navigations: string[] = []
  page.on('framenavigated', frame => navigations.push(frame.url()))

  for (const theme of [...themes, themes[0]]) {
    await page.emulateMedia({ colorScheme: theme.scheme })
    await expect(page.locator('body')).toHaveCSS('background-color', theme.background)
    await expect(page.locator('.nav__link--active')).toHaveCSS('color', theme.text)
    await expect(page.locator('.field input').first()).toHaveCSS('background-color', theme.background)
    await expect(page.locator('.field input').first()).toHaveCSS('color', theme.text)
    await expect(page.locator('input[type="color"]').first()).toHaveCSS('color-scheme', theme.scheme)
    // The thumb stays light against both the blue and grey tracks, rather than following text.
    await expect(page.locator('.toggle__thumb').first()).toHaveCSS('background-color', 'rgb(226, 232, 240)')
  }
  expect(navigations).toEqual([])
})
