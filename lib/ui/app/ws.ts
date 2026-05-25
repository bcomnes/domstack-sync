import type { UiState, UiServerMessage } from '../types.ts'

export interface WsClient {
  onUpdate: ((state: UiState) => void) | null
  onStatus: ((status: WsStatus) => void) | null
  send: (data: unknown) => void
  close: () => void
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected'

export function createWsClient (): WsClient {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  let ws: WebSocket | null = null
  let currentState: UiState | null = null
  let updateHandler: ((state: UiState) => void) | null = null
  let statusHandler: ((status: WsStatus) => void) | null = null
  let currentStatus: WsStatus = 'connecting'
  let reconnectDelay = 1000
  let manuallyClosed = false

  const client: WsClient = {
    get onUpdate () {
      return updateHandler
    },
    set onUpdate (handler) {
      updateHandler = handler
      if (handler && currentState) handler(currentState)
    },
    get onStatus () {
      return statusHandler
    },
    set onStatus (handler) {
      statusHandler = handler
      if (handler) handler(currentStatus)
    },
    send: (data) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
    },
    close: () => {
      manuallyClosed = true
      ws?.close()
    },
  }

  function setStatus (status: WsStatus): void {
    currentStatus = status
    statusHandler?.(status)
  }

  function connect (): void {
    setStatus('connecting')
    ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onopen = () => {
      reconnectDelay = 1000
      setStatus('connected')
    }

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string) as UiServerMessage
        if (msg.type === 'init') {
          currentState = msg.data
          updateHandler?.(currentState)
        } else if (msg.type === 'update' && currentState) {
          currentState = { ...currentState, ...msg.data }
          updateHandler?.(currentState)
        }
      } catch {
        console.warn('[BS UI] Invalid message from server')
      }
    }

    ws.onclose = () => {
      console.info('[BS UI] Disconnected from server')
      setStatus('disconnected')
      if (manuallyClosed) return
      const delay = reconnectDelay
      reconnectDelay = Math.min(reconnectDelay * 2, 30000)
      setTimeout(connect, delay)
    }
  }

  connect()

  return client
}
