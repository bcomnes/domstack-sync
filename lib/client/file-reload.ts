import { log } from './vendor/logger.ts'
import type { FileReloadInfo } from '../protocol.ts'

declare global {
  interface HTMLLinkElement {
    __LiveReload_pendingRemoval?: boolean
  }

  interface CSSImportRule {
    __LiveReload_newHref?: string
  }
}

const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'])
const attrs: Record<string, 'href' | 'src'> = {
  link: 'href',
  img: 'src',
  script: 'src',
}

export function handleReload (): void {
  log.info('Reloading...')
  location.reload()
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
