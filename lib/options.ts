import type { FromSchema, JSONSchema } from 'json-schema-to-ts'
import type { FormsGhostModeOptions, GhostModeOptions, ClientRuntimeOptionsPatch } from './protocol.ts'
import type { BrowserSyncPluginEntry } from './plugin-types.ts'
import type { InjectorRule, RewriteRule } from './injector.ts'
import type { LevelWithSilentOrString, Logger as PinoLogger } from 'pino'

export interface FileWatchObject {
  match: string | string[]
  options?: Record<string, unknown>
  fn?: (this: unknown, event: string, path: string) => void
}

export type FileWatchEntry = string | FileWatchObject

export interface ServerOptionsInput {
  baseDir?: string | string[]
  routes?: Record<string, string>
  directory?: boolean
  index?: string | string[]
}

export interface ServerOptions {
  baseDir: string[]
  routes: Record<string, string>
  directory: boolean
  index: string[]
}

type SnippetPathInput = string | string[]

export interface SnippetOptionsInput {
  whitelist?: SnippetPathInput
  blacklist?: SnippetPathInput
  ignorePaths?: SnippetPathInput
  rule?: InjectorRule
}

export interface SnippetOptions {
  whitelist: string[]
  blacklist: string[]
  rule?: InjectorRule
}

const formsGhostModeSchema = {
  type: 'object',
  properties: {
    submit: { type: 'boolean' },
    inputs: { type: 'boolean' },
    toggles: { type: 'boolean' },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export const ghostModeSchema = {
  type: 'object',
  properties: {
    scroll: { type: 'boolean' },
    clicks: { type: 'boolean' },
    location: { type: 'boolean' },
    forms: { oneOf: [{ type: 'boolean' }, formsGhostModeSchema] },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export const defaultInjectFileTypes = ['css', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'map'] as const

export const defaultTagNames: Record<string, string> = {
  less: 'link',
  scss: 'link',
  css: 'link',
  jpg: 'img',
  jpeg: 'img',
  png: 'img',
  svg: 'img',
  gif: 'img',
  webp: 'img',
  js: 'script',
}

export const defaultWatchIgnorePatterns = [
  /node_modules/,
  /bower_components/,
  '.sass-cache',
  '.vscode',
  '.git',
  '.idea',
] as const

export const bsOptionsSchema = {
  type: 'object',
  properties: {
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    files: {
      oneOf: [
        { type: 'string' },
        {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  match: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
                  options: { type: 'object', additionalProperties: {} },
                },
                required: ['match'],
                additionalProperties: true,
              },
            ],
          },
        },
      ],
    },
    server: {
      oneOf: [
        { type: 'string' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
        {
          type: 'object',
          properties: {
            baseDir: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
            routes: { type: 'object', additionalProperties: { type: 'string' } },
            directory: { type: 'boolean' },
            index: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
          },
          additionalProperties: false,
        },
      ],
    },
    ghostMode: { oneOf: [{ type: 'boolean' }, ghostModeSchema] },
    logLevel: { type: 'string' },
    logConnections: { type: 'boolean' },
    ui: {
      oneOf: [
        { type: 'boolean' },
        { type: 'object', properties: { port: { type: 'integer' } }, required: ['port'], additionalProperties: false },
      ],
    },
    notify: { type: 'boolean' },
    cors: { type: 'boolean' },
    reloadDelay: { type: 'number' },
    reloadDebounce: { type: 'number' },
    reloadThrottle: { type: 'number' },
    scrollThrottle: { type: 'number' },
    scrollElements: { type: 'array', items: { type: 'string' } },
    scrollElementMapping: { type: 'array', items: { type: 'string' } },
    scrollProportionally: { type: 'boolean' },
    injectChanges: { type: 'boolean' },
    injectFileTypes: { type: 'array', items: { type: 'string' } },
    tagNames: { type: 'object', additionalProperties: { type: 'string' } },
    codeSync: { type: 'boolean' },
    watch: { type: 'boolean' },
    ignore: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
    snippet: { type: 'boolean' },
    snippetOptions: {
      type: 'object',
      properties: {
        whitelist: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        blacklist: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        ignorePaths: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        rule: { type: 'object', additionalProperties: true },
      },
      additionalProperties: true,
    },
    rewriteRules: { type: 'array', items: {} },
    watchOptions: { type: 'object', additionalProperties: {} },
    watchEvents: { type: 'array', items: { type: 'string' } },
    plugins: { type: 'array', items: {} },
    cwd: { type: 'string' },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export type GhostModeInput = boolean | (Partial<Omit<GhostModeOptions, 'forms'>> & {
  forms?: boolean | Partial<FormsGhostModeOptions>
})

export type BsOptionsInput = Omit<FromSchema<typeof bsOptionsSchema>, 'files' | 'ghostMode' | 'logLevel' | 'plugins' | 'server' | 'snippetOptions' | 'rewriteRules'> & {
  files?: FileWatchEntry | FileWatchEntry[]
  ghostMode?: GhostModeInput
  logger?: PinoLogger | undefined
  logLevel?: LevelWithSilentOrString | undefined
  plugins?: BrowserSyncPluginEntry[]
  server?: string | boolean | string[] | ServerOptionsInput
  snippetOptions?: SnippetOptionsInput
  rewriteRules?: RewriteRule[]
}

export interface BsOptions {
  port: number
  files: FileWatchEntry[]
  server: ServerOptions | false
  ghostMode: GhostModeOptions
  logger?: PinoLogger | undefined
  logLevel: LevelWithSilentOrString
  logConnections: boolean
  ui: boolean | { port: number }
  notify: boolean
  cors: boolean
  reloadDelay: number
  reloadDebounce: number
  reloadThrottle: number
  scrollThrottle: number
  scrollElements: string[]
  scrollElementMapping: string[]
  scrollProportionally: boolean
  injectChanges: boolean
  injectFileTypes: string[]
  tagNames: Record<string, string>
  codeSync: boolean
  watch: boolean
  snippet: boolean
  snippetOptions: SnippetOptions
  rewriteRules: RewriteRule[]
  watchOptions: Record<string, unknown>
  watchEvents: string[]
  plugins: BrowserSyncPluginEntry[]
  cwd: string
}

export function parseOptions (raw: BsOptionsInput = {}): BsOptions {
  const ghost = normalizeGhostMode(raw.ghostMode)
  const server = normalizeServer(raw.server)
  const watch = raw.watch ?? false
  const files = normalizeWatchFiles(normalizeFiles(raw.files), server, watch)
  const watchOptions = normalizeWatchOptions(raw.watchOptions, raw.ignore, watch)
  return {
    port: raw.port ?? 3000,
    files,
    server,
    ghostMode: ghost,
    logger: raw.logger,
    logLevel: raw.logLevel ?? 'info',
    logConnections: raw.logConnections ?? false,
    ui: raw.ui ?? true,
    notify: raw.notify ?? true,
    cors: raw.cors ?? false,
    reloadDelay: raw.reloadDelay ?? 0,
    reloadDebounce: raw.reloadDebounce ?? 500,
    reloadThrottle: raw.reloadThrottle ?? 0,
    scrollThrottle: raw.scrollThrottle ?? 0,
    scrollElements: (raw.scrollElements as string[] | undefined) ?? [],
    scrollElementMapping: (raw.scrollElementMapping as string[] | undefined) ?? [],
    scrollProportionally: raw.scrollProportionally ?? true,
    injectChanges: raw.injectChanges ?? true,
    injectFileTypes: (raw.injectFileTypes as string[] | undefined) ?? [...defaultInjectFileTypes],
    tagNames: { ...defaultTagNames, ...((raw.tagNames as Record<string, string> | undefined) ?? {}) },
    codeSync: raw.codeSync ?? true,
    watch,
    snippet: raw.snippet ?? true,
    snippetOptions: normalizeSnippetOptions(raw.snippetOptions),
    rewriteRules: raw.rewriteRules ?? [],
    watchOptions,
    watchEvents: (raw.watchEvents as string[] | undefined) ?? ['change'],
    plugins: raw.plugins ?? [],
    cwd: raw.cwd ?? process.cwd(),
  }
}

function normalizeFiles (files: FileWatchEntry | FileWatchEntry[] | undefined): FileWatchEntry[] {
  if (files === undefined) return []
  return Array.isArray(files) ? files : [files]
}

function normalizeWatchFiles (files: FileWatchEntry[], server: ServerOptions | false, watch: boolean): FileWatchEntry[] {
  if (!watch || server === false) return files
  return uniqueWatchEntries([
    ...files,
    ...server.baseDir,
    ...Object.values(server.routes),
  ])
}

function uniqueWatchEntries (entries: FileWatchEntry[]): FileWatchEntry[] {
  const seen = new Set<string>()
  const output: FileWatchEntry[] = []
  for (const entry of entries) {
    if (typeof entry !== 'string') {
      output.push(entry)
      continue
    }
    if (seen.has(entry)) continue
    seen.add(entry)
    output.push(entry)
  }
  return output
}

function normalizeServer (server: string | boolean | string[] | ServerOptionsInput | undefined): ServerOptions | false {
  if (server === true) return defaultServerOptions(['./'])
  if (server === false || server === undefined) return false
  if (typeof server === 'string') return defaultServerOptions([server])
  if (Array.isArray(server)) return defaultServerOptions(server)
  return {
    baseDir: normalizeStringArray(server.baseDir ?? './'),
    routes: normalizeRoutes(server.routes),
    directory: server.directory ?? false,
    index: normalizeStringArray(server.index ?? ['index.html', 'index.htm']),
  }
}

function defaultServerOptions (baseDir: string[]): ServerOptions {
  return {
    baseDir,
    routes: {},
    directory: false,
    index: ['index.html', 'index.htm'],
  }
}

function normalizeStringArray (value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value]
}

function normalizeRoutes (routes: Record<string, string> | undefined): Record<string, string> {
  if (!routes) return {}
  return Object.fromEntries(
    Object.entries(routes)
      .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
  )
}

function normalizeWatchOptions (
  watchOptions: Record<string, unknown> | undefined,
  ignore: string | string[] | undefined,
  watch: boolean
): Record<string, unknown> {
  const output = { ...(watchOptions ?? {}) }
  const ignored = uniqueIgnoredPatterns([
    ...normalizeIgnoredPatterns(output['ignored']),
    ...normalizeIgnoredPatterns(ignore),
    ...(watch ? [...defaultWatchIgnorePatterns] : []),
  ])
  if (ignored.length > 0) output['ignored'] = ignored
  return output
}

function normalizeIgnoredPatterns (patterns: unknown): Array<string | RegExp> {
  if (patterns === undefined || patterns === null) return []
  const values = Array.isArray(patterns) ? patterns : [patterns]
  return values.filter((pattern): pattern is string | RegExp => typeof pattern === 'string' || pattern instanceof RegExp)
}

function uniqueIgnoredPatterns (patterns: Array<string | RegExp>): Array<string | RegExp> {
  const seen = new Set<string>()
  const output: Array<string | RegExp> = []
  for (const pattern of patterns) {
    const key = pattern instanceof RegExp ? pattern.toString() : pattern
    if (seen.has(key)) continue
    seen.add(key)
    output.push(pattern)
  }
  return output
}

function normalizeSnippetOptions (options: SnippetOptionsInput | undefined): SnippetOptions {
  const blacklist = [
    ...normalizePathPatterns(options?.blacklist),
    ...normalizePathPatterns(options?.ignorePaths),
  ]
  return {
    whitelist: normalizePathPatterns(options?.whitelist),
    blacklist,
    ...(options?.rule ? { rule: options.rule } : {}),
  }
}

function normalizePathPatterns (patterns: SnippetPathInput | undefined): string[] {
  if (patterns === undefined) return []
  const values = Array.isArray(patterns) ? patterns : [patterns]
  return values.map(pattern => pattern.startsWith('/') ? pattern : `/${pattern}`)
}

function normalizeGhostMode (raw: GhostModeInput | undefined): GhostModeOptions {
  if (typeof raw === 'boolean') {
    return {
      scroll: raw,
      clicks: raw,
      location: raw,
      forms: normalizeFormsGhostMode(raw),
    }
  }

  return {
    scroll: raw?.scroll ?? true,
    clicks: raw?.clicks ?? true,
    location: raw?.location ?? true,
    forms: normalizeFormsGhostMode(raw?.forms),
  }
}

export function normalizeFormsGhostMode (raw: boolean | Partial<FormsGhostModeOptions> | undefined): FormsGhostModeOptions {
  if (typeof raw === 'boolean') {
    return {
      submit: raw,
      inputs: raw,
      toggles: raw,
    }
  }

  return {
    submit: raw?.submit ?? true,
    inputs: raw?.inputs ?? true,
    toggles: raw?.toggles ?? true,
  }
}

export function applyGhostModePatch (current: GhostModeOptions, patch: ClientRuntimeOptionsPatch['ghostMode']): GhostModeOptions {
  if (!patch) return current

  return {
    scroll: patch.scroll ?? current.scroll,
    clicks: patch.clicks ?? current.clicks,
    location: patch.location ?? current.location,
    forms: patch.forms === undefined
      ? current.forms
      : typeof patch.forms === 'boolean'
        ? normalizeFormsGhostMode(patch.forms)
        : {
            submit: patch.forms.submit ?? current.forms.submit,
            inputs: patch.forms.inputs ?? current.forms.inputs,
            toggles: patch.forms.toggles ?? current.forms.toggles,
          },
  }
}
