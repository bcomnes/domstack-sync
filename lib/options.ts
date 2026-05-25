import type { FromSchema, JSONSchema } from 'json-schema-to-ts'
import type { FormsGhostModeOptions, GhostModeOptions, ClientRuntimeOptionsPatch } from './protocol.ts'
import type { BrowserSyncPluginEntry } from './plugin-types.ts'

export interface FileWatchObject {
  match: string | string[]
  options?: Record<string, unknown>
  fn?: (event: string, path: string) => void
}

export type FileWatchEntry = string | FileWatchObject

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

export const bsOptionsSchema = {
  type: 'object',
  properties: {
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    files: {
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
    server: { oneOf: [{ type: 'string' }, { const: false }] },
    ghostMode: ghostModeSchema,
    logLevel: { type: 'string', enum: ['silent', 'info', 'debug'] as const },
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
    watchOptions: { type: 'object', additionalProperties: {} },
    watchEvents: { type: 'array', items: { type: 'string' } },
    plugins: { type: 'array', items: {} },
    cwd: { type: 'string' },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export type GhostModeInput = Partial<Omit<GhostModeOptions, 'forms'>> & {
  forms?: boolean | Partial<FormsGhostModeOptions>
}

export type BsOptionsInput = Omit<FromSchema<typeof bsOptionsSchema>, 'files' | 'ghostMode' | 'plugins'> & {
  files?: FileWatchEntry[]
  ghostMode?: GhostModeInput
  plugins?: BrowserSyncPluginEntry[]
}

export interface BsOptions {
  port: number
  files: FileWatchEntry[]
  server: string | false
  ghostMode: GhostModeOptions
  logLevel: 'silent' | 'info' | 'debug'
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
  watchOptions: Record<string, unknown>
  watchEvents: string[]
  plugins: BrowserSyncPluginEntry[]
  cwd: string
}

export function parseOptions (raw: BsOptionsInput = {}): BsOptions {
  const ghost = raw.ghostMode ?? {}
  return {
    port: raw.port ?? 3000,
    files: raw.files ?? [],
    server: raw.server ?? false,
    ghostMode: {
      scroll: ghost.scroll ?? true,
      clicks: ghost.clicks ?? true,
      location: ghost.location ?? true,
      forms: normalizeFormsGhostMode(ghost.forms),
    },
    logLevel: raw.logLevel ?? 'info',
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
    watchOptions: (raw.watchOptions as Record<string, unknown>) ?? {},
    watchEvents: (raw.watchEvents as string[] | undefined) ?? ['change'],
    plugins: raw.plugins ?? [],
    cwd: raw.cwd ?? process.cwd(),
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
