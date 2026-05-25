#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { printHelpText } from 'argsclopts'
import { createServer } from './server.ts'
import { parseOptions } from './options.ts'
import type { BsOptionsInput } from './options.ts'

const pkgPath = resolve(fileURLToPath(new URL('..', import.meta.url)), 'package.json')

const options = {
  server: {
    type: 'string',
    short: 's',
    help: 'Directory to serve',
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
    help: 'Log level: silent|info|debug',
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
} as const

const { values, positionals } = parseArgs({ options, allowPositionals: true })

const command = positionals[0] ?? 'start'

if (values.help) {
  await printHelpText({ options, pkgPath })
  process.exit(0)
}

if (values.version) {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const pkg = require('../package.json') as { version: string }
  process.stdout.write(`${pkg.version}\n`)
  process.exit(0)
}

if (command === 'init') {
  const config = `// @domstack/sync config
// https://github.com/bcomnes/browser-sync
export default {
  server: '.',
  files: ['**/*.html', '**/*.css', '**/*.js'],
  port: 3000,
}
`
  const dest = resolve(process.cwd(), 'bs-config.js')
  writeFileSync(dest, config)
  process.stdout.write(`Created ${dest}\n`)
  process.exit(0)
}

if (command === 'reload') {
  const port = values.port ? parseInt(values.port, 10) : 3000
  const res = await fetch(`http://localhost:${port}/__bs/reload`, { method: 'POST' })
  if (res.ok) {
    process.stdout.write('Reload sent\n')
  } else {
    process.stderr.write(`Reload failed: ${res.status}\n`)
    process.exit(1)
  }
  process.exit(0)
}

// Load bs-config.js from cwd if present
let fileConfig: BsOptionsInput = {}
try {
  const mod = await import(pathToFileURL(resolve(process.cwd(), 'bs-config.js')).href) as { default?: unknown }
  if (mod.default && typeof mod.default === 'object') {
    fileConfig = mod.default as BsOptionsInput
  }
} catch {
  // No config file — that's fine
}

// Default: start
const opts = parseOptions({
  ...fileConfig,
  ...(values.server !== undefined ? { server: values.server } : {}),
  ...(values.port !== undefined ? { port: parseInt(values.port, 10) } : {}),
  ...(values.files !== undefined ? { files: values.files } : {}),
  ...(values['no-ui'] ? { ui: false } : {}),
  ...(values['no-notify'] ? { notify: false } : {}),
  ...(values.cors ? { cors: values.cors } : {}),
  ...(values['log-level'] !== undefined ? { logLevel: values['log-level'] as 'silent' | 'info' | 'debug' } : {}),
  ...(values['no-ghost-mode'] ? { ghostMode: { scroll: false, clicks: false, location: false, forms: false } } : {}),
})

await createServer(opts)
