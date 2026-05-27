/// <reference lib="dom" />

import htmx from 'htmx.org'

declare global {
  interface Window {
    htmx: typeof htmx
  }
}

window.htmx = htmx

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
const statusEl = document.getElementById('connection-status')
let reconnectDelay = 250
let socket: WebSocket | null = null

connect()

function connect (): void {
  setStatus('connecting')
  socket = new WebSocket(`${protocol}//${location.host}/ws`)

  socket.addEventListener('open', () => {
    reconnectDelay = 250
    setStatus('connected')
  })

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data)) as { type?: string }
      if (msg.type === 'update') refreshMain()
    } catch {
      // Ignore malformed UI socket messages.
    }
  })

  socket.addEventListener('close', () => {
    setStatus('disconnected')
    const delay = reconnectDelay
    reconnectDelay = Math.min(reconnectDelay * 2, 5000)
    window.setTimeout(connect, delay)
  })
}

function refreshMain (): void {
  document.body.dispatchEvent(new CustomEvent('bs:state-update', { bubbles: true }))
}

function setStatus (status: 'connecting' | 'connected' | 'disconnected'): void {
  if (!statusEl) return
  statusEl.dataset['status'] = status
  statusEl.className = `connection-status connection-status--${status}`
  statusEl.textContent = status === 'connected'
    ? 'Connected'
    : status === 'connecting'
      ? 'Connecting'
      : 'Disconnected. Reconnecting'
}
