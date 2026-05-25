// Ghost messages flow in both directions (client ↔ server relay)
export type GhostMessage =
  | { type: 'scroll'; x: number; y: number }
  | { type: 'click'; x: number; y: number }
  | { type: 'input'; id: string; value: string }

export type ServerToClientMessage =
  | { type: 'reload' }
  | { type: 'css-reload'; path: string }
  | { type: 'notify'; message: string }
  | { type: 'options'; data: Record<string, unknown> }
  | GhostMessage

// Clients only send ghost messages
export type ClientToServerMessage = GhostMessage

export type BsMessage = ServerToClientMessage | ClientToServerMessage
