import Fastify from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import type { FastifyReply } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyFormbody from '@fastify/formbody'
import fastifyFragtml from 'fastify-fragtml'
import html, { frag, raw, render as renderHtml } from 'fragtml'
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
import {
  MAIN_FRAGMENT,
  getUiPageTemplate,
  type NavLink,
  type PageTemplateName,
  type SyncOption,
  type UiTemplateContext,
  type UrlInfo,
} from './templates/index.ts'
import { layoutTemplate } from './templates/layout.ts'
import type { FragtmlLayout } from 'fastify-fragtml'

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

interface PageDescriptor {
  path: string
  title: string
  template: PageTemplateName
  order: number
}

type FormBody = Record<string, string | string[] | undefined>
type UiLayout = FragtmlLayout<UiTemplateContext, string, typeof MAIN_FRAGMENT>

const PAGES: PageDescriptor[] = [
  { path: '/', title: 'Overview', template: 'overview', order: 1 },
  { path: '/sync-options', title: 'Sync Options', template: 'sync-options', order: 2 },
  { path: '/history', title: 'History', template: 'history', order: 3 },
  { path: '/connections', title: 'Connections', template: 'connections', order: 4 },
  { path: '/remote-debug', title: 'Remote Debug', template: 'remote-debug', order: 5 },
  { path: '/plugins', title: 'Plugins', template: 'plugins', order: 6 },
  { path: '/network-throttle', title: 'Network Throttle', template: 'network-throttle', order: 7 },
  { path: '/help', title: 'Help', template: 'help', order: 8 },
]

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

const emptyBodySchema = {
  type: 'object',
  additionalProperties: true,
} as const

const formActionResponseSchema = {
  200: { type: 'string' },
} as const

const optionActionSchema = {
  body: {
    type: 'object',
    required: ['kind', 'key'],
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: ['ghost', 'form'] },
      key: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const pathActionSchema = {
  body: {
    type: 'object',
    required: ['path'],
    additionalProperties: false,
    properties: {
      path: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const clearActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const idActionSchema = {
  body: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const remoteDebugFileActionSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const remoteDebugActiveActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const overlayGridUpdateActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      size: { type: 'string' },
      color: { type: 'string' },
      selector: { type: 'string' },
      offsetY: { type: 'string' },
      offsetX: { type: 'string' },
      vertical: { type: 'string', enum: ['true'] },
      horizontal: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const latencyActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      rate: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const networkThrottleCreateActionSchema = {
  body: {
    type: 'object',
    required: ['targetId'],
    additionalProperties: false,
    properties: {
      targetId: { type: 'string' },
      port: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const networkThrottleDestroyActionSchema = {
  body: {
    type: 'object',
    required: ['port'],
    additionalProperties: false,
    properties: {
      port: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const pluginSetActionSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

const pluginSetManyActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const

export async function createUiServer (opts: UiServerOptions): Promise<UiInstance> {
  const fastify = Fastify({ logger: false }).withTypeProvider<JsonSchemaToTsProvider>()
  const publicDir = resolve(__dirname, 'public')
  let userPlugins: UserPluginState[] = opts.getUserPlugins?.() ?? []
  const layout: UiLayout = {
    contentType: 'text/html; charset=utf-8',
    render: (children, context, renderOptions) => {
      return layoutTemplate({ context, children, fragmentId: renderOptions.fragmentId })
    },
  }

  await fastify.register(fastifyFragtml, {
    fragtml: {
      default: html,
      frag,
      html,
      raw,
      render: renderHtml,
    },
    layout,
  })
  await fastify.register(fastifyFormbody)
  await fastify.register(fastifyStatic, { root: publicDir, prefix: '/' })

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

  // Register a real route for each UI page.
  for (const page of PAGES) {
    fastify.get(page.path, { schema: { response: { 200: { type: 'string' } } } }, async (_req, reply) => {
      return renderFullPage(page.path, reply)
    })
  }
  for (const page of getPluginPages(userPlugins)) {
    if (PAGES.some(builtInPage => builtInPage.path === page.path)) continue
    fastify.get(page.path, { schema: { response: { 200: { type: 'string' } } } }, async (_req, reply) => {
      return renderFullPage(page.path, reply)
    })
  }

  fastify.post('/actions/options', { schema: optionActionSchema }, async (req, reply) => {
    const body = req.body
    setOptionFromForm(body.kind, body.key, formBoolean(body))
    return renderActionTarget(body, '/sync-options', reply)
  })

  fastify.post('/actions/history/send', { schema: pathActionSchema }, async (req, reply) => {
    opts.sendBrowserLocation(makeBrowserLocationMessage(req.body.path, opts.serverUrl, opts.mode ?? 'server'))
    return renderActionTarget(req.body, '/history', reply)
  })

  fastify.post('/actions/history/remove', { schema: pathActionSchema }, async (req, reply) => {
    removeHistoryPath(req.body.path)
    return renderActionTarget(req.body, '/history', reply)
  })

  fastify.post('/actions/history/clear', { schema: clearActionSchema }, async (req, reply) => {
    visitedPaths = []
    broadcastUpdate({ history: [] })
    return renderActionTarget(req.body, '/history', reply)
  })

  fastify.post('/actions/connections/highlight', { schema: idActionSchema }, async (req, reply) => {
    opts.highlightClient(req.body.id)
    return renderActionTarget(req.body, '/connections', reply)
  })

  fastify.post('/actions/remote-debug/file', { schema: remoteDebugFileActionSchema }, async (req, reply) => {
    setRemoteDebugFile(req.body.name, formBoolean(req.body))
    return renderActionTarget(req.body, '/remote-debug', reply)
  })

  fastify.post('/actions/remote-debug/overlay-grid', { schema: remoteDebugActiveActionSchema }, async (req, reply) => {
    setOverlayGrid(formBoolean(req.body))
    return renderActionTarget(req.body, '/remote-debug', reply)
  })

  fastify.post('/actions/remote-debug/overlay-grid/update', { schema: overlayGridUpdateActionSchema }, async (req, reply) => {
    const patch: Partial<OverlayGridState> = {
      vertical: formBoolean(req.body, 'vertical'),
      horizontal: formBoolean(req.body, 'horizontal'),
    }
    if (req.body.size !== undefined) patch.size = req.body.size
    if (req.body.color !== undefined) patch.color = req.body.color
    if (req.body.selector !== undefined) patch.selector = req.body.selector
    if (req.body.offsetY !== undefined) patch.offsetY = req.body.offsetY
    if (req.body.offsetX !== undefined) patch.offsetX = req.body.offsetX
    updateOverlayGrid(patch)
    return renderActionTarget(req.body, '/remote-debug', reply)
  })

  fastify.post('/actions/remote-debug/no-cache', { schema: remoteDebugActiveActionSchema }, async (req, reply) => {
    remoteDebug = { ...remoteDebug, noCache: { active: formBoolean(req.body) } }
    opts.setNoCache(remoteDebug.noCache.active)
    broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
    return renderActionTarget(req.body, '/remote-debug', reply)
  })

  fastify.post('/actions/remote-debug/latency', { schema: latencyActionSchema }, async (req, reply) => {
    remoteDebug = {
      ...remoteDebug,
      latency: {
        active: formBoolean(req.body),
        rate: parseNumber(req.body.rate, remoteDebug.latency.rate),
      },
    }
    opts.setLatency(remoteDebug.latency.active ? remoteDebug.latency.rate * 1000 : 0)
    broadcastUpdate({ remoteDebug: cloneRemoteDebug(remoteDebug) })
    return renderActionTarget(req.body, '/remote-debug', reply)
  })

  fastify.post('/actions/network-throttle/create', { schema: networkThrottleCreateActionSchema }, async (req, reply) => {
    await createNetworkThrottleServer(req.body.targetId, req.body.port ?? '')
    return renderActionTarget(req.body, '/network-throttle', reply)
  })

  fastify.post('/actions/network-throttle/destroy', { schema: networkThrottleDestroyActionSchema }, async (req, reply) => {
    await destroyNetworkThrottleServer(Number(req.body.port))
    return renderActionTarget(req.body, '/network-throttle', reply)
  })

  fastify.post('/actions/plugins/set', { schema: pluginSetActionSchema }, async (req, reply) => {
    const plugin = userPlugins.find(item => item.name === req.body.name)
    if (plugin) setUserPlugin({ ...plugin, active: formBoolean(req.body) })
    return renderActionTarget(req.body, '/plugins', reply)
  })

  fastify.post('/actions/plugins/set-many', { schema: pluginSetManyActionSchema }, async (req, reply) => {
    setManyUserPlugins(formBoolean(req.body))
    return renderActionTarget(req.body, '/plugins', reply)
  })

  fastify.post('/actions/ui-event', { schema: { body: emptyBodySchema, response: formActionResponseSchema } }, async (req, reply) => {
    const event = req.body as FormBody
    const namespace = formString(event['namespace'])
    if (namespace) {
      opts.handleUiEvent?.({
        namespace,
        event: formString(event['event']),
        data: formString(event['data']),
      })
    }
    return renderActionTarget(event, '/plugins', reply)
  })

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
        handleUiClientMessage(msg).catch(() => {})
      } catch {
        // Ignore malformed UI client messages.
      }
    })
  })

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
    addHistoryPath(opts.mode === 'snippet' ? (info.href ?? info.path ?? info.pathname) : (info.path || info.pathname))
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
      fastify.server.closeIdleConnections?.()
      fastify.server.closeAllConnections?.()
      await fastify.close()
    },
  }

  async function handleUiClientMessage (msg: UiClientMessage): Promise<void> {
    if (msg.type === 'options:set') {
      const options = opts.setRuntimeOptions(msg.data)
      broadcastUpdate({ options })
    } else if (msg.type === 'history:send-all') {
      opts.sendBrowserLocation(makeBrowserLocationMessage(msg.path, opts.serverUrl, opts.mode ?? 'server'))
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
      await createNetworkThrottleServer(msg.targetId, msg.port ?? '')
    } else if (msg.type === 'network-throttle:destroy') {
      await destroyNetworkThrottleServer(msg.port)
    } else if (msg.type === 'plugins:set') {
      setUserPlugin(msg.plugin)
    } else if (msg.type === 'plugins:set-many') {
      setManyUserPlugins(msg.active)
    } else if (msg.type === 'ui:event') {
      opts.handleUiEvent?.(msg)
    }
  }

  async function renderFullPage (path: string, reply: FastifyReply): Promise<FastifyReply> {
    const descriptor = getPage(path)
    const context = buildPageContext(path)
    const body = await reply.render(getUiPageTemplate(descriptor.template), context)
    return reply.send(body)
  }

  async function renderFragment (path: string, reply: FastifyReply): Promise<FastifyReply> {
    const descriptor = getPage(path)
    const body = await reply.render(getUiPageTemplate(descriptor.template), buildPageContext(path), {
      fragmentId: MAIN_FRAGMENT,
    })
    return reply.send(body)
  }

  function renderActionTarget (body: { returnTo?: string } | FormBody, fallback: string, reply: FastifyReply): Promise<FastifyReply> {
    return renderFragment(normalizeReturnPath(formString(body.returnTo) || fallback), reply)
  }

  function buildPageContext (path: string): UiTemplateContext {
    const state = buildState()
    const page = getPage(path)
    const pluginPage = state.plugins.find(plugin => normalizePagePath(plugin.page?.path) === path)
    return {
      ...state,
      title: page.title,
      path,
      navLinks: getNavLinks(path, state.plugins),
      urls: getUrlInfos(state),
      connectionsDisplay: state.connections.map(client => ({
        ...client,
        browserLabel: `${client.browser.name}${client.browser.version ? ` ${client.browser.version}` : ''}`,
        connectedAgo: timeAgo(client.connectedAt),
      })),
      historyDisplay: state.history.map(entry => ({
        ...entry,
        url: new URL(entry.path, state.serverUrl).href,
      })),
      syncOptions: getSyncOptions(state.options),
      throttleTargets: [...state.networkThrottle.targets].sort((a, b) => a.order - b.order),
      throttleServers: Object.values(state.networkThrottle.servers).sort((a, b) => a.port - b.port),
      pluginPage,
      remoteDebug: state.remoteDebug,
      networkThrottle: state.networkThrottle,
    }
  }

  function getPage (path: string): PageDescriptor {
    const normalized = normalizePagePath(path) ?? '/'
    const builtIn = PAGES.find(page => page.path === normalized)
    if (builtIn) return builtIn
    const plugin = userPlugins.find(item => normalizePagePath(item.page?.path) === normalized)
    if (plugin?.page) {
      return {
        path: normalized,
        title: plugin.page.title,
        template: 'plugin-page',
        order: plugin.page.order ?? Number.MAX_SAFE_INTEGER,
      }
    }
    return PAGES[0]!
  }

  function setOptionFromForm (kind: 'ghost' | 'form', key: string, active: boolean): void {
    if (kind === 'form') {
      const options = opts.setRuntimeOptions({ ghostMode: { forms: { [key]: active } } })
      broadcastUpdate({ options })
      return
    }
    const options = opts.setRuntimeOptions({ ghostMode: { [key]: active } })
    broadcastUpdate({ options })
  }

  function addHistoryPath (path: string): void {
    const normalized = normalizeHistoryPath(path, opts.serverUrl, opts.mode ?? 'server')
    if (!normalized) return
    if (visitedPaths.includes(normalized)) return
    visitedPaths = [...visitedPaths, normalized]
    broadcastUpdate({ history: decorateHistory(visitedPaths) })
  }

  function removeHistoryPath (path: string): void {
    const normalized = normalizeHistoryPath(path, opts.serverUrl, opts.mode ?? 'server')
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
        ...removeUndefined(data),
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

function getNavLinks (path: string, plugins: UserPluginState[]): NavLink[] {
  const builtIn = PAGES.map(page => ({
    href: page.path,
    label: page.title,
    active: page.path === path,
    order: page.order,
  }))
  const pluginLinks = getPluginPages(plugins)
    .filter(page => !PAGES.some(builtInPage => builtInPage.path === page.path))
    .map(page => ({
      href: page.path,
      label: page.title,
      active: page.path === path,
      order: page.order ?? Number.MAX_SAFE_INTEGER,
    }))
  return [...builtIn, ...pluginLinks].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

function getUrlInfos (state: UiState): UrlInfo[] {
  const externalUrl = `http://${state.localIp}:${state.port}`
  return [
    {
      title: 'Local',
      tagline: 'URL for the machine running this server',
      url: state.serverUrl,
      sync: state.mode !== 'snippet',
      path: getUrlPath(state.serverUrl, '/'),
    },
    {
      title: 'External',
      tagline: 'Other devices on the same network',
      url: externalUrl,
      sync: state.mode !== 'snippet',
      path: getUrlPath(externalUrl, '/'),
    },
    ...(state.tunnelUrl
      ? [{
          title: 'Tunnel',
          tagline: 'Public URL for remote devices',
          url: state.tunnelUrl,
          sync: state.mode !== 'snippet',
          path: getUrlPath(state.tunnelUrl, '/'),
        }]
      : []),
    {
      title: 'UI',
      tagline: 'Control panel for this domstack-sync instance',
      url: state.uiUrl,
      sync: false,
      path: getUrlPath(state.uiUrl, '/'),
    },
  ]
}

function getSyncOptions (options: ClientRuntimeOptions): SyncOption[] {
  return [
    { kind: 'ghost', key: 'scroll', label: 'Scroll sync', description: 'Synchronise scroll position across browsers', active: options.ghostMode.scroll },
    { kind: 'ghost', key: 'clicks', label: 'Click sync', description: 'Mirror clicks across browsers', active: options.ghostMode.clicks },
    { kind: 'ghost', key: 'location', label: 'Location sync', description: 'Send connected browsers to the same URL', active: options.ghostMode.location },
    { kind: 'form', key: 'inputs', label: 'Text input sync', description: 'Synchronise input and textarea key changes', active: options.ghostMode.forms.inputs },
    { kind: 'form', key: 'toggles', label: 'Toggle sync', description: 'Synchronise checkbox, radio, and select changes', active: options.ghostMode.forms.toggles },
    { kind: 'form', key: 'submit', label: 'Submit sync', description: 'Synchronise form submit and reset actions', active: options.ghostMode.forms.submit },
  ]
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

function normalizeHistoryPath (path: string, serverUrl: string, mode: UiMode): string {
  try {
    const parsed = new URL(path, serverUrl)
    if (mode === 'snippet') return parsed.href
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return ''
  }
}

function normalizeReturnPath (path: string): string {
  const normalized = normalizePagePath(path)
  return normalized ?? '/'
}

function normalizePagePath (path: string | undefined): string | null {
  if (!path) return null
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.split('?')[0] || '/'
}

function makeBrowserLocationMessage (path: string, serverUrl: string, mode: UiMode): BrowserLocationMessage {
  const parsed = new URL(path, serverUrl)
  if (mode === 'snippet') {
    return {
      type: 'browser:location',
      override: true,
      url: parsed.href,
    }
  }
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

function formBoolean (body: { active?: string } | FormBody, key = 'active'): boolean {
  const value = (body as FormBody)[key]
  return Array.isArray(value) ? value.includes('true') : value === 'true'
}

function formString (value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseNumber (value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function removeUndefined<T extends Record<string, unknown>> (input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>
}

function getUrlPath (url: string, fallback: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

function timeAgo (ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}
