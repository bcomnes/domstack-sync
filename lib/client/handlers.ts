export { handleCssReload, handleFileReload, handleReload } from './file-reload.ts'
export {
  handleHighlight,
  handleNotify,
  handleOverlayGridCss,
  handleUiElementAdd,
  handleUiElementRemove,
  setUiElementBaseUrl,
} from './ui-elements.ts'

import type {
  BrowserLocationMessage,
  ClickMessage,
  ElementData,
  FormResetMessage,
  FormSubmitAction,
  FormSubmitMessage,
  InputTextMessage,
  InputToggleMessage,
  ScrollElementMessage,
  ScrollMessage,
  ScrollPosition,
} from '../protocol.ts'

export interface ScrollApplyOptions {
  scrollElementMapping: string[]
  scrollProportionally: boolean
}

export function getElementData (elem: Element): ElementData {
  const tagName = elem.tagName
  return {
    tagName,
    index: Array.prototype.indexOf.call(document.getElementsByTagName(tagName), elem) as number,
  }
}

export function getClickMessage (target: Element, pathname: string): ClickMessage {
  return { type: 'click', ...getElementData(target), pathname }
}

export function getInputTextMessage (target: HTMLInputElement | HTMLTextAreaElement, pathname: string): InputTextMessage {
  return { type: 'input:text', ...getElementData(target), value: target.value, pathname }
}

export function getInputToggleMessage (target: HTMLInputElement | HTMLSelectElement, pathname: string): InputToggleMessage {
  return {
    type: 'input:toggles',
    ...getElementData(target),
    value: target.value,
    checked: 'checked' in target ? target.checked : false,
    inputType: target instanceof HTMLInputElement ? target.type : 'select',
    pathname,
  }
}

export function getFormSubmitMessage (target: HTMLFormElement, action: FormSubmitAction, pathname: string): FormSubmitMessage | FormResetMessage {
  if (action === 'reset') return { type: 'form:reset', ...getElementData(target), action, pathname }
  return { type: 'form:submit', ...getElementData(target), action, pathname }
}

export function getScrollMessage (
  target: EventTarget | null,
  pathname: string,
  scrollElementMapping: string[]
): ScrollMessage | ScrollElementMessage | null {
  const mappedElements = scrollElementMapping.map(selector => document.querySelector(selector))

  if (target === document || target === document.documentElement || target === document.body) {
    return {
      type: 'scroll',
      position: getDocumentScrollPosition(),
      tagName: 'document',
      index: 0,
      mappingIndex: -1,
      pathname,
    }
  }

  if (!(target instanceof HTMLElement)) return null

  const mappingIndex = mappedElements.indexOf(target)
  return {
    type: 'scroll:element',
    position: getElementScrollPosition(target),
    ...getElementData(target),
    mappingIndex,
    pathname,
  }
}

export function matchesScrollElementFilter (target: EventTarget | null, scrollElements: string[], scrollElementMapping: string[]): boolean {
  if (target === document || target === document.documentElement || target === document.body) return true
  if (!(target instanceof Element)) return false
  if (scrollElements.length === 0 && scrollElementMapping.length === 0) return true
  return [...scrollElements, ...scrollElementMapping].some(selector => target.matches(selector))
}

function getDocumentScrollPosition (): ScrollPosition {
  const raw = {
    x: window.pageXOffset,
    y: window.pageYOffset,
  }
  return {
    raw,
    proportional: getScrollPercentage(getDocumentScrollSpace(), raw).y,
  }
}

function getElementScrollPosition (element: HTMLElement): ScrollPosition {
  const raw = {
    x: element.scrollLeft,
    y: element.scrollTop,
  }
  return {
    raw,
    proportional: getScrollPercentage({ x: element.scrollWidth, y: element.scrollHeight }, raw).y,
  }
}

function getDocumentScrollSpace (): { x: number; y: number } {
  return {
    x: document.body.scrollHeight - document.documentElement.clientWidth,
    y: document.body.scrollHeight - document.documentElement.clientHeight,
  }
}

function getScrollPercentage (scrollSpace: { x: number; y: number }, scrollPosition: { x: number; y: number }): { x: number; y: number } {
  return {
    x: scrollSpace.x > 0 ? scrollPosition.x / scrollSpace.x : 0,
    y: scrollSpace.y > 0 ? scrollPosition.y / scrollSpace.y : 0,
  }
}

export function handleScroll (event: ScrollMessage | ScrollElementMessage, opts: ScrollApplyOptions): void {
  if (event.tagName === 'document') {
    const scrollSpace = getDocumentScrollSpace()
    const nextX = opts.scrollProportionally ? scrollSpace.x * event.position.proportional : event.position.raw.x
    const nextY = opts.scrollProportionally ? scrollSpace.y * event.position.proportional : event.position.raw.y
    if (isNear(window.pageXOffset, nextX) && isNear(window.pageYOffset, nextY)) return
    window.scrollTo(nextX, nextY)
    return
  }

  if (event.mappingIndex > -1) {
    opts.scrollElementMapping
      .filter((_selector, index) => index !== event.mappingIndex)
      .map(selector => document.querySelector<HTMLElement>(selector))
      .forEach(element => {
        if (element) scrollElement(element, event, opts.scrollProportionally)
      })
    return
  }

  const matchingElements = document.getElementsByTagName(event.tagName)
  const match = matchingElements[event.index] as HTMLElement | undefined
  if (match) {
    scrollElement(match, event, opts.scrollProportionally)
  }
}

function scrollElement (element: HTMLElement, event: ScrollMessage | ScrollElementMessage, scrollProportionally: boolean): void {
  const nextX = scrollProportionally ? element.scrollWidth * event.position.proportional : event.position.raw.x
  const nextY = scrollProportionally ? element.scrollHeight * event.position.proportional : event.position.raw.y
  if (isNear(element.scrollLeft, nextX) && isNear(element.scrollTop, nextY)) return
  element.scrollTo(nextX, nextY)
}

function isNear (current: number, next: number): boolean {
  return Math.abs(current - next) < 1
}

export function handleClick (tagName: string, index: number): void {
  const target = document.getElementsByTagName(tagName)[index]
  if (!target) return

  setTimeout(() => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    })
    target.dispatchEvent(event)
  }, 0)
}

const suppressedInputs = new Set<string>()
const suppressTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function getElementKey (data: ElementData): string {
  return `${data.tagName}:${data.index}`
}

export function isInputSuppressed (target: Element | string): boolean {
  if (typeof target === 'string') return suppressedInputs.has(target)
  return suppressedInputs.has(getElementKey(getElementData(target)))
}

function suppressInput (key: string): void {
  suppressedInputs.add(key)
  const existing = suppressTimers.get(key)
  if (existing) clearTimeout(existing)
  suppressTimers.set(key, setTimeout(() => {
    suppressedInputs.delete(key)
    suppressTimers.delete(key)
  }, 800))
}

export function handleInput (id: string, value: string): void {
  const el = (document.getElementById(id) ?? document.querySelector<HTMLInputElement>(`[name="${id}"]`)) as HTMLInputElement | null
  if (!el) return
  suppressInput(id)
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = value === 'true'
  } else {
    el.value = value
  }
}

export function handleTextInput (event: InputTextMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLInputElement | HTMLTextAreaElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))
  target.value = event.value
}

export function handleInputToggle (event: InputToggleMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLInputElement | HTMLSelectElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))

  if (event.inputType === 'radio' && 'checked' in target) {
    target.checked = true
    return
  }

  if (event.inputType === 'checkbox' && 'checked' in target) {
    target.checked = event.checked
    return
  }

  if (event.tagName === 'SELECT' || target instanceof HTMLSelectElement) {
    target.value = event.value
  }
}

export function handleFormSubmit (event: FormSubmitMessage | FormResetMessage): void {
  const target = document.getElementsByTagName(event.tagName)[event.index] as HTMLFormElement | undefined
  if (!target) return
  suppressInput(getElementKey(event))

  const action = event.type === 'form:reset' ? 'reset' : event.action
  if (action === 'reset') {
    HTMLFormElement.prototype.reset.call(target)
    return
  }

  HTMLFormElement.prototype.submit.call(target)
}

export function handleBrowserLocation (event: BrowserLocationMessage): void {
  if (event.path) {
    location.assign(`${location.protocol}//${location.host}${event.path}`)
    return
  }
  if (event.url) {
    location.assign(event.url)
  }
}
