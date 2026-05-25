import type { UiState, UiServerMessage } from '../types.ts'

export interface WsClient {
  onUpdate: ((state: UiState) => void) | null
  send: (data: unknown) => void
  close: () => void
}

export function createWsClient (): WsClient {
  const ws = new WebSocket(`ws://${location.host}/ws`)
  let currentState: UiState | null = null

  const client: WsClient = {
    onUpdate: null,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data))
    },
    close: () => ws.close(),
  }

  ws.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data as string) as UiServerMessage
      if (msg.type === 'init') {
        currentState = msg.data
        client.onUpdate?.(currentState)
      } else if (msg.type === 'update' && currentState) {
        currentState = { ...currentState, ...msg.data }
        client.onUpdate?.(currentState)
      }
    } catch {
      console.warn('[BS UI] Invalid message from server')
    }
  }

  ws.onclose = () => console.info('[BS UI] Disconnected from server')

  return client
}
