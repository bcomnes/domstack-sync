import { Readable } from 'node:stream'
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
} from 'fastify'

export interface InjectorRule {
  match: RegExp
  fn: (snippet: string, match: string) => string
}

export interface RewriteRule {
  match: RegExp | string
  fn: (match: string) => string
}

export interface InjectorOptions {
  enabled?: boolean
  whitelist?: string[]
  blacklist?: string[]
  rule?: InjectorRule
  rewriteRules?: RewriteRule[]
}

async function readStream (stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

export function registerInjector<
  RawServer extends RawServerBase = RawServerDefault,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
  TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault
> (
  fastify: FastifyInstance<
    RawServer,
    RawRequestDefaultExpression<RawServer>,
    RawReplyDefaultExpression<RawServer>,
    Logger,
    TypeProvider
  >,
  snippet: string,
  options: InjectorOptions = {}
): void {
  const rule = options.rule ?? defaultRule()

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (options.enabled === false) return payload
    if (!shouldInjectUrl(request.url, options)) return payload

    const ct = reply.getHeader('content-type') as string | undefined
    if (!ct?.includes('text/html')) return payload

    let html: string
    if (typeof payload === 'string') {
      html = payload
    } else if (Buffer.isBuffer(payload)) {
      html = payload.toString('utf-8')
    } else if (payload instanceof Readable) {
      html = await readStream(payload)
    } else {
      return payload
    }

    const rewritten = applyRewriteRules(html, options.rewriteRules ?? [])
    const injected = rewritten.includes('__bs_script__')
      ? rewritten
      : applySnippetRule(rewritten, snippet, rule, options.rule === undefined)

    // Update content-length to match modified payload
    reply.header('content-length', Buffer.byteLength(injected, 'utf-8'))

    return injected
  })
}

function defaultRule (): InjectorRule {
  return {
    match: /<body[^>]*>/i,
    fn: (snippet, match) => match + snippet,
  }
}

function shouldInjectUrl (url: string, options: InjectorOptions): boolean {
  const pathname = new URL(url, 'http://localhost').pathname
  const whitelist = options.whitelist ?? []
  const blacklist = options.blacklist ?? []

  if (whitelist.length > 0 && !whitelist.some(pattern => pathMatches(pathname, pattern))) return false
  if (blacklist.some(pattern => pathMatches(pathname, pattern))) return false
  return true
}

function pathMatches (pathname: string, pattern: string): boolean {
  const normalized = pattern.startsWith('/') ? pattern : `/${pattern}`
  return pathname === normalized || pathname.startsWith(`${normalized.replace(/\/$/, '')}/`)
}

function applyRewriteRules (html: string, rules: RewriteRule[]): string {
  return rules.reduce((output, rule) => output.replace(rule.match, match => rule.fn(match)), html)
}

function applySnippetRule (html: string, snippet: string, rule: InjectorRule, appendOnMiss: boolean): string {
  let matched = false
  const next = html.replace(rule.match, (match) => {
    matched = true
    return rule.fn(snippet, match)
  })
  if (matched) return next
  return appendOnMiss ? html + snippet : html
}
