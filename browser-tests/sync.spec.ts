import { expect, gotoAndWaitForClient, test, waitForNoClientUpdate } from './support.ts'

for (const mode of ['document', 'element', 'mapped element'] as const) {
  test(`applies synced ${mode} positions instantly without disabling local smooth scrolling`, async ({ context, page, startServer }) => {
    const sourceSelector = mode === 'document' ? null : '#source-pane'
    const targetSelector = mode === 'mapped element' ? '#target-pane' : sourceSelector
    const bs = await startServer({
      scrollProportionally: false,
      scrollElementMapping: mode === 'mapped element' ? ['#source-pane', '#target-pane'] : [],
    })
    const target = await context.newPage()
    const [, targetInfo] = await Promise.all([
      gotoAndWaitForClient(page, bs, '/scroll.html#source'),
      gotoAndWaitForClient(target, bs, '/scroll.html#target'),
    ])
    await target.addStyleTag({ content: 'html, #source-pane, #target-pane { scroll-behavior: smooth; }' })

    // Observe the native position immediately after each incoming scrollTo call.
    // Polling only the final position would also pass with an unwanted animation.
    await target.evaluate((selector) => {
      const scroller = selector ? document.querySelector<HTMLElement>(selector)! : window
      const samples: number[] = []
      scroller.scrollTo = new Proxy(scroller.scrollTo, {
        apply (scrollTo, receiver, args) {
          Reflect.apply(scrollTo, receiver, args)
          samples.push(scroller instanceof Window ? scroller.scrollY : scroller.scrollTop)
          document.body.dataset['scrollSamples'] = JSON.stringify(samples)
        },
      })
    }, targetSelector)

    // Observe beyond the client's one-second echo suppression window.
    const noTargetEcho = waitForNoClientUpdate(bs, info => info.id === targetInfo.id, 1500)
      .then(() => null, error => error as Error)
    const positions = [320, 80, 400]
    for (const [index, top] of positions.entries()) {
      await page.evaluate(({ selector, top }) => {
        const scroller = selector ? document.querySelector<HTMLElement>(selector)! : window
        scroller.scrollTo({ top, left: 0, behavior: 'instant' })
      }, { selector: sourceSelector, top })
      await expect(target.locator('body')).toHaveAttribute('data-scroll-samples', JSON.stringify(positions.slice(0, index + 1)))
    }
    expect(await noTargetEcho).toBeNull()

    // A normal local scroll still follows the site's CSS, rather than jumping.
    const localScroll = await target.evaluate((selector) => {
      const element = selector ? document.querySelector<HTMLElement>(selector)! : document.documentElement
      const scroller = selector ? element : window
      scroller.scrollTo(0, 0)
      return {
        behavior: getComputedStyle(element).scrollBehavior,
        top: scroller instanceof Window ? scroller.scrollY : scroller.scrollTop,
      }
    }, targetSelector)
    expect(localScroll.behavior).toBe('smooth')
    expect(localScroll.top).toBeGreaterThan(0)
    await expect.poll(() => target.evaluate((selector) => {
      return selector ? document.querySelector<HTMLElement>(selector)!.scrollTop : window.scrollY
    }, targetSelector)).toBe(0)
  })
}

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

test('syncs horizontal document scroll proportionally across viewport sizes', async ({ context, page, startServer }) => {
  const bs = await startServer()
  const target = await context.newPage()
  await target.setViewportSize({ width: 640, height: 720 })
  await Promise.all([
    gotoAndWaitForClient(page, bs, '/scroll.html#source'),
    gotoAndWaitForClient(target, bs, '/scroll.html#target'),
  ])

  await page.evaluate(() => {
    const scrollableWidth = document.documentElement.scrollWidth - document.documentElement.clientWidth
    window.scrollTo(scrollableWidth / 2, 0)
  })

  await expect.poll(() => target.evaluate(() => {
    const scrollableWidth = document.documentElement.scrollWidth - document.documentElement.clientWidth
    return window.scrollX / scrollableWidth
  })).toBeGreaterThan(0.45)
  expect(await target.evaluate(() => {
    const scrollableWidth = document.documentElement.scrollWidth - document.documentElement.clientWidth
    return window.scrollX / scrollableWidth
  })).toBeLessThan(0.55)
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

  await page.locator('#text-input').fill('mirrored')
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
