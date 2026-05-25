export interface WebSocketLike {
  readyState: number
  send: (data: string) => void
  onopen: (() => void) | null
  onclose: (() => void) | null
  onmessage: ((e: { data: unknown }) => void) | null
}

export function openReconnecting (opts: {
  url: string
  factory?: (url: string) => WebSocketLike
  onopen?: () => void
  onclose?: (retryDelay: number) => void
  onmessage: (e: { data: unknown }) => void
  initialDelay?: number
  maxDelay?: number
}): { send: (data: string) => void } {
  const {
    url, onopen, onclose, onmessage,
    initialDelay = 1000,
    maxDelay = 30000,
  } = opts
  const factory = opts.factory ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike)

  let socket: WebSocketLike
  let delay = initialDelay

  function connect (): void {
    socket = factory(url)
    socket.onopen = () => {
      delay = initialDelay
      onopen?.()
    }
    socket.onclose = () => {
      const retryDelay = delay
      delay = Math.min(delay * 2, maxDelay)
      onclose?.(retryDelay)
      setTimeout(connect, retryDelay)
    }
    socket.onmessage = onmessage
  }

  connect()

  return {
    send (data: string) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(data)
      }
    },
  }
}
