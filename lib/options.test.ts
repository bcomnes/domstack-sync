import test from 'node:test'
import assert from 'node:assert'
import { parseOptions, type BsOptionsInput } from './options.ts'

test('parseOptions: legacy ghostMode false disables every ghost option', () => {
  const options = parseOptions({ ghostMode: false } as unknown as BsOptionsInput)

  assert.deepStrictEqual(options.ghostMode, {
    scroll: false,
    clicks: false,
    location: false,
    forms: {
      submit: false,
      inputs: false,
      toggles: false,
    },
  })
})

test('parseOptions: legacy server true maps to current directory server root', () => {
  const options = parseOptions({ server: true } as unknown as BsOptionsInput)

  assert.deepStrictEqual(options.server, {
    baseDir: ['./'],
    routes: {},
    directory: false,
    index: ['index.html', 'index.htm'],
  })
})

test('parseOptions: legacy server array and object shapes normalize to static server options', () => {
  const arrayOptions = parseOptions({ server: ['app', 'tmp'] } as unknown as BsOptionsInput)

  assert.deepStrictEqual(arrayOptions.server, {
    baseDir: ['app', 'tmp'],
    routes: {},
    directory: false,
    index: ['index.html', 'index.htm'],
  })

  const objectOptions = parseOptions({
    server: {
      baseDir: 'public',
      routes: { '/vendor': 'node_modules' },
      directory: true,
      index: 'home.html',
    },
  } as unknown as BsOptionsInput)

  assert.deepStrictEqual(objectOptions.server, {
    baseDir: ['public'],
    routes: { '/vendor': 'node_modules' },
    directory: true,
    index: ['home.html'],
  })
})

test('parseOptions: legacy string files option becomes a watch array', () => {
  const options = parseOptions({ files: 'src/**/*.css' } as unknown as BsOptionsInput)

  assert.deepStrictEqual(options.files, ['src/**/*.css'])
})

test('parseOptions: watch true appends server roots and default ignore patterns', () => {
  const options = parseOptions({
    files: 'extra.css',
    server: {
      baseDir: ['public', 'tmp'],
      routes: { '/vendor': 'node_modules' },
    },
    watch: true,
    ignore: 'dist',
  } as unknown as BsOptionsInput)

  assert.deepStrictEqual(options.files, ['extra.css', 'public', 'tmp', 'node_modules'])
  const ignored = options.watchOptions['ignored'] as unknown[]
  assert.ok(ignored.includes('dist'))
  assert.ok(ignored.includes('.git'))
  assert.ok(ignored.includes('.vscode'))
  assert.ok(ignored.some(pattern => pattern instanceof RegExp && pattern.test('node_modules/pkg/index.js')))
})

test('parseOptions: legacy snippet controls normalize', () => {
  const rule = { match: /<main>/, fn: (snippet: string, match: string) => `${match}${snippet}` }
  const rewrite = { match: /old/g, fn: () => 'new' }
  const options = parseOptions({
    snippet: false,
    snippetOptions: {
      whitelist: ['/app'],
      ignorePaths: 'legacy',
      blacklist: ['/blocked'],
      rule,
    },
    rewriteRules: [rewrite],
  } as unknown as BsOptionsInput)

  assert.strictEqual(options.snippet, false)
  assert.deepStrictEqual(options.snippetOptions, {
    whitelist: ['/app'],
    blacklist: ['/blocked', '/legacy'],
    rule,
  })
  assert.deepStrictEqual(options.rewriteRules, [rewrite])
})
