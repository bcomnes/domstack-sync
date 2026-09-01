import test from 'node:test'
import assert from 'node:assert'
import { filterReloadFiles, getReloadDecision } from './reload-decision.ts'

test('filterReloadFiles: removes source maps before reload decisions', () => {
  assert.deepStrictEqual(
    filterReloadFiles(['style.css', 'style.css.map', 'nested/app.JS.MAP']),
    ['style.css']
  )
})

test('getReloadDecision: injects all-css batches', () => {
  assert.deepStrictEqual(getReloadDecision(['one.css', 'nested/two.CSS'], true, ['css']), {
    type: 'file-reload',
    files: [
      { ext: 'css', path: 'one.css', basename: 'one.css', event: 'change', type: 'inject' },
      { ext: 'css', path: 'nested/two.CSS', basename: 'two.CSS', event: 'change', type: 'inject' },
    ],
  })
})

test('getReloadDecision: injects mixed injectable batches', () => {
  assert.deepStrictEqual(getReloadDecision(['styles.css', 'logo.png'], true, ['css', 'png']), {
    type: 'file-reload',
    files: [
      { ext: 'css', path: 'styles.css', basename: 'styles.css', event: 'change', type: 'inject' },
      { ext: 'png', path: 'logo.png', basename: 'logo.png', event: 'change', type: 'inject' },
    ],
  })
})

test('getReloadDecision: full reloads batches with any non-injectable extension', () => {
  assert.deepStrictEqual(getReloadDecision(['styles.css', 'index.html'], true, ['css']), { type: 'reload' })
})

test('getReloadDecision: full reloads when no files are provided', () => {
  assert.deepStrictEqual(getReloadDecision(undefined, true, ['css']), { type: 'reload' })
  assert.deepStrictEqual(getReloadDecision([], true, ['css']), { type: 'reload' })
})

test('getReloadDecision: full reloads when injection is disabled', () => {
  assert.deepStrictEqual(getReloadDecision(['styles.css'], false, ['css']), { type: 'reload' })
})
