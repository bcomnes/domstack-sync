import test from 'node:test'
import assert from 'node:assert'
import { spawn } from 'node:child_process'
import { mkdtempSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

test('cli: init creates bs-config.js', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-cli-test-'))
  try {
    const { code } = await run(['init'], dir)
    assert.strictEqual(code, 0)
    const configPath = join(dir, 'bs-config.js')
    assert.ok(existsSync(configPath), 'bs-config.js should be created')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
