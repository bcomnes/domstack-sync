import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createSessionRegistry } from '../index.ts'
import type { TestContext } from 'node:test'

async function fixture (t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'dss-registry-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  return { directory, registry: createSessionRegistry({ directory }) }
}

test('registry: concurrent updates and same-PID sessions are tracked independently', async (t) => {
  const { directory, registry } = await fixture(t)
  const reader = createSessionRegistry({ directory })
  const details = { kind: 'domstack-watch', state: 'starting', cwd: directory, source: join(directory, 'src'), destination: join(directory, 'dist') } as const
  const [first, second] = await Promise.all([registry.register(details), registry.register(details)])
  t.after(async () => { await Promise.all([first.dispose(), second.dispose()]) })
  assert.notEqual(first.id, second.id)
  assert.deepEqual((await reader.list()).map(info => info.id).sort(), [first.id, second.id].sort())
  await Promise.all([first.update({ port: 3456 }), first.update({ uiPort: 3457, state: 'watching' })])
  const updated = await reader.get(first.id)
  assert.equal(updated?.pid, process.pid)
  assert.equal(updated?.state, 'watching')
  assert.equal(updated?.url, 'http://localhost:3456')
  assert.equal(updated?.uiUrl, 'http://127.0.0.1:3457')
  assert.equal((await reader.get(second.id))?.port, null)
  const queued = first.update({ state: 'stopping' })
  await Promise.all([queued, first.dispose(), first.dispose()])
  await assert.rejects(first.update({ port: 3458 }), /disposed/)
  assert.equal(await reader.get(first.id), null)
  assert.equal((await reader.list()).length, 1)
})

test('registry: ignores malformed and expired records and never returns unlisted fields', async (t) => {
  const { directory, registry } = await fixture(t)
  const id = randomUUID()
  const expiredId = randomUUID()
  const record = {
    version: 1,
    id,
    kind: 'domstack-sync',
    state: 'watching',
    pid: process.pid,
    startedAt: Date.now(),
    expiresAt: Date.now() + 10_000,
    cwd: directory,
    source: 'relative-source',
    destination: 42,
    roots: [directory, 'relative-root'],
    port: 3456,
    url: 'http://localhost:3456/?token=secret',
    secret: 'secret'
  }
  await Promise.all([
    writeFile(join(directory, `${id}.json`), JSON.stringify(record)),
    writeFile(join(directory, `${expiredId}.json`), JSON.stringify({ ...record, id: expiredId, expiresAt: Date.now() - 1 })),
    writeFile(join(directory, `${randomUUID()}.json`), '{'),
  ])
  const info = await registry.list()
  assert.deepEqual(info.map(entry => entry.id), [id])
  assert.equal(info[0]?.source, undefined)
  assert.equal(info[0]?.destination, undefined)
  assert.equal(info[0]?.roots, undefined)
  assert.doesNotMatch(JSON.stringify(info), /secret|token|expiresAt|"(?:source|destination|roots)":/)
  assert.equal(await registry.get('../other'), null)
  assert.equal(await registry.get(expiredId), null)
  // An expired lease on a live PID is hidden, not removed underneath its owner.
  assert.ok(await readFile(join(directory, `${expiredId}.json`)))
})

test('registry: refresh extends the lease without changing session identity', { timeout: 5000 }, async (t) => {
  const { directory } = await fixture(t)
  const registry = createSessionRegistry({ directory, leaseMs: 300 })
  const registration = await registry.register({ kind: 'domstack-sync', state: 'watching', cwd: directory })
  t.after(() => registration.dispose())
  const path = join(directory, `${registration.id}.json`)
  const readLease = async () => JSON.parse(await readFile(path, 'utf8')) as { expiresAt: number; startedAt: number; id: string }
  const initial = await readLease()
  for (let attempt = 0; attempt < 30; attempt++) {
    await delay(20)
    const updated = await readLease()
    if (updated.expiresAt <= initial.expiresAt) continue
    assert.equal(updated.id, initial.id)
    assert.equal(updated.startedAt, initial.startedAt)
    return
  }
  assert.fail('The session lease did not refresh')
})

test('registry: POSIX fallback is shared across processes with different TMPDIR values', { skip: !process.getuid }, async (t) => {
  const { directory } = await fixture(t)
  const writerTmp = join(directory, 'writer')
  const readerTmp = join(directory, 'reader')
  await Promise.all([mkdir(writerTmp), mkdir(readerTmp)])
  const keys = ['TMPDIR', 'DOMSTACK_SESSION_DIR', 'XDG_RUNTIME_DIR']
  const previous = keys.map(key => process.env[key])
  const registry = (() => {
    try {
      process.env['TMPDIR'] = writerTmp
      delete process.env['DOMSTACK_SESSION_DIR']
      delete process.env['XDG_RUNTIME_DIR']
      return createSessionRegistry()
    } finally {
      for (const [index, key] of keys.entries()) {
        const value = previous[index]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })()
  const session = await registry.register({ kind: 'domstack-sync', state: 'watching', cwd: directory })
  t.after(() => session.dispose())
  const entry = new URL('../index.ts', import.meta.url)
  const script = `
    import { createSessionRegistry } from ${JSON.stringify(entry.href)}
    const record = await createSessionRegistry().get(process.argv[1])
    console.log(record?.id ?? '')
  `
  const id = execFileSync(process.execPath, ['--input-type=module', '-e', script, session.id], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, TMPDIR: readerTmp, DOMSTACK_SESSION_DIR: '', XDG_RUNTIME_DIR: '' },
  }).trim()
  assert.equal(id, session.id)
})

test('registry: missing directories are empty and non-private POSIX directories are rejected', async (t) => {
  const { directory, registry } = await fixture(t)
  assert.deepEqual(await createSessionRegistry({ directory: join(directory, 'absent') }).list(), [])
  if (process.getuid) {
    await chmod(directory, 0o755)
    await assert.rejects(registry.list(), /owner-only/)
  }
})
