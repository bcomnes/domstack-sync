import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type {
  BrowserSyncPluginApi,
  BrowserSyncPluginEntry,
  BrowserSyncPluginFunction,
  BrowserSyncPluginHooks,
  BrowserSyncPluginModule,
  BrowserSyncPluginPage,
  PluginMiddleware,
  PluginUiEvent,
  PluginUiEventMap,
} from './plugin-types.ts'
import type { FileWatchEntry } from './options.ts'
import type { UiElementDescriptor } from './protocol.ts'
import type { UserPluginState } from './ui/types.ts'

interface ResolvedPlugin {
  name: string
  title: string
  moduleName?: string
  modulePath?: string
  module: BrowserSyncPluginModule
  options: Record<string, unknown>
  active: boolean
  ui: PluginUiAssets
}

interface PluginUiAssets {
  markup?: string
  page?: BrowserSyncPluginPage
  templates: Record<string, string>
  clientJs: Record<string, string>
}

interface ClientJsAsset {
  pluginName: string
  id: string
  src: string
  content: string
}

const moduleResolver = createRequire(import.meta.url)

export class BsPluginManager {
  private readonly plugins: ResolvedPlugin[]
  private readonly uiListeners = new Map<string, PluginUiEventMap>()
  private clientJsAssets: ClientJsAsset[] = []
  private clientEventNames = new Map<string, string[]>()
  private clientElements = new Map<string, UiElementDescriptor[]>()

  constructor (plugins: ResolvedPlugin[]) {
    this.plugins = plugins
  }

  static async fromEntries (entries: BrowserSyncPluginEntry[], cwd: string): Promise<BsPluginManager> {
    const plugins: ResolvedPlugin[] = []
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      if (entry !== undefined) plugins.push(await resolvePluginEntry(entry, cwd, index))
    }
    return new BsPluginManager(plugins)
  }

  async init (api: BrowserSyncPluginApi): Promise<void> {
    for (const plugin of this.plugins) {
      const pluginApi = this.withUiApi(api)
      await plugin.module.plugin?.(pluginApi, plugin.options)
    }
    this.clientJsAssets = this.collectClientJsAssets(api)
    this.clientEventNames = this.collectClientEvents(api)
    this.clientElements = this.collectClientElements(api)
    this.collectPluginPages(api)
  }

  getUserPlugins (): UserPluginState[] {
    return this.plugins.map(plugin => {
      const state: UserPluginState = {
        name: plugin.name,
        title: plugin.title,
        active: plugin.active,
        opts: { ...plugin.options },
        templates: { ...plugin.ui.templates },
        clientJs: { ...plugin.ui.clientJs },
      }
      if (plugin.ui.markup !== undefined) state.markup = plugin.ui.markup
      if (plugin.ui.page !== undefined) state.page = { ...plugin.ui.page }
      return state
    })
  }

  getUserPlugin (name: string): UserPluginState | undefined {
    return this.getUserPlugins().find(plugin => plugin.name === name)
  }

  setActive (name: string, active: boolean): UserPluginState | undefined {
    const plugin = this.plugins.find(item => item.name === name)
    if (!plugin) return undefined
    plugin.active = active
    return this.getUserPlugin(name)
  }

  setOptions (name: string, opts: Record<string, unknown>): UserPluginState | undefined {
    const plugin = this.plugins.find(item => item.name === name)
    if (!plugin) return undefined
    plugin.options = { ...opts }
    return this.getUserPlugin(name)
  }

  getWatchEntries (api: BrowserSyncPluginApi): FileWatchEntry[] {
    const entries: FileWatchEntry[] = []
    for (const plugin of this.plugins) {
      const fromOptions = plugin.options['files']
      if (typeof fromOptions === 'string') entries.push(fromOptions)
      else if (Array.isArray(fromOptions)) entries.push(...fromOptions.filter(isFileWatchEntry))

      const hookValue = resolveHookValue(plugin.module.hooks?.['files:watch'], api)
      if (isFileWatchEntry(hookValue)) entries.push(hookValue)
      else if (Array.isArray(hookValue)) entries.push(...hookValue.filter(isFileWatchEntry))
    }
    return entries
  }

  getMiddlewares (api: BrowserSyncPluginApi): Array<{ pluginName: string; handle: PluginMiddleware }> {
    const middlewares: Array<{ pluginName: string; handle: PluginMiddleware }> = []
    for (const plugin of this.plugins) {
      const hookValue = resolveMiddlewareHook(plugin.module.hooks?.['server:middleware'], api)
      if (isPluginMiddleware(hookValue)) {
        middlewares.push({ pluginName: plugin.name, handle: hookValue })
      } else if (Array.isArray(hookValue)) {
        for (const handle of hookValue) {
          if (isPluginMiddleware(handle)) middlewares.push({ pluginName: plugin.name, handle })
        }
      }
    }
    return middlewares
  }

  getClientJsAssets (): ClientJsAsset[] {
    return this.clientJsAssets.map(asset => ({ ...asset }))
  }

  getClientEvents (): string[] {
    const events: string[] = []
    for (const plugin of this.plugins) {
      if (!plugin.active) continue
      for (const event of this.clientEventNames.get(plugin.name) ?? []) {
        if (event && !events.includes(event)) events.push(event)
      }
    }
    return events
  }

  getActiveClientElements (): UiElementDescriptor[] {
    return this.plugins.flatMap(plugin => plugin.active ? this.getClientElements(plugin.name) : [])
  }

  getClientElements (pluginName: string): UiElementDescriptor[] {
    return (this.clientElements.get(pluginName) ?? []).map(element => ({ ...element }))
  }

  handleUiEvent (event: PluginUiEvent): void {
    const listeners = this.uiListeners.get(event.namespace)
    if (!listeners) return

    if (listeners.event) {
      listeners.event(event)
      return
    }

    const handler = event.event ? listeners[event.event] : undefined
    if (handler) {
      handler(event.data, event)
    }
  }

  private withUiApi (api: BrowserSyncPluginApi): BrowserSyncPluginApi {
    return {
      ...api,
      ui: {
        listen: (namespace, events) => {
          const key = Array.isArray(namespace) ? namespace.join(':') : namespace
          this.uiListeners.set(key, events)
        },
      },
    }
  }

  private collectClientJsAssets (api: BrowserSyncPluginApi): ClientJsAsset[] {
    const assets: ClientJsAsset[] = []
    for (const plugin of this.plugins) {
      const hookValue = resolveHookValue(plugin.module.hooks?.['client:js'], api)
      const parts = typeof hookValue === 'string'
        ? [hookValue]
        : Array.isArray(hookValue)
          ? hookValue.filter(item => typeof item === 'string')
          : []
      if (parts.length === 0) continue

      const slug = slugify(plugin.name)
      assets.push({
        pluginName: plugin.name,
        id: `__browser-sync-plugin-${slug}-client-js__`,
        src: `/browser-sync/plugins/${slug}.js`,
        content: parts.join(';\n'),
      })
    }
    return assets
  }

  private collectClientEvents (api: BrowserSyncPluginApi): Map<string, string[]> {
    const events = new Map<string, string[]>()
    for (const plugin of this.plugins) {
      const hookValue = resolveHookValue(plugin.module.hooks?.['client:events'], api)
      const pluginEvents = typeof hookValue === 'string'
        ? [hookValue]
        : Array.isArray(hookValue)
          ? hookValue.filter(item => typeof item === 'string')
          : []
      events.set(plugin.name, [...new Set(pluginEvents.filter(Boolean))])
    }
    return events
  }

  private collectClientElements (api: BrowserSyncPluginApi): Map<string, UiElementDescriptor[]> {
    const elements = new Map<string, UiElementDescriptor[]>()
    for (const plugin of this.plugins) {
      const pluginElements: UiElementDescriptor[] = []
      const clientJs = this.clientJsAssets.find(asset => asset.pluginName === plugin.name)
      if (clientJs) {
        pluginElements.push({ id: clientJs.id, type: 'js', src: clientJs.src })
      }

      const hookValue = resolveHookValue(plugin.module.hooks?.elements, api)
      if (Array.isArray(hookValue)) pluginElements.push(...hookValue)

      elements.set(plugin.name, pluginElements)
    }
    return elements
  }

  private collectPluginPages (api: BrowserSyncPluginApi): void {
    for (const plugin of this.plugins) {
      const hookValue = resolveHookValue(plugin.module.hooks?.page, api)
      if (isPluginPage(hookValue)) plugin.ui.page = { ...hookValue }
    }
  }
}

async function resolvePluginEntry (entry: BrowserSyncPluginEntry, cwd: string, index: number): Promise<ResolvedPlugin> {
  const config = normalizePluginConfig(entry)
  const moduleInfo = await loadPluginModule(config.module, cwd)
  const pluginModule = normalizePluginModule(moduleInfo.module)
  const name = pluginModule['plugin:name'] ?? pluginModule.name ?? moduleInfo.moduleName ?? `plugin-${index + 1}`
  const ui = moduleInfo.modulePath && moduleInfo.moduleName
    ? loadPluginUiAssets(moduleInfo.modulePath)
    : { templates: {}, clientJs: {} }

  const resolved: ResolvedPlugin = {
    name,
    title: pluginModule.title ?? name,
    module: pluginModule,
    options: { ...(moduleInfo.queryOptions ?? {}), ...config.options },
    active: true,
    ui,
  }
  if (moduleInfo.moduleName !== undefined) resolved.moduleName = moduleInfo.moduleName
  if (moduleInfo.modulePath !== undefined) resolved.modulePath = moduleInfo.modulePath
  return resolved
}

function normalizePluginConfig (
  entry: BrowserSyncPluginEntry
): { module: string | BrowserSyncPluginModule | BrowserSyncPluginFunction; options: Record<string, unknown> } {
  if (typeof entry === 'string' || typeof entry === 'function' || isPluginModule(entry)) {
    return { module: entry, options: {} }
  }

  if (entry && typeof entry === 'object' && 'module' in entry) {
    return { module: entry.module, options: entry.options ?? {} }
  }

  throw new Error('Plugin was not configured correctly')
}

async function loadPluginModule (
  moduleOrName: string | BrowserSyncPluginModule | BrowserSyncPluginFunction,
  cwd: string
): Promise<{
  module: BrowserSyncPluginModule | BrowserSyncPluginFunction
  moduleName?: string
  modulePath?: string
  queryOptions?: Record<string, unknown>
}> {
  if (typeof moduleOrName !== 'string') {
    return { module: moduleOrName }
  }

  const { moduleName, queryOptions } = splitPluginSpec(moduleOrName)
  const modulePath = resolveModulePath(moduleName, cwd)
  const loaded = await import(pathToFileURL(modulePath).href)
  return { module: unwrapModule(loaded), moduleName, modulePath, queryOptions }
}

function normalizePluginModule (moduleOrFunction: BrowserSyncPluginModule | BrowserSyncPluginFunction): BrowserSyncPluginModule {
  if (typeof moduleOrFunction === 'function') {
    return {
      plugin: moduleOrFunction,
      'plugin:name': moduleOrFunction.name || 'anonymous-plugin',
    }
  }

  if (!isPluginModule(moduleOrFunction)) {
    throw new Error('Plugin must export a plugin function or plugin module object')
  }

  return moduleOrFunction
}

function unwrapModule (loaded: unknown): BrowserSyncPluginModule | BrowserSyncPluginFunction {
  if (isPluginModule(loaded) || typeof loaded === 'function') return loaded
  if (loaded && typeof loaded === 'object' && 'default' in loaded) {
    const defaultExport = (loaded as { default: unknown }).default
    if (isPluginModule(defaultExport) || typeof defaultExport === 'function') return defaultExport
  }
  return loaded as BrowserSyncPluginModule
}

function splitPluginSpec (spec: string): { moduleName: string; queryOptions: Record<string, unknown> } {
  const [moduleName, query = ''] = spec.split('?')
  const params = new URLSearchParams(query)
  const queryOptions: Record<string, unknown> = {}
  for (const [key, value] of params) {
    const current = queryOptions[key]
    if (current === undefined) queryOptions[key] = value
    else if (Array.isArray(current)) current.push(value)
    else queryOptions[key] = [current, value]
  }
  return { moduleName: moduleName ?? spec, queryOptions }
}

function resolveModulePath (moduleName: string, cwd: string): string {
  try {
    return moduleResolver.resolve(moduleName, { paths: [cwd] })
  } catch {
    const maybe = isAbsolute(moduleName) ? moduleName : resolve(cwd, moduleName)
    if (existsSync(maybe)) return resolveExistingModulePath(maybe)
    throw new Error(`Could not resolve plugin module "${moduleName}"`)
  }
}

function resolveExistingModulePath (candidate: string): string {
  try {
    return moduleResolver.resolve(candidate)
  } catch {
    if (statSync(candidate).isFile()) return candidate
    const packageJson = join(candidate, 'package.json')
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf8')) as {
          module?: string
          main?: string
          exports?: string | Record<string, unknown>
        }
        const entry = typeof pkg.module === 'string'
          ? pkg.module
          : typeof pkg.main === 'string'
            ? pkg.main
            : typeof pkg.exports === 'string'
              ? pkg.exports
              : undefined
        if (entry) {
          const fullPath = resolve(candidate, entry)
          if (existsSync(fullPath)) return fullPath
        }
      } catch {
        // Fall through to common index filenames.
      }
    }
    for (const entry of ['index.mjs', 'index.js']) {
      const fullPath = join(candidate, entry)
      if (existsSync(fullPath)) return fullPath
    }
    return candidate
  }
}

function loadPluginUiAssets (modulePath: string): PluginUiAssets {
  const packageJsonPath = findPackageJson(dirname(modulePath))
  if (!packageJsonPath) return { templates: {}, clientJs: {} }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      'browser-sync:ui'?: {
        hooks?: {
          markup?: string
          page?: BrowserSyncPluginPage
          templates?: string[]
          'client:js'?: string[]
        }
      }
    }
    const hooks = pkg['browser-sync:ui']?.hooks
    if (!hooks) return { templates: {}, clientJs: {} }

    const packageDir = dirname(packageJsonPath)
    const assets: PluginUiAssets = {
      templates: readAssetMap(packageDir, hooks.templates ?? []),
      clientJs: readAssetMap(packageDir, hooks['client:js'] ?? []),
    }
    const markup = hooks.markup ? readOptionalFile(resolve(packageDir, hooks.markup)) : undefined
    if (markup !== undefined) assets.markup = markup
    if (isPluginPage(hooks.page)) assets.page = { ...hooks.page }
    return assets
  } catch {
    return { templates: {}, clientJs: {} }
  }
}

function findPackageJson (start: string): string | null {
  let current = start
  while (true) {
    const candidate = join(current, 'package.json')
    if (existsSync(candidate)) return candidate
    const next = dirname(current)
    if (next === current) return null
    current = next
  }
}

function readAssetMap (baseDir: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.flatMap(file => {
    const fullPath = resolve(baseDir, file)
    const content = readOptionalFile(fullPath)
    return content === undefined ? [] : [[file, content]]
  }))
}

function readOptionalFile (path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function isPluginModule (value: unknown): value is BrowserSyncPluginModule {
  return Boolean(value && typeof value === 'object' && ('plugin' in value || 'hooks' in value || 'plugin:name' in value))
}

function resolveHookValue<T> (value: T | ((bs: BrowserSyncPluginApi) => T | undefined) | undefined, api: BrowserSyncPluginApi): T | undefined {
  return typeof value === 'function'
    ? (value as (bs: BrowserSyncPluginApi) => T | undefined)(api)
    : value
}

function resolveMiddlewareHook (
  value: BrowserSyncPluginHooks['server:middleware'],
  api: BrowserSyncPluginApi
): PluginMiddleware | PluginMiddleware[] | undefined {
  if (typeof value === 'function' && value.length <= 1) {
    return (value as (bs: BrowserSyncPluginApi) => PluginMiddleware | PluginMiddleware[] | undefined)(api)
  }
  return value as PluginMiddleware | PluginMiddleware[] | undefined
}

function isFileWatchEntry (value: unknown): value is FileWatchEntry {
  return typeof value === 'string' || Boolean(value && typeof value === 'object' && 'match' in value)
}

function isPluginMiddleware (value: unknown): value is PluginMiddleware {
  return typeof value === 'function'
}

function isPluginPage (value: unknown): value is BrowserSyncPluginPage {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Partial<BrowserSyncPluginPage>).path === 'string' &&
    typeof (value as Partial<BrowserSyncPluginPage>).title === 'string'
  )
}

function slugify (input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plugin'
}
