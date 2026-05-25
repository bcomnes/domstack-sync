import test from 'node:test'
import assert from 'node:assert'
import { handleUiElementAdd, setUiElementBaseUrl } from './handlers.ts'

interface FakeElement {
  id?: string
  tagName: string
  href?: string
  src?: string
  rel?: string
  type?: string
  media?: string
  className?: string
  innerHTML?: string
  attrs: Record<string, string>
  setAttribute: (name: string, value: string) => void
}

interface FakeParent {
  children: FakeElement[]
  appendChild: (node: FakeElement) => void
}

function installDom (locationHref: string): { head: FakeParent; body: FakeParent; restore: () => void } {
  const nodes = new Map<string, FakeElement>()
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')

  const makeParent = (): FakeParent => ({
    children: [],
    appendChild (node) {
      this.children.push(node)
      if (node.id) nodes.set(node.id, node)
    },
  })
  const head = makeParent()
  const body = makeParent()

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      head,
      body,
      createElement (tagName: string): FakeElement {
        return {
          tagName,
          attrs: {},
          setAttribute (name, value) {
            this.attrs[name] = value
          },
        }
      },
      getElementById (id: string): FakeElement | null {
        return nodes.get(id) ?? null
      },
    },
  })

  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { href: locationHref },
  })

  return {
    head,
    body,
    restore () {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
      else delete (globalThis as { document?: unknown }).document
      if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation)
      else delete (globalThis as { location?: unknown }).location
      setUiElementBaseUrl(null)
    },
  }
}

test('handleUiElementAdd: root-relative UI assets use the sync server origin', (t) => {
  const dom = installDom('http://target.example/app/')
  t.after(dom.restore)
  setUiElementBaseUrl('http://localhost:3000')

  handleUiElementAdd({
    id: '__browser-sync-pesticide__',
    type: 'css',
    src: '/browser-sync/pesticide.css',
  })

  assert.strictEqual(dom.head.children[0]?.href, 'http://localhost:3000/browser-sync/pesticide.css')
})

test('handleUiElementAdd: page-relative UI assets still use the page URL', (t) => {
  const dom = installDom('http://target.example/app/')
  t.after(dom.restore)
  setUiElementBaseUrl('http://localhost:3000')

  handleUiElementAdd({
    id: '__plugin-script__',
    type: 'js',
    src: 'plugin.js',
  })

  assert.strictEqual(dom.body.children[0]?.src, 'http://target.example/app/plugin.js')
})
