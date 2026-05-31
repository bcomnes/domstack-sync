import { expect, gotoAndWaitForClient, test, waitForNoClientUpdate } from './support.ts'

test('syncs document scroll once without echoing the remote scroll back', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const sourceInfoPromise = gotoAndWaitForClient(page, bs, '/scroll.html#source')
  const target = await context.newPage()
  const targetInfoPromise = gotoAndWaitForClient(target, bs, '/scroll.html#target')
  const [, targetInfo] = await Promise.all([sourceInfoPromise, targetInfoPromise])

  const noTargetEcho = waitForNoClientUpdate(bs, info => info.id === targetInfo.id, 700)
    .then(() => null, error => error as Error)

  await page.evaluate(() => window.scrollTo(0, 640))

  await expect.poll(() => target.evaluate(() => window.scrollY)).toBeGreaterThan(500)
  expect(await noTargetEcho).toBeNull()
})

test('syncs mapped element scroll targets', async ({ context, page, startServer }) => {
  const bs = await startServer({
    scrollElementMapping: ['#source-pane', '#target-pane'],
  })
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/scroll.html#source'),
    gotoAndWaitForClient(await context.newPage(), bs, '/scroll.html#target'),
  ])
  const pages = context.pages()
  const target = pages[pages.length - 1]!

  await page.locator('#source-pane').evaluate((element) => {
    element.scrollTo(0, 320)
  })

  await expect.poll(() => target.locator('#target-pane').evaluate(element => element.scrollTop)).toBeGreaterThan(250)
  await expect.poll(() => target.locator('#source-pane').evaluate(element => element.scrollTop)).toBe(0)
})

test('mirrors clicks by legacy tagName plus index targeting', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/clicks.html#source'),
    gotoAndWaitForClient(target, bs, '/clicks.html#target'),
  ])

  await page.locator('#second-button').click()

  await expect.poll(() => target.evaluate(() => document.body.dataset['clicked'] ?? '')).toBe('second')
  await expect(target.locator('body')).not.toHaveAttribute('data-clicked', 'first')
})

test('ignores path-scoped ghost events after SPA history navigation changes pathname', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/clicks.html#source'),
    gotoAndWaitForClient(target, bs, '/clicks.html#target'),
  ])

  await target.evaluate(() => history.pushState({}, '', '/spa-target.html'))
  await expect(target).toHaveURL(/\/spa-target\.html/)

  await page.locator('#second-button').click()
  await page.waitForTimeout(500)

  expect(await target.evaluate(() => document.body.dataset['clicked'] ?? '')).toBe('')
})

test('mirrors link clicks as browser navigation', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/clicks.html#source'),
    gotoAndWaitForClient(target, bs, '/clicks.html#target'),
  ])

  await page.locator('#nav-link').click()

  await expect(target).toHaveURL(/\/target\.html$/)
})

test('mirrors clicks when page code stops propagation', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/clicks.html#source'),
    gotoAndWaitForClient(target, bs, '/clicks.html#target'),
  ])

  await page.locator('#second-button').evaluate((button) => {
    button.addEventListener('click', event => event.stopPropagation())
  })

  await page.locator('#second-button').click()

  await expect.poll(() => target.evaluate(() => document.body.dataset['clicked'] ?? '')).toBe('second')
})

test('mirrors text, toggle, select, reset, and submit form behavior', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/forms.html#source'),
    gotoAndWaitForClient(target, bs, '/forms.html#target'),
  ])

  await page.locator('#text-input').fill('')
  await page.locator('#text-input').pressSequentially('mirrored')
  await expect(target.locator('#text-input')).toHaveValue('mirrored')

  await page.locator('#checkbox-input').check()
  await expect(target.locator('#checkbox-input')).toBeChecked()

  await page.locator('#radio-two').check()
  await expect(target.locator('#radio-two')).toBeChecked()

  await page.locator('#select-input').selectOption('two')
  await expect(target.locator('#select-input')).toHaveValue('two')

  await page.locator('#reset-button').click()
  await expect(target.locator('#text-input')).toHaveValue('initial')
  await expect(target.locator('#checkbox-input')).not.toBeChecked()

  await Promise.all([
    target.waitForURL(/\/submitted\.html/),
    page.locator('#submit-button').click(),
  ])
})
