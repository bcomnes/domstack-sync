import test from 'node:test'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { createServer as createHttpServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const cliPath = resolve(__dirname, 'cli.ts')

function run (args: string[], cwd = process.cwd()): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }))
  })
}

function runWithTimeout (
  args: string[],
  cwd = process.cwd(),
  ms = 1500
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], { cwd, stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      resolve({ code: null, stdout, stderr, timedOut: true })
    }, ms)
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut: false })
    })
  })
}

function waitForServerUrl (child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`timed out waiting for CLI server start. Output:\n${output}`)), 5000)
    const handleData = (data: Buffer) => {
      output += data.toString()
      const match = output.match(/Server started at (http:\/\/localhost:\d+)/)
      if (!match) return
      const url = match[1]
      if (!url) return
      clearTimeout(timer)
      child.stdout.off('data', handleData)
      child.stderr.off('data', handleData)
      resolve(url)
    }
    child.stdout.on('data', handleData)
    child.stderr.on('data', handleData)
    child.once('error', reject)
  })
}

function closeChild (child: ChildProcessWithoutNullStreams): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }
    child.once('close', () => resolve())
    child.kill()
  })
}

function listen (server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function closeServer (server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => {
      if (err) reject(err)
      else resolve()
    })
  })
}

function connectWs (url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const wsUrl = url.replace(/^http:/, 'ws:') + '/__bs'
    const ws = new WebSocket(wsUrl)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function nextNonOptionsMessage (ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>
      if (message['type'] === 'options') return
      ws.off('error', onError)
      resolve(message)
    }
    const onError = (err: Error) => {
      ws.off('message', onMessage)
      reject(err)
    }
    ws.on('message', onMessage)
    ws.once('error', onError)
  })
}

function withTimeout<T> (label: string, promise: Promise<T>, ms = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

test('cli: --help exits 0 and prints usage', async () => {
  const { code, stdout } = await run(['--help'])
  assert.strictEqual(code, 0)
  assert.ok(stdout.includes('--server') || stdout.includes('--port'), `expected flags in help, got: ${stdout}`)
})

test('cli: --version exits 0 and prints a version string', async () => {
  const { code, stdout } = await run(['--version'])
  assert.strictEqual(code, 0)
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+/)
})

test('cli: init creates domstack-sync.config.mjs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-test-'))
  try {
    const { code } = await run(['init'], dir)
    assert.strictEqual(code, 0)
    const configPath = join(dir, 'domstack-sync.config.mjs')
    assert.ok(existsSync(configPath), 'domstack-sync.config.mjs should be created')
    const config = readFileSync(configPath, 'utf8')
    assert.ok(config.includes('export default'), config)
    assert.ok(!config.includes('module.exports'), config)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('cli: init config is loaded by startup', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-init-start-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>generated config</title>')

  const init = await run(['init'], dir)
  assert.strictEqual(init.code, 0, init.stderr)

  const child = spawn(process.execPath, [
    cliPath,
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const res = await fetch(url)
  assert.strictEqual(res.status, 200)
  assert.ok((await res.text()).includes('generated config'))
})

test('cli: init config is loaded in package type module projects', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-init-esm-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>esm generated config</title>')

  const init = await run(['init'], dir)
  assert.strictEqual(init.code, 0, init.stderr)

  const child = spawn(process.execPath, [
    cliPath,
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const res = await fetch(url)
  assert.strictEqual(res.status, 200)
  assert.ok((await res.text()).includes('esm generated config'))
})

test('cli: domstack-sync.config.mts is loaded with type stripping', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-config-mts-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>mts config</title>')
  writeFileSync(join(dir, 'domstack-sync.config.mts'), [
    "const files: string[] = ['**/*.html']",
    'export default {',
    "  server: '.',",
    '  files,',
    '  port: 3000,',
    '}',
    '',
  ].join('\n'))

  const child = spawn(process.execPath, [
    cliPath,
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const res = await fetch(url)
  assert.strictEqual(res.status, 200)
  assert.ok((await res.text()).includes('mts config'))
})

test('cli: domstack-sync.config.ts is loaded with type stripping in ESM projects', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-config-ts-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ts config</title>')
  writeFileSync(join(dir, 'domstack-sync.config.ts'), [
    "const files: string[] = ['**/*.html']",
    'export default {',
    "  server: '.',",
    '  files,',
    '  port: 3000,',
    '}',
    '',
  ].join('\n'))

  const child = spawn(process.execPath, [
    cliPath,
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const res = await fetch(url)
  assert.strictEqual(res.status, 200)
  assert.ok((await res.text()).includes('ts config'))
})

test('cli: reload forwards --files payload', async () => {
  let body = ''
  let path = ''
  const server = createHttpServer((req, res) => {
    path = req.url ?? ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ ok: true }))
    })
  })

  const port = await listen(server)
  try {
    const { code, stdout, stderr } = await run(['reload', '--port', String(port), '--files', 'a.css'])
    assert.strictEqual(code, 0, stderr)
    assert.ok(stdout.includes('Reload sent'), stdout)
    assert.strictEqual(path, '/__bs/reload')
    assert.deepStrictEqual(JSON.parse(body), { files: ['a.css'] })
  } finally {
    await closeServer(server)
  }
})

test('cli: start supports bare --server as cwd web root', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-cli-bare-server-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>bare server</title>')

  const child = spawn(process.execPath, [
    cliPath,
    '--server',
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const res = await fetch(url)
  assert.strictEqual(res.status, 200)
  assert.ok((await res.text()).includes('bare server'))
})

test('cli: start --watch watches server roots without --files', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-cli-watch-server-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const index = join(dir, 'index.html')
  writeFileSync(index, '<!doctype html><title>watch server</title>')

  const child = spawn(process.execPath, [
    cliPath,
    '--server',
    dir,
    '--watch',
    '--port',
    '0',
    '--no-ui',
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const ws = await connectWs(url)
  t.after(() => ws.close())

  await new Promise(resolve => setTimeout(resolve, 600))
  writeFileSync(index, '<!doctype html><title>watch changed</title>')

  const message = await withTimeout('receive server-root watch reload', nextNonOptionsMessage(ws))
  assert.strictEqual(message['type'], 'reload')
})

test('cli: start treats trailing --files values as watch globs', { timeout: 10000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-cli-files-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>files</title>')
  const first = join(dir, 'a.css')
  const second = join(dir, 'b.css')
  writeFileSync(first, 'body { color: black; }')
  writeFileSync(second, 'body { color: black; }')

  const child = spawn(process.execPath, [
    cliPath,
    '--server',
    dir,
    '--port',
    '0',
    '--no-ui',
    '--files',
    first,
    second,
  ], { cwd: dir, stdio: 'pipe' })
  t.after(() => closeChild(child))

  const url = await waitForServerUrl(child)
  const ws = await connectWs(url)
  t.after(() => ws.close())

  await new Promise(resolve => setTimeout(resolve, 600))
  writeFileSync(second, 'body { color: red; }')

  const message = await withTimeout('receive trailing file reload', nextNonOptionsMessage(ws))
  assert.strictEqual(message['type'], 'file-reload')
  assert.ok(message['file'] && typeof message['file'] === 'object')
  const file = message['file'] as Record<string, unknown>
  assert.strictEqual(file['ext'], 'css')
  assert.strictEqual(file['basename'], 'b.css')
  assert.strictEqual(file['type'], 'inject')
  assert.ok(typeof file['path'] === 'string' && file['path'].endsWith('b.css'))
})

test('cli: invalid domstack-sync.config.mjs exits with an error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-cli-bad-config-'))
  try {
    writeFileSync(join(dir, 'domstack-sync.config.mjs'), 'throw new Error("bad config")\n')
    const result = await runWithTimeout(['--no-ui', '--port', '0', '--log-level', 'silent'], dir)
    assert.strictEqual(result.timedOut, false, `CLI kept running instead of reporting config error.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
    assert.notStrictEqual(result.code, 0)
    assert.match(result.stderr, /domstack-sync\.config\.mjs/)
    assert.match(result.stderr, /bad config/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
