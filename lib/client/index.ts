import { log } from './vendor/logger.ts'
import { handleReload, handleCssReload, handleNotify, handleScroll, handleInput } from './handlers.ts'
import type { ServerToClientMessage, GhostMessage } from '../protocol.ts'

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
const ws = new WebSocket(`${protocol}//${location.host}/__bs`)

ws.onopen = () => log.debug('Connected')
ws.onclose = () => log.info('Disconnected')

ws.onmessage = (e: MessageEvent) => {
  let msg: ServerToClientMessage
  try {
    msg = JSON.parse(e.data as string) as ServerToClientMessage
  } catch {
    log.warn('Invalid message from server')
    return
  }

  switch (msg.type) {
    case 'reload': handleReload(); break
    case 'css-reload': handleCssReload(msg.path); break
    case 'notify': handleNotify(msg.message); break
    case 'scroll': handleScroll(msg.x, msg.y); break
    case 'input': handleInput(msg.id, msg.value); break
    default: log.debug('Unknown message type', (msg as { type: string }).type)
  }
}

function send (msg: GhostMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

// Ghost mode — scroll sync
window.addEventListener('scroll', () => {
  send({ type: 'scroll', x: scrollX, y: scrollY })
}, { passive: true })

// Ghost mode — click sync
document.addEventListener('click', (e) => {
  const el = e.target as Element
  const rect = el.getBoundingClientRect()
  send({ type: 'click', x: rect.left + scrollX, y: rect.top + scrollY })
})

// Ghost mode — text input sync
document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement
  const id = el.id || el.name
  if (!id) return
  send({ type: 'input', id, value: el.value })
})

// Ghost mode — checkbox/radio sync
document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement
  if (el.type !== 'checkbox' && el.type !== 'radio') return
  const id = el.id || el.name
  if (!id) return
  send({ type: 'input', id, value: el.checked ? 'true' : 'false' })
})
