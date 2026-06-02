import type { JSONSchema } from 'json-schema-to-ts'

type ResponseSchemas = Record<number, JSONSchema>
type RouteSchema = {
  body?: JSONSchema
  response?: ResponseSchemas
}

export const formActionResponseSchema = {
  200: { type: 'string' },
} as const satisfies ResponseSchemas

export const emptyBodySchema = {
  type: 'object',
  additionalProperties: true,
} as const satisfies JSONSchema

export const optionActionSchema = {
  body: {
    type: 'object',
    required: ['kind', 'key'],
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: ['ghost', 'form'] },
      key: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const pathActionSchema = {
  body: {
    type: 'object',
    required: ['path'],
    additionalProperties: false,
    properties: {
      path: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const clearActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const idActionSchema = {
  body: {
    type: 'object',
    required: ['id'],
    additionalProperties: false,
    properties: {
      id: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const remoteDebugFileActionSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const remoteDebugActiveActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const overlayGridUpdateActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      size: { type: 'string' },
      color: { type: 'string' },
      selector: { type: 'string' },
      offsetY: { type: 'string' },
      offsetX: { type: 'string' },
      vertical: { type: 'string', enum: ['true'] },
      horizontal: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const latencyActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      rate: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const networkThrottleCreateActionSchema = {
  body: {
    type: 'object',
    required: ['targetId'],
    additionalProperties: false,
    properties: {
      targetId: { type: 'string' },
      port: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const networkThrottleDestroyActionSchema = {
  body: {
    type: 'object',
    required: ['port'],
    additionalProperties: false,
    properties: {
      port: { type: 'string' },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const pluginSetActionSchema = {
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema

export const pluginSetManyActionSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'string', enum: ['true'] },
      returnTo: { type: 'string' },
    },
  },
  response: formActionResponseSchema,
} as const satisfies RouteSchema
