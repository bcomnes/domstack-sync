import { expect, test } from './support.ts'

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
