import Fastify from 'fastify'
import type { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts'
import fastifyStatic from '@fastify/static'
import fastifyCors from '@fastify/cors'
import fastifyMiddie from '@fastify/middie'
import { EventEmitter } from 'node:events'
import { Transform } from 'node:stream'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createNetServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import picomatch from 'picomatch'
import { registerInjector } from './injector.ts'
import { BsSockets } from './sockets.ts'
import { buildSnippet } from './snippet.ts'
import { BsWatcher } from './watcher.ts'
import { findFreePort } from './ports.ts'
import { createThrottleServer } from './throttle-server.ts'
import { getLocalIp } from './ip.ts'
import { createLogger } from './logger.ts'
import { createUiServer } from './ui/server.ts'
import { getReloadDecision } from './reload-decision.ts'
import { applyGhostModePatch, parseOptions } from './options.ts'
import { BsPluginManager } from './plugins.ts'
import {
  clientJsRouteSchema,
  legacyHttpProtocolRouteSchema,
  notifyRouteSchema,
  reloadRouteSchema,
  remoteDebugAssetRouteSchema,
} from './server-schemas.ts'
import {
  formatLegacyArg,
  getLegacyHttpProtocolParams,
  getReloadArgFromBody,
  getReloadFiles,
  isReloadStreamOptions,
  type ReloadArg,
  type StreamOptions,
} from './reload-api.ts'
import { normalizeStaticPrefix, renderDirectoryList } from './static-serving.ts'
import type { BsOptions, BsOptionsInput } from './options.ts'
import type { WatchEvent } from './watcher.ts'
import type { ClientRuntimeOptions, ClientRuntimeOptionsPatch } from './protocol.ts'
import type { NetworkThrottleServerInfo, NetworkThrottleTarget, UserPluginState } from './ui/types.ts'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { BrowserSyncPluginApi, PluginMiddleware, PluginMiddlewareOptions, PluginServeFileOptions } from './plugin-types.ts'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export interface BsInstance {
  url: string
  uiUrl: string | null
  localIp: string
  port: number
  uiPort: number | null
  /** Emits: 'client:connect' (BsClientInfo), 'client:disconnect' (id: string), 'file:change' (WatchEvent) */
  events: EventEmitter
  reload: (files?: ReloadArg) => void | Transform
  notify: (message: string) => void
  stream: (opts?: StreamOptions) => Transform
  exit: () => Promise<void>
  pause: () => void
  resume: () => void
  getUserPlugins: () => UserPluginState[]
  getUserPlugin: (name: string) => UserPluginState | undefined
  serveFile: (path: string, props: PluginServeFileOptions) => string
  addMiddleware: (route: string, handle: PluginMiddleware, opts?: PluginMiddlewareOptions) => string | undefined
  removeMiddleware: (id: string) => void
}

interface StreamChunk {
  path?: string
}

interface RuntimeMiddlewareEntry {
  id: string
  active: boolean
  pluginName?: string
}

interface RuntimeMiddlewareOptions extends PluginMiddlewareOptions {
  exact?: boolean
}

export async function createServer (rawOpts: BsOptionsInput | BsOptions = {}): Promise<BsInstance> {
  const opts = parseOptions(rawOpts)
  const logger = opts.logger ?? createLogger(opts.logLevel)
  const port = await findFreePort(opts.port)
  const localIp = getLocalIp()
  const events = new EventEmitter()

  const fastify = Fastify(opts.logLevel === 'debug'
    ? { loggerInstance: logger.pino.child({ component: 'fastify' }) }
    : { logger: false }).withTypeProvider<JsonSchemaToTsProvider>()
  let noCacheEnabled = false
  let responseLatencyMs = 0
  const runtimeMiddlewares: RuntimeMiddlewareEntry[] = []
  const cleanupTasks: Array<() => void | Promise<void>> = []
  let middlewareId = 0
  let servedFileId = 0
  let configuringPlugin = false
  const instance = {} as BsInstance

  await fastify.register(fastifyMiddie, { hook: 'onRequest' })

  fastify.addHook('onRequest', async () => {
    if (responseLatencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, responseLatencyMs))
    }
  })

  fastify.addHook('onSend', async (_req, reply, payload) => {
    if (noCacheEnabled) {
      reply.header('cache-control', 'no-cache, no-store, must-revalidate')
      reply.header('pragma', 'no-cache')
      reply.header('expires', '0')
    }
    return payload
  })

  if (opts.cors) {
    await fastify.register(fastifyCors)
  }

  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string }
  const snippet = buildSnippet({ port, version: pkg.version })
  registerInjector(fastify, snippet, {
    enabled: opts.snippet,
    whitelist: opts.snippetOptions.whitelist,
    blacklist: opts.snippetOptions.blacklist,
    rewriteRules: opts.rewriteRules,
    ...(opts.snippetOptions.rule ? { rule: opts.snippetOptions.rule } : {}),
  })
  const serverRoots = opts.server !== false
    ? opts.server.baseDir.map(root => resolve(opts.cwd, root))
    : []
  const serverRoot = serverRoots[0] ?? null
  const pluginManager = await BsPluginManager.fromEntries(opts.plugins, opts.cwd)

  // Serve the client bundle
  fastify.get('/__bs/client.js', { schema: clientJsRouteSchema }, async (_req, reply) => {
    const clientPath = resolve(__dirname, 'client/dist/browser-sync-client.js')
    const content = readFileSync(clientPath, 'utf8')
    reply.header('content-type', 'application/javascript; charset=utf-8')
    return reply.send(content)
  })

  const remoteDebugAssets = [
    { path: '/browser-sync/pesticide.css', file: fileURLToPath(import.meta.resolve('pesticide/css/pesticide.css')) },
    { path: '/browser-sync/pesticide-depth.css', file: fileURLToPath(import.meta.resolve('pesticide/css/pesticide-depth.css')) },
  ]

  for (const asset of remoteDebugAssets) {
    fastify.get(asset.path, { schema: remoteDebugAssetRouteSchema }, async (_req, reply) => {
      reply.header('content-type', 'text/css; charset=utf-8')
      return reply.send(readFileSync(asset.file, 'utf8'))
    })
  }

  // HTTP reload API
  fastify.post('/__bs/reload', { schema: reloadRouteSchema }, async (req, reply) => {
    const body = req.body as { files?: unknown; args?: unknown } | string | string[] | null
    scheduleReloadArg(getReloadArgFromBody(body))
    return reply.send({ ok: true })
  })

  fastify.get('/__browser_sync__', { schema: legacyHttpProtocolRouteSchema }, async (req, reply) => {
    const params = getLegacyHttpProtocolParams(req.url)

    if (!params.hasParams) {
      reply.code(500).header('content-type', 'text/plain; charset=utf-8')
      return reply.send([
        'Error: No Parameters were provided.',
        'Example: http://localhost:3000/__browser_sync__?method=reload&args=core.css',
      ].join('\n'))
    }

    if (params.method !== 'reload') {
      reply.code(404).header('content-type', 'text/plain; charset=utf-8')
      return reply.send(`Public API method \`${params.method ?? ''}\` not found.`)
    }

    scheduleReloadArg(params.args)
    reply.header('content-type', 'text/plain; charset=utf-8')
    return reply.send([
      'Called public API method `.reload()`',
      `With args: ${formatLegacyArg(params.args)}`,
    ].join('\n'))
  })

  // HTTP notify API
  fastify.post('/__bs/notify', { schema: notifyRouteSchema }, async (req, reply) => {
    const body = req.body as { message?: string } | null
    const message = typeof body?.message === 'string' ? body.message : ''
    doNotify(message)
    return reply.send({ ok: true })
  })

  // Static file serving
  if (opts.server !== false) {
    for (const [route, root] of Object.entries(opts.server.routes)) {
      await fastify.register(fastifyStatic, {
        root: resolve(opts.cwd, root),
        prefix: normalizeStaticPrefix(route),
        decorateReply: false,
        index: opts.server.index,
      })
    }

    await fastify.register(fastifyStatic, {
      root: serverRoots,
      prefix: '/',
      decorateReply: false,
      index: opts.server.index,
      ...(opts.server.directory && serverRoots.length === 1
        ? { list: { format: 'html' as const, render: renderDirectoryList } }
        : {}),
    })
  }

  function getRuntimeOptions (): ClientRuntimeOptions {
    return {
      ghostMode: opts.ghostMode,
      notify: opts.notify,
      codeSync: opts.codeSync,
      injectChanges: opts.injectChanges,
      injectFileTypes: opts.injectFileTypes,
      tagNames: opts.tagNames,
      scrollElements: opts.scrollElements,
      scrollElementMapping: opts.scrollElementMapping,
      scrollProportionally: opts.scrollProportionally,
      scrollThrottle: opts.scrollThrottle,
    }
  }

  function setRuntimeOptions (patch: ClientRuntimeOptionsPatch): ClientRuntimeOptions {
    if (patch.ghostMode) {
      opts.ghostMode = applyGhostModePatch(opts.ghostMode, patch.ghostMode)
    }
    if (patch.notify !== undefined) opts.notify = patch.notify
    if (patch.codeSync !== undefined) opts.codeSync = patch.codeSync
    if (patch.injectChanges !== undefined) opts.injectChanges = patch.injectChanges
    if (patch.injectFileTypes !== undefined) opts.injectFileTypes = patch.injectFileTypes
    if (patch.tagNames !== undefined) opts.tagNames = patch.tagNames
    if (patch.scrollElements !== undefined) opts.scrollElements = patch.scrollElements
    if (patch.scrollElementMapping !== undefined) opts.scrollElementMapping = patch.scrollElementMapping
    if (patch.scrollProportionally !== undefined) opts.scrollProportionally = patch.scrollProportionally
    if (patch.scrollThrottle !== undefined) opts.scrollThrottle = patch.scrollThrottle

    const runtimeOptions = getRuntimeOptions()
    sockets.broadcast({ type: 'options', data: runtimeOptions })
    return runtimeOptions
  }

  let lastFileBroadcastAt = 0
  let publicReloadDebounceTimer: ReturnType<typeof setTimeout> | null = null
  let hasPendingPublicReload = false
  let pendingPublicReloadFiles: string[] | undefined
  const reloadDelayTimers = new Set<ReturnType<typeof setTimeout>>()

  // WebSocket support
  const sockets = new BsSockets({
    logger,
    getRuntimeOptions,
    getPluginClientEvents: () => pluginManager.getClientEvents(),
  })
  const pluginApi = createPluginApi()
  await pluginManager.init(pluginApi)
  events.on('plugins:configure', (data: unknown) => {
    if (configuringPlugin) return
    if (!data || typeof data !== 'object') return
    const plugin = data as Partial<UserPluginState>
    if (typeof plugin.name !== 'string' || typeof plugin.active !== 'boolean') return
    configureUserPlugin(plugin as UserPluginState, false)
  })
  events.on('plugins:opts', (data: unknown) => {
    if (!data || typeof data !== 'object') return
    const plugin = data as { name?: unknown; opts?: unknown }
    if (typeof plugin.name !== 'string' || !plugin.opts || typeof plugin.opts !== 'object') return
    if (pluginManager.setOptions(plugin.name, plugin.opts as Record<string, unknown>)) {
      broadcastPluginState()
    }
  })
  for (const asset of pluginManager.getClientJsAssets()) {
    fastify.get(asset.src, { schema: clientJsRouteSchema }, async (_req, reply) => {
      reply.header('content-type', 'application/javascript; charset=utf-8')
      return reply.send(asset.content)
    })
  }
  for (const middleware of pluginManager.getMiddlewares(pluginApi)) {
    addRuntimeMiddleware('*', middleware.handle, { id: `plugin-${middleware.pluginName}-middleware` }, middleware.pluginName)
  }

  // Forward socket events onto the public EventEmitter
  sockets.on('client:connect', (info) => {
    const context = { browser: info.browser.name, version: info.browser.version, id: info.id }
    if (opts.logConnections) logger.info(context, 'Browser connected')
    else logger.debug(context, 'Browser connected')
    events.emit('client:connect', info)
    sendPluginElementsToClient(info.id)
  })
  sockets.on('client:disconnect', (id) => {
    if (opts.logConnections) logger.info({ id }, 'Browser disconnected')
    else logger.debug({ id }, 'Browser disconnected')
    events.emit('client:disconnect', id)
  })
  sockets.on('client:update', (info) => events.emit('client:update', info))

  fastify.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if ((req.url ?? '').startsWith('/__bs')) {
      sockets.handleUpgrade(req, socket, head)
    }
  })

  // File watcher
  let watcher: BsWatcher | null = null
  let paused = false
  const watchFiles = [...opts.files, ...pluginManager.getWatchEntries(pluginApi)]

  function logFileEvent (evt: WatchEvent): void {
    logger.info({ event: evt.event, path: evt.path, namespace: evt.namespace }, 'File event')
  }

  if (watchFiles.length > 0) {
    watcher = new BsWatcher({
      files: watchFiles,
      cwd: opts.cwd,
      debounceMs: opts.reloadDebounce,
      watchOptions: opts.watchOptions,
      watchEvents: opts.watchEvents,
      fnContext: instance,
    })

    watcher.on('changes', (batch: WatchEvent[]) => {
      if (paused) return
      for (const evt of batch) {
        logFileEvent(evt)
        events.emit('file:change', evt)
      }
      scheduleFileBroadcast(batch.map(evt => evt.path))
    })
  }

  await fastify.listen({ port, host: '0.0.0.0' })

  const url = `http://localhost:${port}`
  const externalUrl = `http://${localIp}:${port}`
  logger.info({ url }, `Server started at ${url}`)

  // UI panel
  let uiInstance: Awaited<ReturnType<typeof createUiServer>> | null = null
  let uiUrl: string | null = null
  let uiExternalUrl: string | null = null
  const throttleServers = new Map<number, ReturnType<typeof createThrottleServer>>()

  if (opts.ui !== false) {
    const uiPort = typeof opts.ui === 'object'
      ? opts.ui.port
      : await findFreePort(port + 1)
    uiUrl = `http://127.0.0.1:${uiPort}`
    uiExternalUrl = `http://${localIp}:${uiPort}`

    uiInstance = await createUiServer({
      uiPort,
      serverUrl: url,
      uiUrl,
      localIp,
      mainPort: port,
      mode: serverRoot === null ? 'snippet' : 'server',
      snippet: serverRoot === null ? snippet : null,
      serverBaseDirs: serverRoots,
      proxyTarget: null,
      tunnelUrl: null,
      events,
      getConnections: () => sockets.getConnections(),
      getRuntimeOptions,
      setRuntimeOptions,
      sendBrowserLocation: (message) => sockets.broadcast(message),
      highlightClient: (id) => { sockets.sendToClient(id, { type: 'highlight' }) },
      sendUiElementAdd: (element) => sockets.broadcast({ type: 'ui:element:add', element }),
      sendUiElementRemove: (id) => sockets.broadcast({ type: 'ui:element:remove', id }),
      sendOverlayGridCss: (innerHTML) => sockets.broadcast({ type: 'ui:remote-debug:css-overlay-grid', innerHTML }),
      setNoCache: (active) => { noCacheEnabled = active },
      setLatency: (ms) => { responseLatencyMs = ms },
      createThrottleServer: createUiThrottleServer,
      destroyThrottleServer: destroyUiThrottleServer,
      getUserPlugins: () => pluginManager.getUserPlugins(),
      configureUserPlugin,
      handleUiEvent: (event) => pluginManager.handleUiEvent(event),
    })
  }

  logger.urls({ local: url, external: externalUrl, ui: uiUrl, uiExternal: uiExternalUrl })

  if (serverRoots.length > 0) {
    for (const root of serverRoots) {
      logger.info({ root }, 'Serving files')
    }
  }

  if (watchFiles.length > 0) {
    logger.info('Watching files...')
  }

  function broadcastFiles (files?: string[]): void {
    if (!opts.codeSync) return
    const decision = getReloadDecision(files, opts.injectChanges, opts.injectFileTypes)
    if (decision.type === 'file-reload') {
      for (const file of decision.files) {
        sockets.broadcast({ type: 'file-reload', file })
      }
      return
    }
    if (files && files.length > 1) logger.info({ files, count: files.length }, 'Reloading Browsers... (buffered %s events)', files.length)
    else logger.info(files ? { files, count: files.length } : {}, 'Reloading Browsers...')
    sockets.broadcast({ type: 'reload' })
  }

  function scheduleReloadArg (arg: ReloadArg): void {
    const files = getReloadFiles(arg)
    if (files) {
      for (const file of files) {
        const evt = { path: file, event: 'change', namespace: 'core', timestamp: Date.now() } satisfies WatchEvent
        logFileEvent(evt)
        events.emit('file:change', evt)
      }
    }
    queuePublicReload(files)
  }

  function queuePublicReload (files?: string[]): void {
    if (!opts.codeSync) return

    if (!hasPendingPublicReload || files === undefined || pendingPublicReloadFiles === undefined) {
      pendingPublicReloadFiles = files
    } else {
      pendingPublicReloadFiles.push(...files)
    }
    hasPendingPublicReload = true

    const flush = (): void => {
      publicReloadDebounceTimer = null
      if (!hasPendingPublicReload) return

      const files = pendingPublicReloadFiles
      pendingPublicReloadFiles = undefined
      hasPendingPublicReload = false
      scheduleBroadcast(files)
    }

    if (opts.reloadDebounce > 0) {
      if (publicReloadDebounceTimer) clearTimeout(publicReloadDebounceTimer)
      publicReloadDebounceTimer = setTimeout(flush, opts.reloadDebounce)
    } else {
      flush()
    }
  }

  function scheduleBroadcast (files?: string[]): void {
    if (!opts.codeSync) return
    const now = Date.now()
    if (opts.reloadThrottle > 0 && now - lastFileBroadcastAt < opts.reloadThrottle) return
    lastFileBroadcastAt = now

    const doBroadcast = (): void => broadcastFiles(files)
    if (opts.reloadDelay > 0) {
      const timer = setTimeout(() => {
        reloadDelayTimers.delete(timer)
        doBroadcast()
      }, opts.reloadDelay)
      reloadDelayTimers.add(timer)
    } else {
      doBroadcast()
    }
  }

  function scheduleFileBroadcast (files: string[]): void {
    scheduleBroadcast(files)
  }

  function doReload (files?: ReloadArg): void | Transform {
    if (isReloadStreamOptions(files)) return createReloadStream(files)
    scheduleReloadArg(files)
  }

  function doNotify (message: string): void {
    logger.info({ notification: message }, 'Notify')
    sockets.broadcast({ type: 'notify', message })
  }

  function createReloadStream (streamOpts: StreamOptions = {}): Transform {
    const changed: string[] = []
    const changedBasenames: string[] = []
    const matcher = streamOpts.match ? picomatch(streamOpts.match, { dot: true }) : null
    let emitted = false

    return new Transform({
      objectMode: true,
      transform (chunk: StreamChunk, _encoding, callback) {
        const p = chunk?.path ?? ''
        if (p && (!matcher || matcher(p))) {
          if (streamOpts.once === true) {
            if (!emitted) {
              emitted = true
              broadcastFiles()
            }
          } else {
            emitted = true
            changed.push(p)
            changedBasenames.push(basename(p))
            events.emit('file:change', { path: p, event: 'change', namespace: 'core', timestamp: Date.now() } satisfies WatchEvent)
          }
        }
        callback(null, chunk)
      },
      flush (callback) {
        if (streamOpts.once !== true && changed.length > 0) {
          logger.info({ changed, changedBasenames, count: changed.length }, '%s %s changed (%s)', changed.length, changed.length > 1 ? 'files' : 'file', changedBasenames.join(', '))
          events.emit('stream:changed', { changed: changedBasenames })
          broadcastFiles(changed)
        }
        callback()
      },
    })
  }

  function createPluginApi (): BrowserSyncPluginApi {
    return {
      events,
      options: opts,
      getOption: name => opts[name],
      setOption: (name, value) => {
        opts[name] = value
        events.emit('options:set', { path: name, value, options: opts })
        sockets.broadcast({ type: 'options', data: getRuntimeOptions() })
        return opts
      },
      getUserPlugins: () => pluginManager.getUserPlugins(),
      getUserPlugin: name => pluginManager.getUserPlugin(name),
      serveFile: serveRuntimeFile,
      addMiddleware: addRuntimeMiddleware,
      removeMiddleware: removeRuntimeMiddleware,
      registerCleanupTask: (fn) => { cleanupTasks.push(fn) },
      reload: doReload,
      notify: doNotify,
      ui: {
        listen: () => {},
      },
    }
  }

  function serveRuntimeFile (path: string, props: PluginServeFileOptions): string {
    const id = `Browsersync - ${servedFileId++}`
    addRuntimeMiddleware(path, (_req, res) => {
      res.setHeader('content-type', props.type)
      res.end(props.content)
    }, { id, override: true, exact: true })
    return id
  }

  function addRuntimeMiddleware (
    route: string,
    handle: PluginMiddleware,
    middlewareOpts: RuntimeMiddlewareOptions = {},
    pluginName?: string
  ): string | undefined {
    const id = middlewareOpts.id ?? `bs-mw-${middlewareId++}`
    const normalizedRoute = route === '*' ? '' : route
    const entry: RuntimeMiddlewareEntry = {
      id,
      active: true,
    }
    if (pluginName !== undefined) {
      entry.pluginName = pluginName
    }
    runtimeMiddlewares.push(entry)

    const wrapped: PluginMiddleware = (req, res, next) => {
      if (!entry.active) return next()
      if (entry.pluginName && pluginManager.getUserPlugin(entry.pluginName)?.active === false) return next()
      if (middlewareOpts.exact === true && normalizedRoute && getMiddlewarePathname(req) !== normalizedRoute) {
        return next()
      }
      return handle(req, res, next)
    }

    if (normalizedRoute) fastify.use(normalizedRoute, wrapped)
    else fastify.use(wrapped)
    return id
  }

  function removeRuntimeMiddleware (id: string): void {
    const entry = runtimeMiddlewares.find(item => item.id === id)
    if (entry) entry.active = false
  }

  function configureUserPlugin (plugin: UserPluginState, emit = true): void {
    const state = pluginManager.setActive(plugin.name, plugin.active)
    if (!state) return

    for (const element of pluginManager.getClientElements(plugin.name)) {
      if (state.active) sockets.broadcast({ type: 'ui:element:add', element })
      else sockets.broadcast({ type: 'ui:element:remove', id: element.id })
    }
    broadcastPluginState()
    if (!emit) return
    configuringPlugin = true
    try {
      events.emit('plugins:configure', state)
    } finally {
      configuringPlugin = false
    }
  }

  function broadcastPluginState (): void {
    events.emit('plugins:update', pluginManager.getUserPlugins())
  }

  function sendPluginElementsToClient (id: string): void {
    for (const element of pluginManager.getActiveClientElements()) {
      sockets.sendToClient(id, { type: 'ui:element:add', element })
    }
  }

  async function createUiThrottleServer (target: NetworkThrottleTarget, requestedPort: string): Promise<NetworkThrottleServerInfo> {
    const throttlePort = await getThrottlePort(requestedPort)
    const parsedTarget = new URL(url)
    const targetPort = Number(parsedTarget.port || 80)
    const throttle = createThrottleServer({
      target: {
        hostname: parsedTarget.hostname,
        port: targetPort,
      },
      speed: target,
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        throttle.server.off('listening', onListening)
        reject(err)
      }
      const onListening = (): void => {
        throttle.server.off('error', onError)
        resolve()
      }
      throttle.server.once('error', onError)
      throttle.server.once('listening', onListening)
      throttle.server.listen(throttlePort, '0.0.0.0')
    })

    const address = throttle.server.address() as AddressInfo
    throttleServers.set(address.port, throttle)
    return {
      port: address.port,
      speed: { ...target, urls: [] },
      urls: [`http://localhost:${address.port}`, `http://${localIp}:${address.port}`],
    }
  }

  async function destroyUiThrottleServer (port: number): Promise<void> {
    const throttle = throttleServers.get(port)
    if (!throttle) return
    await throttle.close()
    throttleServers.delete(port)
  }

  async function getThrottlePort (requestedPort: string): Promise<number> {
    const trimmed = requestedPort.trim()
    if (/^\d{4,5}$/.test(trimmed)) {
      const portNumber = Number(trimmed)
      if (portNumber >= 1024 && portNumber <= 65535) return portNumber
    }
    return findFreeThrottlePort(port + 1)
  }

  Object.assign(instance, {
    url,
    uiUrl: uiInstance?.uiUrl ?? null,
    localIp,
    port,
    uiPort: uiInstance?.uiPort ?? null,
    events,
    reload: doReload,
    notify: doNotify,
    stream: createReloadStream,
    async exit () {
      logger.debug('Exiting...')
      if (publicReloadDebounceTimer) clearTimeout(publicReloadDebounceTimer)
      for (const timer of reloadDelayTimers) clearTimeout(timer)
      reloadDelayTimers.clear()
      await watcher?.close()
      await uiInstance?.exit()
      await Promise.all(Array.from(throttleServers.values()).map(server => server.close()))
      await Promise.all(cleanupTasks.map(task => task()))
      await sockets.close()
      fastify.server.closeIdleConnections?.()
      fastify.server.closeAllConnections?.()
      await fastify.close()
    },
    pause () { paused = true },
    resume () { paused = false },
    getUserPlugins: () => pluginManager.getUserPlugins(),
    getUserPlugin: name => pluginManager.getUserPlugin(name),
    serveFile: serveRuntimeFile,
    addMiddleware: addRuntimeMiddleware,
    removeMiddleware: removeRuntimeMiddleware,
  } satisfies BsInstance)
  return instance
}

async function findFreeThrottlePort (start: number): Promise<number> {
  for (let candidate = start; candidate < start + 100; candidate++) {
    const port = await tryBindThrottlePort(candidate)
    if (port !== null) return port
  }
  return (await tryBindThrottlePort(0))!
}

function tryBindThrottlePort (port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const server = createNetServer()
    server.once('error', () => resolve(null))
    server.listen(port, '0.0.0.0', () => {
      const addr = server.address() as AddressInfo
      server.close(() => resolve(addr.port))
    })
  })
}

function getMiddlewarePathname (req: IncomingMessage): string {
  const originalUrl = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/'
  return new URL(originalUrl, 'http://localhost').pathname
}
