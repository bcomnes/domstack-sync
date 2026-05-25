export interface FormsGhostModeOptions {
  submit: boolean
  inputs: boolean
  toggles: boolean
}

export interface GhostModeOptions {
  scroll: boolean
  clicks: boolean
  location: boolean
  forms: FormsGhostModeOptions
}

export interface ClientRuntimeOptions {
  ghostMode: GhostModeOptions
  notify: boolean
  codeSync: boolean
  injectChanges: boolean
  injectFileTypes: string[]
  tagNames: Record<string, string>
  scrollElements: string[]
  scrollElementMapping: string[]
  scrollProportionally: boolean
  scrollThrottle: number
}

export type ClientRuntimeOptionsPatch =
  Partial<Omit<ClientRuntimeOptions, 'ghostMode'>> & {
    ghostMode?: Partial<Omit<GhostModeOptions, 'forms'>> & {
      forms?: boolean | Partial<FormsGhostModeOptions>
    }
  }

export interface FileReloadInfo {
  ext: string
  path: string
  basename: string
  event?: string
  type: 'inject' | 'reload'
  url?: string
  log?: boolean
}

export interface ElementData {
  tagName: string
  index: number
}

export interface ScrollPosition {
  raw: { x: number; y: number }
  proportional: number
}

export interface ScrollMessage extends ElementData {
  type: 'scroll'
  position: ScrollPosition
  mappingIndex: number
  pathname: string
}

export interface ScrollElementMessage extends ElementData {
  type: 'scroll:element'
  position: ScrollPosition
  mappingIndex: number
  pathname: string
}

export interface ClickMessage extends ElementData {
  type: 'click'
  pathname: string
}

export interface InputTextMessage extends ElementData {
  type: 'input:text'
  value: string
  pathname: string
}

export interface InputToggleMessage extends ElementData {
  type: 'input:toggles'
  value: string
  checked: boolean
  inputType: string
  pathname: string
}

export type FormSubmitAction = 'submit' | 'reset'

export interface FormSubmitMessage extends ElementData {
  type: 'form:submit'
  action: FormSubmitAction
  pathname: string
}

export interface FormResetMessage extends ElementData {
  type: 'form:reset'
  action?: 'reset'
  pathname: string
}

export interface BrowserLocationMessage {
  type: 'browser:location'
  path?: string
  url?: string
  override?: boolean
}

export interface UiElementDescriptor {
  id: string
  type: 'css' | 'js' | 'dom'
  src?: string
  tagName?: string
  className?: string
  innerHTML?: string
  attrs?: Record<string, string>
  placement?: 'head' | 'body'
}

export interface LegacyInputMessage {
  type: 'input'
  id: string
  value: string
  pathname: string
}

// Ghost messages flow in both directions (client ↔ server relay)
export type PathScopedGhostMessage =
  | ScrollMessage
  | ScrollElementMessage
  | ClickMessage
  | InputTextMessage
  | InputToggleMessage
  | FormSubmitMessage
  | FormResetMessage
  | LegacyInputMessage

export type GhostMessage = PathScopedGhostMessage | BrowserLocationMessage

export type ClientInfoMessage =
  | { type: 'client-info'; pathname: string; path?: string; href?: string }

export type ServerToClientMessage =
  | { type: 'reload' }
  | { type: 'css-reload'; path: string }
  | { type: 'file-reload'; file: FileReloadInfo }
  | { type: 'highlight' }
  | { type: 'ui:element:add'; element: UiElementDescriptor }
  | { type: 'ui:element:remove'; id: string }
  | { type: 'ui:remote-debug:css-overlay-grid'; innerHTML: string }
  | { type: 'notify'; message: string }
  | { type: 'options'; data: ClientRuntimeOptions }
  | GhostMessage

export type ClientToServerMessage = GhostMessage | ClientInfoMessage

export type BsMessage = ServerToClientMessage | ClientToServerMessage
