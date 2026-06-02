import type { UiElementDescriptor } from '../protocol.ts'

let uiElementBaseUrl: string | null = null

export function setUiElementBaseUrl (baseUrl: string | null): void {
  uiElementBaseUrl = baseUrl
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
  const baseUrl = src.startsWith('/') && !src.startsWith('//') && uiElementBaseUrl
    ? uiElementBaseUrl
    : location.href
  return new URL(src, baseUrl).href
}
