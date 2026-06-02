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
import type { PluginUiEvent } from '../plugin-types.ts'
import type { BsClientInfo } from '../sockets.ts'
import type { BrowserLocationMessage, UiElementDescriptor } from '../protocol.ts'
import type { ClientRuntimeOptions, ClientRuntimeOptionsPatch } from '../protocol.ts'
import type {
  NetworkThrottleServerInfo,
  NetworkThrottleState,
  NetworkThrottleTarget,
  OverlayGridState,
  RemoteDebugState,
  UiState,
  UiServerMessage,
  UiClientMessage,
  UserPluginState,
  UiMode,
} from './types.ts'
import {
  MAIN_FRAGMENT,
  getUiPageTemplate,
  type UiTemplateContext,
} from './templates/index.ts'
import { layoutTemplate } from './templates/layout.ts'
import type { FragtmlLayout } from 'fastify-fragtml'
import {
  PAGES,
  buildPageContext,
  cloneUserPlugins,
  decorateHistory,
  getPage,
  getPluginPages,
  makeBrowserLocationMessage,
  normalizeHistoryPath,
  normalizeReturnPath,
} from './page-model.ts'
import {
  cloneRemoteDebug,
  defaultOverlayGrid,
  fileToElement,
  getOverlayGridCss,
  remoteDebugClientFiles,
} from './remote-debug.ts'
import { cloneNetworkThrottle, throttleTargets } from './network-throttle.ts'
import {
  formBoolean,
  formString,
  parseNumber,
  removeUndefined,
} from './forms.ts'
import type { FormBody } from './forms.ts'
import {
  clearActionSchema,
  emptyBodySchema,
  formActionResponseSchema,
  idActionSchema,
  latencyActionSchema,
  networkThrottleCreateActionSchema,
  networkThrottleDestroyActionSchema,
  optionActionSchema,
  overlayGridUpdateActionSchema,
  pathActionSchema,
  pluginSetActionSchema,
  pluginSetManyActionSchema,
  remoteDebugActiveActionSchema,
  remoteDebugFileActionSchema,
} from './schemas.ts'

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

type UiLayout = FragtmlLayout<UiTemplateContext, string, typeof MAIN_FRAGMENT>

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
    const descriptor = getPage(path, userPlugins)
    const context = buildPageContext(path, buildState())
    const body = await reply.render(getUiPageTemplate(descriptor.template), context)
    return reply.send(body)
  }

  async function renderFragment (path: string, reply: FastifyReply): Promise<FastifyReply> {
    const descriptor = getPage(path, userPlugins)
    const body = await reply.render(getUiPageTemplate(descriptor.template), buildPageContext(path, buildState()), {
      fragmentId: MAIN_FRAGMENT,
    })
    return reply.send(body)
  }

  function renderActionTarget (body: { returnTo?: string } | FormBody, fallback: string, reply: FastifyReply): Promise<FastifyReply> {
    return renderFragment(normalizeReturnPath(formString(body.returnTo) || fallback), reply)
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
