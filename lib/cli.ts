#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { printHelpText } from 'argsclopts'
import { createServer } from './server.ts'
import { parseOptions } from './options.ts'
import type { BsOptions, BsOptionsInput } from './options.ts'
import { createSessionRegistry } from './session-registry.ts'
import type { SessionRegistration } from './session-registry.ts'

const pkgPath = resolve(fileURLToPath(new URL('..', import.meta.url)), 'package.json')
const configFiles = [
  'domstack-sync.config.mjs',
  'domstack-sync.config.mts',
  'domstack-sync.config.js',
  'domstack-sync.config.ts',
] as const
type CliLogLevel = NonNullable<BsOptionsInput['logLevel']>

const options = {
  server: {
    type: 'string',
    short: 's',
    help: 'Directory to serve',
  },
  watch: {
    type: 'boolean',
    short: 'w',
    help: 'Watch server roots and files',
  },
  ignore: {
    type: 'string',
    multiple: true,
    help: 'Ignore patterns for file watchers',
  },
  port: {
    type: 'string',
    help: 'Port to listen on',
  },
  files: {
    type: 'string',
    multiple: true,
    short: 'f',
    help: 'Glob patterns to watch (repeatable)',
  },
  'no-ui': {
    type: 'boolean',
    help: 'Disable the UI panel',
  },
  'no-notify': {
    type: 'boolean',
    help: 'Disable the notify overlay',
  },
  'no-ghost-mode': {
    type: 'boolean',
    help: 'Disable ghost mode',
  },
  cors: {
    type: 'boolean',
    help: 'Enable CORS headers',
  },
  'log-level': {
    type: 'string',
    help: 'Pino log level (for example: silent, trace, debug, info, warn, error, fatal)',
  },
  'log-connections': {
    type: 'boolean',
    help: 'Log browser connection events at info level',
  },
  help: {
    type: 'boolean',
    short: 'h',
    help: 'Show this help text',
  },
  version: {
    type: 'boolean',
    short: 'v',
    help: 'Show version',
  },
  force: {
    type: 'boolean',
    help: 'Overwrite an existing config when running init',
  },
} as const

type CliCommand = 'start' | 'init' | 'reload'

function getCommand (args: string[]): { command: CliCommand; positionals: string[] } {
  const [first, ...rest] = args
  if (first === 'init' || first === 'reload' || first === 'start') {
    return { command: first, positionals: rest }
  }
  return { command: 'start', positionals: args }
}

function normalizeFileArgs (files: string | string[] | undefined, positionalFiles: string[]): string[] {
  const flagFiles = files === undefined
    ? []
    : Array.isArray(files) ? files : [files]
  return [...flagFiles, ...positionalFiles]
}

function normalizeOptionalServerArg (args: string[]): string[] {
  const output: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === undefined) continue
    output.push(arg)
    if (arg !== '--server' && arg !== '-s') continue

    const next = args[index + 1]
    if (next === undefined || next.startsWith('-')) {
      output.push('.')
    }
  }
  return output
}

function formatError (err: unknown): string {
  return err instanceof Error
    ? err.stack ?? err.message
    : String(err)
}

const args = process.argv.slice(2)
if (args[0] === 'sessions') {
  await showSessions(args.slice(1))
} else {
  await run(args)
}

async function run (args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: normalizeOptionalServerArg(args),
    options,
    allowPositionals: true,
  })

  const { command, positionals: commandPositionals } = getCommand(positionals)

  if (values.help) {
    await printHelpText({ options, pkgPath })
    process.stdout.write('\nUse domstack-sync sessions [id] [--json] to inspect local sessions.\n')
    process.exit(0)
  }

  if (values.version) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
    process.stdout.write(`${pkg.version}\n`)
    process.exit(0)
  }

  if (command === 'init') {
    const config = `// @domstack/sync config
  // https://github.com/bcomnes/domstack-sync
  export default {
    server: '.',
    files: ['**/*.html', '**/*.css', '**/*.js'],
    port: 3000,
  }
  `
    const dest = resolve(process.cwd(), 'domstack-sync.config.mjs')
    if (existsSync(dest) && !values.force) {
      process.stderr.write(`Config already exists: ${dest}\nUse --force to overwrite it.\n`)
      process.exit(1)
    }
    writeFileSync(dest, config)
    process.stdout.write(`Created ${dest}\n`)
    process.exit(0)
  }

  if (command === 'reload') {
    const port = values.port ? parseInt(values.port, 10) : 3000
    const files = normalizeFileArgs(values.files, commandPositionals)
    const body = files.length > 0 ? JSON.stringify({ files }) : undefined
    const res = await fetch(`http://localhost:${port}/__bs/reload`, {
      method: 'POST',
      ...(body
        ? {
            headers: { 'content-type': 'application/json' },
            body,
          }
        : {}),
    })
    if (res.ok) {
      process.stdout.write('Reload sent\n')
    } else {
      process.stderr.write(`Reload failed: ${res.status}\n`)
      process.exit(1)
    }
    process.exit(0)
  }

  // Load config from cwd if present.
  let fileConfig: BsOptionsInput = {}
  const configPath = [
    ...configFiles,
  ].map(file => resolve(process.cwd(), file)).find(existsSync)
  if (configPath) {
    try {
      const mod = await import(pathToFileURL(configPath).href) as { default?: unknown }
      if (mod.default && typeof mod.default === 'object') {
        fileConfig = mod.default as BsOptionsInput
      }
    } catch (err) {
      process.stderr.write(`Failed to load ${configPath}\n${formatError(err)}\n`)
      process.exit(1)
    }
  }

  // Default: start
  const files = normalizeFileArgs(values.files, commandPositionals)
  const opts = parseOptions({
    ...fileConfig,
    ...(values.server !== undefined ? { server: values.server } : {}),
    ...(values.watch ? { watch: true } : {}),
    ...(values.ignore !== undefined ? { ignore: values.ignore } : {}),
    ...(values.port !== undefined ? { port: parseInt(values.port, 10) } : {}),
    ...(files.length > 0 ? { files } : {}),
    ...(values['no-ui'] ? { ui: false } : {}),
    ...(values['no-notify'] ? { notify: false } : {}),
    ...(values.cors ? { cors: values.cors } : {}),
    ...(values['log-level'] !== undefined ? { logLevel: values['log-level'] as CliLogLevel } : {}),
    ...(values['log-connections'] ? { logConnections: true } : {}),
    ...(values['no-ghost-mode'] ? { ghostMode: { scroll: false, clicks: false, location: false, forms: false } } : {}),
  })

  const starting = startRegisteredServer(opts)
  let shutdown: Promise<void> | undefined
  function removeSignals () {
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
  function stop () {
    shutdown ??= starting.then(close => close()).catch(error => {
      process.stderr.write(`Failed to stop domstack-sync: ${formatError(error)}\n`)
      process.exitCode = 1
    }).finally(removeSignals)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    await starting
  } catch (error) {
    removeSignals()
    if (shutdown) await shutdown
    else throw error
  }
}

async function startRegisteredServer (opts: BsOptions): Promise<() => Promise<void>> {
  const warn = (error: unknown) => {
    process.stderr.write(`domstack-sync session registry: ${formatError(error)}\n`)
  }
  let session: SessionRegistration | undefined
  try {
    session = await createSessionRegistry({ onRefreshError: warn }).register({
      kind: 'domstack-sync',
      state: 'starting',
      cwd: resolve(opts.cwd),
      roots: opts.server === false ? [] : opts.server.baseDir.map(root => resolve(opts.cwd, root)),
    })
  } catch (error) {
    warn(error)
  }
  const update = async (patch: Parameters<SessionRegistration['update']>[0]) => {
    await session?.update(patch).catch(warn)
  }
  try {
    const server = await createServer(opts)
    await update({ state: 'watching', port: server.port, uiPort: server.uiPort })
    return async () => {
      try {
        await update({ state: 'stopping' })
        await server.exit()
      } finally {
        await session?.dispose().catch(warn)
      }
    }
  } catch (error) {
    await session?.dispose().catch(warn)
    throw error
  }
}

async function showSessions (args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
  })
  const usage = 'Usage: domstack-sync sessions [id] [--json]\n'
  if (positionals.length > 1) {
    process.stderr.write(usage)
    process.exitCode = 1
    return
  }
  if (values.help) {
    process.stdout.write(usage)
    return
  }
  const registry = createSessionRegistry()
  const [id] = positionals
  const session = id === undefined ? undefined : await registry.get(id)
  if (session === null) {
    process.stderr.write(`No active session: ${id}\n`)
    process.exitCode = 1
    return
  }
  const records = session ?? await registry.list()
  if (values.json) {
    process.stdout.write(`${JSON.stringify(records)}\n`)
    return
  }
  for (const record of Array.isArray(records) ? records : [records]) {
    process.stdout.write(`${record.id}\t${record.kind}\t${record.state}\tpid=${record.pid}\t${record.cwd}\t${record.url ?? '-'}\t${record.uiUrl ?? '-'}\n`)
    if (session) {
      process.stdout.write(`Started: ${new Date(record.startedAt).toISOString()}\n`)
      if (record.source) process.stdout.write(`Source: ${record.source}\n`)
      if (record.destination) process.stdout.write(`Destination: ${record.destination}\n`)
      for (const root of record.roots ?? []) process.stdout.write(`Root: ${root}\n`)
    }
  }
}
