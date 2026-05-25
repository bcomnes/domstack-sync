import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { WebSocketServer, WebSocket } from 'ws'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BrowserSyncPluginPage, PluginUiEvent } from '../plugin-types.ts'
import type { BsClientInfo } from '../sockets.ts'
import type { BrowserLocationMessage, UiElementDescriptor } from '../protocol.ts'
import type { ClientRuntimeOptions, ClientRuntimeOptionsPatch } from '../protocol.ts'
import type {
  NetworkThrottleServerInfo,
  NetworkThrottleState,
  NetworkThrottleTarget,
  OverlayGridState,
  RemoteDebugClientFile,
  RemoteDebugState,
  UiState,
  UiServerMessage,
  UiClientMessage,
  HistoryEntry,
  UserPluginState,
  UiMode,
} from './types.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface UiServerOptions {
  uiPort: number
  serverUrl: string
  uiUrl: string
  localIp: string
  mainPort: number
  mode?: UiMode
  snippet?: string | null
  serverBaseDirs?: string[]
  proxyTarget?: string | null
  tunnelUrl?: string | null
  events: EventEmitter
  getConnections: () => BsClientInfo[]
  getRuntimeOptions: () => ClientRuntimeOptions
  setRuntimeOptions: (patch: ClientRuntimeOptionsPatch) => ClientRuntimeOptions
  sendBrowserLocation: (message: BrowserLocationMessage) => void
  highlightClient: (id: string) => void
  sendUiElementAdd: (element: UiElementDescriptor) => void
  sendUiElementRemove: (id: string) => void
  sendOverlayGridCss: (innerHTML: string) => void
  setNoCache: (active: boolean) => void
  setLatency: (ms: number) => void
  createThrottleServer: (target: NetworkThrottleTarget, port: string) => Promise<NetworkThrottleServerInfo>
  destroyThrottleServer: (port: number) => Promise<void>
  getUserPlugins?: () => UserPluginState[]
  configureUserPlugin?: (plugin: UserPluginState) => void
  handleUiEvent?: (event: PluginUiEvent) => void
}

export interface UiInstance {
  uiUrl: string
  uiPort: number
  exit: () => Promise<void>
}

const PAGES: Record<string, string> = {
  '/': 'Overview',
  '/sync-options': 'Sync Options',
  '/history': 'History',
  '/connections': 'Connections',
  '/remote-debug': 'Remote Debug',
  '/plugins': 'Plugins',
  '/network-throttle': 'Network Throttle',
  '/help': 'Help',
}

const remoteDebugClientFiles: RemoteDebugClientFile[] = [
  {
    type: 'css',
    id: '__browser-sync-pesticide__',
    active: false,
    title: 'CSS Outlining',
    name: 'pesticide',
    src: '/browser-sync/pesticide.css',
  },
  {
    type: 'css',
    id: '__browser-sync-pesticidedepth__',
    active: false,
    title: 'CSS Depth Outlining',
    name: 'pesticide-depth',
    src: '/browser-sync/pesticide-depth.css',
  },
]

const defaultOverlayGrid: OverlayGridState = {
  active: false,
  offsetY: '0',
  offsetX: '0',
  size: '16px',
  selector: 'body',
  color: 'rgba(0, 0, 0, .2)',
  horizontal: true,
  vertical: true,
}

const throttleTargets: NetworkThrottleTarget[] = [
  { active: false, title: 'DSL (2Mbs, 5ms RTT)', id: 'dsl', speed: 200, latency: 5, urls: [], order: 1 },
  { active: false, title: '4G (4Mbs, 20ms RTT)', id: '4g', speed: 400, latency: 10, urls: [], order: 2 },
  { active: false, title: '3G (750kbs, 100ms RTT)', id: '3g', speed: 75, latency: 50, urls: [], order: 3 },
  { active: false, title: 'Good 2G (450kbs, 150ms RTT)', id: 'good-2g', speed: 45, latency: 75, urls: [], order: 4 },
  { active: false, title: 'Regular 2G (250kbs, 300ms RTT)', id: '2g', speed: 25, latency: 150, urls: [], order: 5 },
  { active: false, title: 'GPRS (50kbs, 500ms RTT)', id: 'gprs', speed: 5, latency: 250, urls: [], order: 6 },
]

function htmlShell (title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} – domstack-sync</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <div id="app"></div>
  <script src="/app.js"></script>
</body>
</html>`
}

export async function createUiServer (opts: UiServerOptions): Promise<UiInstance> {
  const fastify = Fastify({ logger: false })
  const publicDir = resolve(__dirname, 'public')
  let userPlugins: UserPluginState[] = opts.getUserPlugins?.() ?? []

  await fastify.register(fastifyStatic, { root: publicDir, prefix: '/' })

  // Register a real route for each UI page
  for (const [path, title] of Object.entries(PAGES)) {
    fastify.get(path, async (_req, reply) => {
      reply.header('content-type', 'text/html; charset=utf-8')
      return reply.send(htmlShell(title))
    })
  }
  for (const page of getPluginPages(userPlugins)) {
    if (PAGES[page.path]) continue
    fastify.get(page.path, async (_req, reply) => {
      reply.header('content-type', 'text/html; charset=utf-8')
      return reply.send(htmlShell(page.title))
    })
  }

  // In-memory state
  let connections: BsClientInfo[] = opts.getConnections()
  let visitedPaths: string[] = []
  let remoteDebug: RemoteDebugState = {
    clientFiles: remoteDebugClientFiles.map(file => ({ ...file })),
    overlayGrid: { ...defaultOverlayGrid },
    noCache: { active: false },
    latency: { active: false, rate: 0 },
  }
  let networkThrottle: NetworkThrottleState = {
    targets: throttleTargets.map(target => ({ ...target, urls: [] })),
    servers: {},
  }

  function buildState (): UiState {
    return {
      serverUrl: opts.serverUrl,
      uiUrl: opts.uiUrl,
      localIp: opts.localIp,
      port: opts.mainPort,
      uiPort: opts.uiPort,
      mode: opts.mode ?? 'server',
      snippet: opts.snippet ?? null,
      serverBaseDirs: opts.serverBaseDirs ? [...opts.serverBaseDirs] : [],
      proxyTarget: opts.proxyTarget ?? null,
      tunnelUrl: opts.tunnelUrl ?? null,
      options: opts.getRuntimeOptions(),
      connections: [...connections],
      history: decorateHistory(visitedPaths),
      remoteDebug: cloneRemoteDebug(remoteDebug),
      networkThrottle: cloneNetworkThrottle(networkThrottle),
      plugins: cloneUserPlugins(userPlugins),
    }
  }

  // WebSocket server for UI clients
  const wss = new WebSocketServer({ noServer: true })

  function broadcastUpdate (data: Partial<UiState>): void {
    const msg = JSON.stringify({ type: 'update', data } satisfies UiServerMessage)
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(msg)
    }
  }

  wss.on('connection', (ws) => {
    const init: UiServerMessage = { type: 'init', data: buildState() }
    ws.send(JSON.stringify(init))

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as UiClientMessage
        if (msg.type === 'options:set') {
          const options = opts.setRuntimeOptions(msg.data)
          broadcastUpdate({ options })
        } else if (msg.type === 'history:send-all') {
          opts.sendBrowserLocation(makeBrowserLocationMessage(msg.path, opts.serverUrl))
        } else if (msg.type === 'history:remove') {
          removeHistoryPath(msg.path)
        } else if (msg.type === 'history:clear') {
          visitedPaths = []
          broadcastUpdate({ history: [] })
        } else if (msg.type === 'connection:highlight') {
          opts.highlightClient(msg.id)
        } else if (msg.type === 'remote-debug:file') {
          setRemoteDebugFile(msg.name, msg.active)
        } else if (msg.type === 'remote-debug:overlay-grid') {
          setOverlayGrid(msg.active)
        } else if (msg.type === 'remote-debug:overlay-grid:update') {
          updateOverlayGrid(msg.data)
        } else if (msg.type === 'remote-debug:no-cache') {
          remoteDebug = { ...remoteDebug, noCache: { active: msg.active } }
          opts.setNoCache(msg.active)
          broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
        } else if (msg.type === 'remote-debug:latency') {
          remoteDebug = {
            ...remoteDebug,
            latency: {
              active: msg.active,
              rate: msg.rate ?? remoteDebug.latency.rate,
            },
          }
          opts.setLatency(remoteDebug.latency.active ? remoteDebug.latency.rate * 1000 : 0)
          broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
        } else if (msg.type === 'network-throttle:create') {
          createNetworkThrottleServer(msg.targetId, msg.port ?? '').catch(() => {})
        } else if (msg.type === 'network-throttle:destroy') {
          destroyNetworkThrottleServer(msg.port).catch(() => {})
        } else if (msg.type === 'plugins:set') {
          setUserPlugin(msg.plugin)
        } else if (msg.type === 'plugins:set-many') {
          setManyUserPlugins(msg.active)
        } else if (msg.type === 'ui:event') {
          opts.handleUiEvent?.(msg)
        }
      } catch {
        // Ignore malformed UI client messages.
      }
    })
  })

  // Listen to main BS server events
  opts.events.on('client:connect', (info: BsClientInfo) => {
    connections = [...connections, info]
    broadcastUpdate({ connections })
  })

  opts.events.on('client:disconnect', (id: string) => {
    connections = connections.filter(c => c.id !== id)
    broadcastUpdate({ connections })
  })

  opts.events.on('client:update', (info: BsClientInfo) => {
    connections = connections.map(c => c.id === info.id ? info : c)
    addHistoryPath(info.path || info.pathname)
    broadcastUpdate({ connections })
  })

  opts.events.on('plugins:update', (plugins?: UserPluginState[]) => {
    userPlugins = plugins ? cloneUserPlugins(plugins) : cloneUserPlugins(opts.getUserPlugins?.() ?? userPlugins)
    broadcastUpdate({ plugins: cloneUserPlugins(userPlugins) })
  })

  fastify.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    }
  })

  await fastify.listen({ port: opts.uiPort, host: '0.0.0.0' })

  return {
    uiUrl: opts.uiUrl,
    uiPort: opts.uiPort,
    async exit () {
      for (const client of wss.clients) {
        client.terminate()
      }
      await new Promise<void>((resolve, reject) => wss.close(err => err ? reject(err) : resolve()))
      await fastify.close()
    },
  }

  function addHistoryPath (path: string): void {
    const normalized = normalizeHistoryPath(path, opts.serverUrl)
    if (!normalized) return
    if (visitedPaths.includes(normalized)) return
    visitedPaths = [...visitedPaths, normalized]
    broadcastUpdate({ history: decorateHistory(visitedPaths) })
  }

  function removeHistoryPath (path: string): void {
    const normalized = normalizeHistoryPath(path, opts.serverUrl)
    const next = visitedPaths.filter(item => item !== normalized)
    if (next.length === visitedPaths.length) return
    visitedPaths = next
    broadcastUpdate({ history: decorateHistory(visitedPaths) })
  }

  function setRemoteDebugFile (name: string, active: boolean): void {
    const file = remoteDebug.clientFiles.find(item => item.name === name)
    if (!file) return
    if (file.active === active) return

    const clientFiles = remoteDebug.clientFiles.map(item => item.name === name ? { ...item, active } : item)
    remoteDebug = { ...remoteDebug, clientFiles }

    if (active) {
      opts.sendUiElementAdd(fileToElement({ ...file, active }))
    } else {
      opts.sendUiElementRemove(file.id)
    }

    broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
  }

  function setOverlayGrid (active: boolean): void {
    if (remoteDebug.overlayGrid.active === active) return
    remoteDebug = { ...remoteDebug, overlayGrid: { ...remoteDebug.overlayGrid, active } }

    if (active) {
      opts.sendOverlayGridCss(getOverlayGridCss(remoteDebug.overlayGrid))
    } else {
      opts.sendUiElementRemove('__bs_overlay-grid-styles__')
    }

    broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
  }

  function updateOverlayGrid (data: Partial<OverlayGridState>): void {
    remoteDebug = {
      ...remoteDebug,
      overlayGrid: {
        ...remoteDebug.overlayGrid,
        ...data,
        active: remoteDebug.overlayGrid.active,
      },
    }

    if (remoteDebug.overlayGrid.active) {
      opts.sendOverlayGridCss(getOverlayGridCss(remoteDebug.overlayGrid))
    }

    broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
  }

  async function createNetworkThrottleServer (targetId: string, port: string): Promise<void> {
    const target = networkThrottle.targets.find(item => item.id === targetId)
    if (!target) return
    try {
      const info = await opts.createThrottleServer(target, port)
      networkThrottle = {
        ...networkThrottle,
        servers: {
          ...networkThrottle.servers,
          [info.port]: info,
        },
      }
      broadcastUpdate({ networkThrottle: cloneNetworkThrottle(networkThrottle) })
    } catch {
      // The UI stays unchanged if the requested proxy cannot be created.
    }
  }

  async function destroyNetworkThrottleServer (port: number): Promise<void> {
    if (!networkThrottle.servers[port]) return
    try {
      await opts.destroyThrottleServer(port)
    } finally {
      const servers = { ...networkThrottle.servers }
      delete servers[port]
      networkThrottle = { ...networkThrottle, servers }
      broadcastUpdate({ networkThrottle: cloneNetworkThrottle(networkThrottle) })
    }
  }

  function setUserPlugin (plugin: UserPluginState): void {
    userPlugins = userPlugins.map(item => item.name === plugin.name ? { ...item, active: plugin.active } : item)
    opts.configureUserPlugin?.(plugin)
    broadcastUpdate({ plugins: cloneUserPlugins(userPlugins) })
  }

  function setManyUserPlugins (active: boolean): void {
    userPlugins = userPlugins.map(item => ({ ...item, active }))
    for (const plugin of userPlugins) opts.configureUserPlugin?.(plugin)
    broadcastUpdate({ plugins: cloneUserPlugins(userPlugins) })
  }
}

function getPluginPages (plugins: UserPluginState[]): BrowserSyncPluginPage[] {
  return plugins
    .map(plugin => plugin.page)
    .filter((page): page is BrowserSyncPluginPage => Boolean(page?.path && page.title))
    .map(page => ({
      ...page,
      path: page.path.startsWith('/') ? page.path : `/${page.path}`,
    }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title))
}

function cloneUserPlugins (plugins: UserPluginState[]): UserPluginState[] {
  return plugins.map(plugin => {
    const clone: UserPluginState = { ...plugin }
    if (plugin.opts) clone.opts = { ...plugin.opts }
    if (plugin.page) clone.page = { ...plugin.page }
    if (plugin.templates) clone.templates = { ...plugin.templates }
    if (plugin.clientJs) clone.clientJs = { ...plugin.clientJs }
    return clone
  })
}

function decorateHistory (paths: string[]): HistoryEntry[] {
  return paths
    .map((path, index) => ({ path, key: index + 1 }))
    .reverse()
}

function normalizeHistoryPath (path: string, serverUrl: string): string {
  try {
    const parsed = new URL(path, serverUrl)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return ''
  }
}

function makeBrowserLocationMessage (path: string, serverUrl: string): BrowserLocationMessage {
  const parsed = new URL(path, serverUrl)
  return {
    type: 'browser:location',
    override: true,
    path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    url: parsed.href,
  }
}

function fileToElement (file: RemoteDebugClientFile): UiElementDescriptor {
  const element: UiElementDescriptor = {
    id: file.id,
    type: file.type,
  }
  if (file.src) element.src = file.src
  return element
}

function cloneRemoteDebug (state: RemoteDebugState): RemoteDebugState {
  return {
    clientFiles: state.clientFiles.map(file => ({ ...file })),
    overlayGrid: { ...state.overlayGrid },
    noCache: { ...state.noCache },
    latency: { ...state.latency },
  }
}

function cloneNetworkThrottle (state: NetworkThrottleState): NetworkThrottleState {
  return {
    targets: state.targets.map(target => ({ ...target, urls: [...target.urls] })),
    servers: Object.fromEntries(Object.entries(state.servers).map(([port, server]) => [
      port,
      {
        port: server.port,
        urls: [...server.urls],
        speed: { ...server.speed, urls: [...server.speed.urls] },
      },
    ])),
  }
}

function getOverlayGridCss (opts: OverlayGridState): string {
  const selectorPosition = `${opts.selector} {position:relative;}`
  const horizontal = opts.horizontal
    ? `${opts.selector}:after {
  position: absolute;
  width: auto;
  height: auto;
  z-index: 9999;
  content: '';
  display: block;
  pointer-events: none;
  top: ${opts.offsetY};
  right: 0;
  bottom: 0;
  left: ${opts.offsetX};
  background-color: transparent;
  background-image: linear-gradient(${opts.color} 1px, transparent 1px);
  background-size: 100% ${opts.size};
}`
    : ''
  const vertical = opts.vertical
    ? `${opts.selector}:before {
  position: absolute;
  width: auto;
  height: auto;
  z-index: 9999;
  content: '';
  display: block;
  pointer-events: none;
  top: ${opts.offsetY};
  right: 0;
  bottom: 0;
  left: ${opts.offsetX};
  background-color: transparent;
  background-image: linear-gradient(90deg, ${opts.color} 1px, transparent 1px);
  background-size: ${opts.size} 100%;
}`
    : ''
  return [selectorPosition, horizontal, vertical].filter(Boolean).join('\n')
}
