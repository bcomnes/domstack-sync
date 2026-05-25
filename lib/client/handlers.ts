import { log } from './vendor/logger.ts'
import type {
  BrowserLocationMessage,
  ClickMessage,
  ElementData,
  FileReloadInfo,
  FormSubmitAction,
  FormSubmitMessage,
  FormResetMessage,
  InputTextMessage,
  InputToggleMessage,
  ScrollElementMessage,
  ScrollMessage,
  ScrollPosition,
  UiElementDescriptor,
} from '../protocol.ts'

declare global {
  interface HTMLLinkElement {
    __LiveReload_pendingRemoval?: boolean
  }

  interface CSSImportRule {
    __LiveReload_newHref?: string
  }
}

export function handleReload (): void {
  log.info('Reloading...')
  location.reload()
}

const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'])
const attrs: Record<string, 'href' | 'src'> = {
  link: 'href',
  img: 'src',
  script: 'src',
}

function splitUrl (url: string): { url: string; params: string; hash: string } {
  let nextUrl = url
  let hash = ''
  let params = ''
  const hashIndex = nextUrl.indexOf('#')
  if (hashIndex >= 0) {
    hash = nextUrl.slice(hashIndex)
    nextUrl = nextUrl.slice(0, hashIndex)
  }
  const paramsIndex = nextUrl.indexOf('?')
  if (paramsIndex >= 0) {
    params = nextUrl.slice(paramsIndex)
    nextUrl = nextUrl.slice(0, paramsIndex)
  }
  return { url: nextUrl, params, hash }
}

function getLocation (url: string): URL {
  return new URL(url, location.href)
}

function pathFromUrl (url: string): string {
  return decodeURIComponent(getLocation(url).pathname)
}

function normalisePath (path: string): string {
  return path.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase()
}

function numberOfMatchingSegments (path: string, href: string): number {
  const left = normalisePath(path)
  const right = normalisePath(pathFromUrl(href))
  if (left === right) return 10000

  const pathSegs = left.split('/').filter(Boolean).reverse()
  const hrefSegs = right.split('/').filter(Boolean).reverse()
  let count = 0
  for (let i = 0; i < pathSegs.length && i < hrefSegs.length; i++) {
    if (pathSegs[i] === hrefSegs[i]) count++
    else break
  }
  return count
}

function pathsMatch (path: string, href: string): boolean {
  return numberOfMatchingSegments(path, href) > 0
}

function pickBestMatch<T> (path: string, objects: T[], hrefFor: (item: T) => string | null): T | null {
  let best: T | null = null
  let bestScore = 0
  for (const item of objects) {
    const href = hrefFor(item)
    if (!href) continue
    const score = numberOfMatchingSegments(path, href)
    if (score > bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

function generateCacheBustUrl (url: string, expando = `browsersync=${Date.now()}`): string {
  const split = splitUrl(url)
  let params = split.params.replace(/(\?|&)browsersync=(\d+)/, (_match, sep: string) => `${sep}${expando}`)
  if (params === split.params) {
    params = split.params.length === 0 ? `?${expando}` : `${split.params}&${expando}`
  }
  return split.url + params + split.hash
}

export function handleCssReload (path: string): void {
  if (!reloadStylesheet(path)) handleReload()
}

export function handleFileReload (file: FileReloadInfo, tagNames: Record<string, string>): void {
  if (file.url || file.type === 'reload') {
    handleReload()
    return
  }

  if (file.ext === 'map') return

  let matched = false
  if (file.ext === 'css') {
    matched = reloadStylesheet(file.path)
  } else if (imageExts.has(file.ext)) {
    matched = reloadImages(file.path)
  } else {
    matched = reloadTaggedFile(file, tagNames)
  }

  if (matched) log.info(`File injected: ${file.basename}`)
  else handleReload()
}

type StylesheetMatch =
  | HTMLLinkElement
  | { link: HTMLLinkElement | HTMLStyleElement; rule: CSSImportRule; index: number; href: string }

function isImportedRuleMatch (match: StylesheetMatch): match is { link: HTMLLinkElement | HTMLStyleElement; rule: CSSImportRule; index: number; href: string } {
  return 'rule' in match
}

function reloadStylesheet (path: string): boolean {
  const links = Array.from(document.getElementsByTagName('link'))
    .filter(link => link.rel.match(/^stylesheet$/i) && !link.__LiveReload_pendingRemoval)

  const styleImported = Array.from(document.getElementsByTagName('style'))
    .filter(style => Boolean(style.sheet))
    .flatMap(style => collectImportedStylesheets(style, style.sheet))

  const linksImported = links.flatMap(link => collectImportedStylesheets(link, link.sheet))
  const allRules: StylesheetMatch[] = [...links, ...styleImported, ...linksImported]
  const match = pickBestMatch(path, allRules, linkHref)

  if (match) {
    if (isImportedRuleMatch(match)) return reattachImportedRule(match)
    return reattachStylesheetLink(match)
  }

  const [first] = path.split('.')
  if (first === '*' && links.length) {
    for (const link of links) reattachStylesheetLink(link)
    return true
  }

  return false
}

function linkHref (item: StylesheetMatch): string | null {
  if (isImportedRuleMatch(item)) return item.href
  return item.href || item.getAttribute('data-href')
}

function collectImportedStylesheets (
  link: HTMLLinkElement | HTMLStyleElement,
  styleSheet: CSSStyleSheet | null
): Array<{ link: HTMLLinkElement | HTMLStyleElement; rule: CSSImportRule; index: number; href: string }> {
  const output: Array<{ link: HTMLLinkElement | HTMLStyleElement; rule: CSSImportRule; index: number; href: string }> = []
  collect(makeRules(styleSheet))
  return output

  function collect (rules: CSSRuleList | null): void {
    if (!rules) return
    for (let index = 0; index < rules.length; index++) {
      const rule = rules[index]
      if (rule?.type !== CSSRule.IMPORT_RULE) continue
      const importRule = rule as CSSImportRule
      output.push({ link, rule: importRule, index, href: importRule.href })
      collect(makeRules(importRule.styleSheet))
    }
  }
}

function makeRules (styleSheet: CSSStyleSheet | null | undefined): CSSRuleList | null {
  try {
    return styleSheet?.cssRules ?? null
  } catch {
    return null
  }
}

function reattachStylesheetLink (link: HTMLLinkElement): boolean {
  if (link.__LiveReload_pendingRemoval) return false
  link.__LiveReload_pendingRemoval = true

  const clone = link.cloneNode(false) as HTMLLinkElement
  clone.href = generateCacheBustUrl(linkHref(link) ?? link.href)

  const parent = link.parentNode
  if (!parent) return false
  parent.insertBefore(clone, link.nextSibling)
  clone.onload = () => {
    if (link.parentNode) link.remove()
  }
  return true
}

function reattachImportedRule (match: { link: HTMLLinkElement | HTMLStyleElement; rule: CSSImportRule; index: number; href: string }): boolean {
  const parent = match.rule.parentStyleSheet
  if (!parent) return false

  const href = generateCacheBustUrl(match.rule.href)
  const media = match.rule.media.length ? Array.prototype.join.call(match.rule.media, ', ') as string : ''
  const newRule = `@import url("${href}") ${media};`
  match.rule.__LiveReload_newHref = href

  const tempLink = document.createElement('link')
  tempLink.rel = 'stylesheet'
  tempLink.href = href
  tempLink.__LiveReload_pendingRemoval = true
  match.link.parentNode?.insertBefore(tempLink, match.link)

  setTimeout(() => {
    tempLink.remove()
    if (match.rule.__LiveReload_newHref !== href) return
    try {
      parent.insertRule(newRule, match.index)
      parent.deleteRule(match.index + 1)
      const nextRule = parent.cssRules[match.index] as CSSImportRule | undefined
      if (nextRule) nextRule.__LiveReload_newHref = href
    } catch {
      // Cross-origin and malformed stylesheet rules cannot be safely rewritten.
    }
  }, 200)
  return true
}

function reloadImages (path: string): boolean {
  const expando = `browsersync=${Date.now()}`
  let matched = false

  for (const img of Array.from(document.images)) {
    if (!pathsMatch(path, img.src)) continue
    img.src = generateCacheBustUrl(img.src, expando)
    matched = true
  }

  const imageStyles = [
    { selector: 'background', styleNames: ['backgroundImage'] },
    { selector: 'border', styleNames: ['borderImage', 'webkitBorderImage', 'MozBorderImage'] },
  ]

  for (const { selector, styleNames } of imageStyles) {
    for (const elem of Array.from(document.querySelectorAll<HTMLElement>(`[style*=${selector}]`))) {
      for (const styleName of styleNames) {
        const style = elem.style as CSSStyleDeclaration & Record<string, string>
        const current = style[styleName]
        if (typeof current !== 'string') continue
        const next = current.replace(/\burl\s*\(([^)]*)\)/g, (match, src: string) => {
          const cleanSrc = src.trim().replace(/^['"]|['"]$/g, '')
          if (!pathsMatch(path, cleanSrc)) return match
          matched = true
          return `url(${generateCacheBustUrl(cleanSrc, expando)})`
        })
        if (next !== current) {
          style[styleName] = next
        }
      }
    }
  }

  return matched
}

function reloadTaggedFile (file: FileReloadInfo, tagNames: Record<string, string>): boolean {
  const tagName = tagNames[file.ext]
  const attr = tagName ? attrs[tagName] : undefined
  if (!tagName || !attr) return false

  const elems = Array.from(document.getElementsByTagName(tagName))
  const matches = file.basename.startsWith('*')
    ? elems
    : elems.filter(elem => new RegExp(`(^|/)${escapeRegExp(file.basename)}`).test(getElementUrl(elem, attr)))

  for (const elem of matches) {
    const currentUrl = getElementUrl(elem, attr)
    if (tagName === 'link') {
      reloadStylesheet(currentUrl)
    } else if (tagName === 'img') {
      reloadImages(currentUrl)
    } else {
      setElementUrl(elem, attr, generateCacheBustUrl(currentUrl))
    }
  }

  return matches.length > 0
}

function escapeRegExp (value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getElementUrl (elem: Element, attr: 'href' | 'src'): string {
  return elem.getAttribute(attr) ?? ''
}

function setElementUrl (elem: Element, attr: 'href' | 'src', value: string): void {
  elem.setAttribute(attr, value)
}

export function handleNotify (message: string): void {
  let overlay = document.getElementById('__bs-notify__')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = '__bs-notify__'
    overlay.style.cssText = [
      'position:fixed', 'top:10px', 'right:10px', 'z-index:99999',
      'background:#1B2032', 'color:#fff', 'padding:8px 14px',
      'border-radius:4px', 'font-family:sans-serif', 'font-size:13px',
      'pointer-events:none', 'transition:opacity 0.3s',
    ].join(';')
    document.body.appendChild(overlay)
  }
  overlay.textContent = message
  overlay.style.opacity = '1'
  setTimeout(() => { if (overlay) overlay.style.opacity = '0' }, 2000)
}

export function handleHighlight (): void {
  const id = '__browser-sync-highlight__'
  const existing = document.getElementById(id)
  if (existing) {
    existing.remove()
    return
  }

  const elem = document.createElement('div')
  elem.id = id
  elem.style.cssText = [
    'position:fixed',
    'z-index:1000',
    'width:100%',
    'height:100%',
    'border-width:5px',
    'border-color:red',
    'border-style:solid',
    'top:0',
    'left:0',
    'pointer-events:none',
  ].join(';')
  document.body.appendChild(elem)
}

export function handleUiElementAdd (element: UiElementDescriptor): void {
  const existing = document.getElementById(element.id)
  if (existing) {
    if (element.innerHTML !== undefined) existing.innerHTML = element.innerHTML
    return
  }

  let node: HTMLElement
  if (element.type === 'css') {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.type = 'text/css'
    link.media = 'all'
    link.href = getAbsoluteUrl(element.src ?? '')
    node = link
  } else if (element.type === 'js') {
    const script = document.createElement('script')
    script.src = getAbsoluteUrl(element.src ?? '')
    node = script
  } else {
    node = document.createElement(element.tagName ?? 'div')
    if (element.className) node.className = element.className
    if (element.innerHTML !== undefined) node.innerHTML = element.innerHTML
  }

  node.id = element.id
  for (const [name, value] of Object.entries(element.attrs ?? {})) {
    node.setAttribute(name, value)
  }

  const parent = element.placement === 'head' || element.type === 'css' ? document.head : document.body
  parent.appendChild(node)
}

export function handleUiElementRemove (id: string): void {
  document.getElementById(id)?.remove()
}

export function handleOverlayGridCss (innerHTML: string): void {
  handleUiElementAdd({
    id: '__bs_overlay-grid-styles__',
    type: 'dom',
    tagName: 'style',
    attrs: { type: 'text/css' },
    placement: 'head',
    innerHTML,
  })
}

function getAbsoluteUrl (src: string): string {
  return new URL(src, location.href).href
}

export interface ScrollApplyOptions {
  scrollElementMapping: string[]
  scrollProportionally: boolean
}

export function getElementData (elem: Element): ElementData {
  const tagName = elem.tagName
  return {
    tagName,
    index: Array.prototype.indexOf.call(document.getElementsByTagName(tagName), elem) as number,
  }
}

export function getClickMessage (target: Element, pathname: string): ClickMessage {
  return { type: 'click', ...getElementData(target), pathname }
}

export function getInputTextMessage (target: HTMLInputElement | HTMLTextAreaElement, pathname: string): InputTextMessage {
  return { type: 'input:text', ...getElementData(target), value: target.value, pathname }
}

export function getInputToggleMessage (target: HTMLInputElement | HTMLSelectElement, pathname: string): InputToggleMessage {
  return {
    type: 'input:toggles',
    ...getElementData(target),
    value: target.value,
    checked: 'checked' in target ? target.checked : false,
    inputType: target instanceof HTMLInputElement ? target.type : 'select',
    pathname,
  }
}

export function getFormSubmitMessage (target: HTMLFormElement, action: FormSubmitAction, pathname: string): FormSubmitMessage | FormResetMessage {
  if (action === 'reset') return { type: 'form:reset', ...getElementData(target), action, pathname }
  return { type: 'form:submit', ...getElementData(target), action, pathname }
}

export function getScrollMessage (
  target: EventTarget | null,
  pathname: string,
  scrollElementMapping: string[]
): ScrollMessage | ScrollElementMessage | null {
  const mappedElements = scrollElementMapping.map(selector => document.querySelector(selector))

  if (target === document || target === document.documentElement || target === document.body) {
    return {
      type: 'scroll',
      position: getDocumentScrollPosition(),
      tagName: 'document',
      index: 0,
      mappingIndex: -1,
      pathname,
    }
  }

  if (!(target instanceof HTMLElement)) return null

  const mappingIndex = mappedElements.indexOf(target)
  return {
    type: 'scroll:element',
    position: getElementScrollPosition(target),
    ...getElementData(target),
    mappingIndex,
    pathname,
  }
}

export function matchesScrollElementFilter (target: EventTarget | null, scrollElements: string[], scrollElementMapping: string[]): boolean {
  if (target === document || target === document.documentElement || target === document.body) return true
  if (!(target instanceof Element)) return false
  if (scrollElements.length === 0 && scrollElementMapping.length === 0) return true
  return [...scrollElements, ...scrollElementMapping].some(selector => target.matches(selector))
}

function getDocumentScrollPosition (): ScrollPosition {
  const raw = {
    x: window.pageXOffset,
    y: window.pageYOffset,
  }
  return {
    raw,
    proportional: getScrollPercentage(getDocumentScrollSpace(), raw).y,
  }
}

function getElementScrollPosition (element: HTMLElement): ScrollPosition {
  const raw = {
    x: element.scrollLeft,
    y: element.scrollTop,
  }
  return {
    raw,
    proportional: getScrollPercentage({ x: element.scrollWidth, y: element.scrollHeight }, raw).y,
  }
}

function getDocumentScrollSpace (): { x: number; y: number } {
  return {
    x: document.body.scrollHeight - document.documentElement.clientWidth,
    y: document.body.scrollHeight - document.documentElement.clientHeight,
  }
}

function getScrollPercentage (scrollSpace: { x: number; y: number }, scrollPosition: { x: number; y: number }): { x: number; y: number } {
  return {
    x: scrollSpace.x > 0 ? scrollPosition.x / scrollSpace.x : 0,
    y: scrollSpace.y > 0 ? scrollPosition.y / scrollSpace.y : 0,
  }
}

export function handleScroll (event: ScrollMessage | ScrollElementMessage, opts: ScrollApplyOptions): void {
  if (event.tagName === 'document') {
    const scrollSpace = getDocumentScrollSpace()
    const nextX = opts.scrollProportionally ? scrollSpace.x * event.position.proportional : event.position.raw.x
    const nextY = opts.scrollProportionally ? scrollSpace.y * event.position.proportional : event.position.raw.y
    if (isNear(window.pageXOffset, nextX) && isNear(window.pageYOffset, nextY)) return
    window.scrollTo(nextX, nextY)
    return
  }

  if (event.mappingIndex > -1) {
    opts.scrollElementMapping
      .filter((_selector, index) => index !== event.mappingIndex)
      .map(selector => document.querySelector<HTMLElement>(selector))
      .forEach(element => {
        if (element) scrollElement(element, event, opts.scrollProportionally)
      })
    return
  }

  const matchingElements = document.getElementsByTagName(event.tagName)
  const match = matchingElements[event.index] as HTMLElement | undefined
  if (match) {
    scrollElement(match, event, opts.scrollProportionally)
  }
}

function scrollElement (element: HTMLElement, event: ScrollMessage, scrollProportionally: boolean): void {
  const nextX = scrollProportionally ? element.scrollWidth * event.position.proportional : event.position.raw.x
  const nextY = scrollProportionally ? element.scrollHeight * event.position.proportional : event.position.raw.y
  if (isNear(element.scrollLeft, nextX) && isNear(element.scrollTop, nextY)) return
  element.scrollTo(nextX, nextY)
}

function isNear (current: number, next: number): boolean {
  return Math.abs(current - next) < 1
}

export function handleClick (tagName: string, index: number): void {
  const target = document.getElementsByTagName(tagName)[index]
  if (!target) return

  setTimeout(() => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    })
    target.dispatchEvent(event)
  }, 0)
}

const suppressedInputs = new Set<string>()
const suppressTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function getElementKey (data: ElementData): string {
  return `${data.tagName}:${data.index}`
}

export function isInputSuppressed (target: Element | string): boolean {
  if (typeof target === 'string') return suppressedInputs.has(target)
  return suppressedInputs.has(getElementKey(getElementData(target)))
}

function suppressInput (key: string): void {
  suppressedInputs.add(key)
  const existing = suppressTimers.get(key)
  if (existing) clearTimeout(existing)
  suppressTimers.set(key, setTimeout(() => {
    suppressedInputs.delete(key)
    suppressTimers.delete(key)
  }, 800))
}

export function handleInput (id: string, value: string): void {
  const el = (document.getElementById(id) ?? document.querySelector<HTMLInputElement>(`[name="${id}"]`)) as HTMLInputElement | null
  if (!el) return
  suppressInput(id)
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = value === 'true'
  } else {
    el.value = value
  }
}

export function handleTextInput (event: InputTextMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLInputElement | HTMLTextAreaElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))
  target.value = event.value
}

export function handleInputToggle (event: InputToggleMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLInputElement | HTMLSelectElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))

  if (event.inputType === 'radio' && 'checked' in target) {
    target.checked = true
    return
  }

  if (event.inputType === 'checkbox' && 'checked' in target) {
    target.checked = event.checked
    return
  }

  if (event.tagName === 'SELECT' || target instanceof HTMLSelectElement) {
    target.value = event.value
  }
}

export function handleFormSubmit (event: FormSubmitMessage | FormResetMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLFormElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))

  const action = event.type === 'form:reset' ? 'reset' : event.action
  if (action === 'reset') {
    HTMLFormElement.prototype.reset.call(target)
    return
  }

  HTMLFormElement.prototype.submit.call(target)
}

export function handleBrowserLocation (event: BrowserLocationMessage): void {
  if (event.path) {
    location.assign(`${location.protocol}//${location.host}${event.path}`)
    return
  }
  if (event.url) {
    location.assign(event.url)
  }
}
