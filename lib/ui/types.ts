import type { BsClientInfo } from '../sockets.ts'

export type { BsClientInfo }

export interface FileChange {
  path: string
  event: string
  timestamp: number
}

export interface UiState {
  serverUrl: string
  uiUrl: string
  localIp: string
  port: number
  uiPort: number
  connections: BsClientInfo[]
  history: FileChange[]
}

export type UiServerMessage =
  | { type: 'init'; data: UiState }
  | { type: 'update'; data: Partial<UiState> }

export type UiClientMessage =
  | { type: 'options:set'; data: Record<string, unknown> }
