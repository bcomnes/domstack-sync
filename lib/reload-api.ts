export interface StreamOptions {
  match?: string | string[]
  once?: boolean
}

export interface ReloadStreamOptions extends StreamOptions {
  stream: true
}

export type ReloadArg = string | string[] | ReloadStreamOptions | undefined

export function isReloadStreamOptions (arg: ReloadArg): arg is ReloadStreamOptions {
  return Boolean(arg && typeof arg === 'object' && !Array.isArray(arg) && arg.stream === true)
}

export function getReloadFiles (arg: ReloadArg): string[] | undefined {
  if (Array.isArray(arg)) return arg
  if (typeof arg === 'string' && arg !== 'undefined') return [arg]
  return undefined
}

export function getReloadArgFromBody (body: { files?: unknown; args?: unknown } | string | string[] | null): ReloadArg {
  if (typeof body === 'string') return body
  if (Array.isArray(body)) return body.every(item => typeof item === 'string') ? body : undefined
  if (!body || typeof body !== 'object') return undefined

  const value = body.files ?? body.args
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) return value
  return undefined
}

export function getLegacyHttpProtocolParams (url: string): { hasParams: boolean; method?: string; args?: ReloadArg } {
  const parsed = new URL(url, 'http://localhost')
  const args = parsed.searchParams.getAll('args')
  const output: { hasParams: boolean; method?: string; args?: ReloadArg } = {
    hasParams: Array.from(parsed.searchParams.keys()).length > 0,
  }
  const method = parsed.searchParams.get('method')
  if (method !== null) output.method = method
  if (args.length > 0) output.args = args.length === 1 ? args[0] : args
  return output
}

export function formatLegacyArg (arg: ReloadArg): string {
  return JSON.stringify(arg) ?? 'undefined'
}
