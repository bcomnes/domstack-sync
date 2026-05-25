import { log } from './vendor/logger.ts'
import {
  getClickMessage,
  getFormSubmitMessage,
  getInputTextMessage,
  getInputToggleMessage,
  getScrollMessage,
  handleReload,
  handleCssReload,
  handleFileReload,
  handleNotify,
  handleHighlight,
  handleUiElementAdd,
  handleUiElementRemove,
  handleOverlayGridCss,
  handleScroll,
  handleClick,
  handleInput,
  handleTextInput,
  handleInputToggle,
  handleFormSubmit,
  handleBrowserLocation,
  isInputSuppressed,
  matchesScrollElementFilter,
  setUiElementBaseUrl,
} from './handlers.ts'
import { openReconnecting } from './reconnect.ts'
import type { ServerToClientMessage, GhostMessage, ClientRuntimeOptions, ClientInfoMessage, PathScopedGhostMessage } from '../protocol.ts'

const SCROLL_SUPPRESSION_MS = 1000
const CLICK_SUPPRESSION_MS = 1000
const socketOrigin = getSocketOrigin()
setUiElementBaseUrl(`${socketOrigin.protocol === 'wss:' ? 'https:' : 'http:'}//${socketOrigin.host}`)

let runtimeOptions: ClientRuntimeOptions = {
  ghostMode: {
    scroll: true,
    clicks: true,
    location: true,
    forms: { submit: true, inputs: true, toggles: true },
  },
  notify: true,
  codeSync: true,
  injectChanges: true,
  injectFileTypes: ['css', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'map'],
  tagNames: {
    less: 'link',
    scss: 'link',
    css: 'link',
    jpg: 'img',
    jpeg: 'img',
    png: 'img',
    svg: 'img',
    gif: 'img',
    webp: 'img',
    js: 'script',
  },
  scrollThrottle: 0,
  scrollElements: [],
  scrollElementMapping: [],
  scrollProportionally: true,
}
let suppressScrollUntil = 0
let suppressClickUntil = 0
let lastScrollSentAt = 0

const conn = openReconnecting({
  url: `${socketOrigin.protocol}//${socketOrigin.host}/__bs`,
  onopen: () => {
    log.debug('Connected')
    sendClientInfo()
  },
  onclose: (delay) => log.info(`Disconnected — reconnecting in ${delay / 1000}s`),
  onmessage: (e) => {
    let msg: ServerToClientMessage
    try {
      msg = JSON.parse(e.data as string) as ServerToClientMessage
    } catch {
      log.warn('Invalid message from server')
      return
    }

    if (isPathScopedGhostMessage(msg) && msg.pathname !== location.pathname) return

    switch (msg.type) {
      case 'options': runtimeOptions = msg.data; break
      case 'reload': if (runtimeOptions.codeSync) handleReload(); break
      case 'css-reload':
        if (runtimeOptions.codeSync) {
          if (runtimeOptions.injectChanges) handleCssReload(msg.path)
          else handleReload()
        }
        break
      case 'file-reload':
        if (runtimeOptions.codeSync) {
          if (runtimeOptions.injectChanges) handleFileReload(msg.file, runtimeOptions.tagNames)
          else handleReload()
        }
        break
      case 'highlight': handleHighlight(); break
      case 'ui:element:add': handleUiElementAdd(msg.element); break
      case 'ui:element:remove': handleUiElementRemove(msg.id); break
      case 'ui:remote-debug:css-overlay-grid': handleOverlayGridCss(msg.innerHTML); break
      case 'notify': if (runtimeOptions.notify) handleNotify(msg.message); break
      case 'scroll':
      case 'scroll:element':
        if (runtimeOptions.ghostMode.scroll) {
          suppressScrollUntil = Date.now() + SCROLL_SUPPRESSION_MS
          handleScroll(msg, {
            scrollElementMapping: runtimeOptions.scrollElementMapping,
            scrollProportionally: runtimeOptions.scrollProportionally,
          })
        }
        break
      case 'click':
        if (runtimeOptions.ghostMode.clicks) {
          suppressClickUntil = Date.now() + CLICK_SUPPRESSION_MS
          handleClick(msg.tagName, msg.index)
        }
        break
      case 'input:text':
        if (runtimeOptions.ghostMode.forms.inputs) handleTextInput(msg)
        break
      case 'input:toggles':
        if (runtimeOptions.ghostMode.forms.toggles) handleInputToggle(msg)
        break
      case 'input':
        if (runtimeOptions.ghostMode.forms.inputs || runtimeOptions.ghostMode.forms.toggles) handleInput(msg.id, msg.value)
        break
      case 'form:submit':
      case 'form:reset':
        if (runtimeOptions.ghostMode.forms.submit) handleFormSubmit(msg)
        break
      case 'browser:location':
        if (runtimeOptions.ghostMode.location) handleBrowserLocation(msg)
        break
      default: log.debug('Unknown message type', (msg as { type: string }).type)
    }
  },
})

function getSocketOrigin (): { protocol: 'ws:' | 'wss'; host: string } {
  const script = document.currentScript

  if (script instanceof HTMLScriptElement && script.src) {
    try {
      const scriptUrl = new URL(script.src)
      return {
        protocol: scriptUrl.protocol === 'https:' ? 'wss:' : 'ws:',
        host: scriptUrl.host,
      }
    } catch {
      // Fall through to the page URL if the script URL cannot be parsed.
    }
  }

  return {
    protocol: location.protocol === 'https:' ? 'wss:' : 'ws:',
    host: location.host,
  }
}

function send (msg: GhostMessage): void {
  conn.send(JSON.stringify(msg))
}

function sendClientInfo (): void {
  const msg: ClientInfoMessage = {
    type: 'client-info',
    pathname: location.pathname,
    path: `${location.pathname}${location.search}${location.hash}`,
    href: location.href,
  }
  conn.send(JSON.stringify(msg))
}

function isPathScopedGhostMessage (msg: ServerToClientMessage): msg is PathScopedGhostMessage {
  return 'pathname' in msg && typeof msg.pathname === 'string' && [
    'scroll',
    'scroll:element',
    'click',
    'input:text',
    'input:toggles',
    'form:submit',
    'form:reset',
    'input',
  ].includes(msg.type)
}

// Ghost mode — scroll sync
document.addEventListener('scroll', (e) => {
  if (!runtimeOptions.ghostMode.scroll) return
  const now = Date.now()
  if (now < suppressScrollUntil) return
  if (runtimeOptions.scrollThrottle > 0 && now - lastScrollSentAt < runtimeOptions.scrollThrottle) return
  if (!matchesScrollElementFilter(e.target, runtimeOptions.scrollElements, runtimeOptions.scrollElementMapping)) return
  const msg = getScrollMessage(e.target, location.pathname, runtimeOptions.scrollElementMapping)
  if (!msg) return
  lastScrollSentAt = now
  send(msg)
}, { passive: true, capture: true })

// Ghost mode — click sync (skip label clicks that will also fire on the associated input)
document.addEventListener('click', (e) => {
  if (!runtimeOptions.ghostMode.clicks) return
  if (Date.now() < suppressClickUntil) return
  const el = e.target as Element
  if (el instanceof HTMLLabelElement && el.htmlFor && document.getElementById(el.htmlFor)) return
  send(getClickMessage(el, location.pathname))
}, { capture: true })

// Ghost mode — text input sync
document.addEventListener('keyup', (e) => {
  if (!runtimeOptions.ghostMode.forms.inputs) return
  const el = e.target
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
  if (isInputSuppressed(el)) return
  send(getInputTextMessage(el, location.pathname))
}, true)

// Ghost mode — checkbox/radio/select sync
document.addEventListener('change', (e) => {
  if (!runtimeOptions.ghostMode.forms.toggles) return
  const el = e.target
  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return
  if (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio') return
  if (isInputSuppressed(el)) return
  send(getInputToggleMessage(el, location.pathname))
}, true)

// Ghost mode — form submit/reset sync
document.addEventListener('submit', sendFormAction, true)
document.addEventListener('reset', sendFormAction, true)

function sendFormAction (e: Event): void {
  if (!runtimeOptions.ghostMode.forms.submit) return
  if (!(e.target instanceof HTMLFormElement)) return
  if (isInputSuppressed(e.target)) return
  if (e.type !== 'submit' && e.type !== 'reset') return
  send(getFormSubmitMessage(e.target, e.type, location.pathname))
}
