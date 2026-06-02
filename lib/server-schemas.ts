import type { JSONSchema } from 'json-schema-to-ts'

type ResponseSchemas = Record<number, JSONSchema>
type RouteSchema = {
  body?: JSONSchema
  querystring?: JSONSchema
  response?: ResponseSchemas
}

const stringSchema = { type: 'string' } as const satisfies JSONSchema

export const textResponseSchema = {
  200: stringSchema,
} as const satisfies ResponseSchemas

export const okResponseSchema = {
  200: {
    type: 'object',
    required: ['ok'],
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' },
    },
  },
} as const satisfies ResponseSchemas

export const clientJsRouteSchema = {
  response: textResponseSchema,
} as const satisfies RouteSchema

export const remoteDebugAssetRouteSchema = {
  response: textResponseSchema,
} as const satisfies RouteSchema

export const reloadRouteSchema = {
  body: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          files: {
            anyOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          args: {
            anyOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
        },
      },
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
      { type: 'null' },
    ],
  },
  response: okResponseSchema,
} as const satisfies RouteSchema

export const legacyHttpProtocolRouteSchema = {
  querystring: {
    type: 'object',
    additionalProperties: true,
    properties: {
      method: { type: 'string' },
      args: {
        anyOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
    },
  },
  response: {
    200: { type: 'string' },
    404: { type: 'string' },
    500: { type: 'string' },
  },
} as const satisfies RouteSchema

export const notifyRouteSchema = {
  body: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          message: { type: 'string' },
        },
      },
      { type: 'null' },
    ],
  },
  response: okResponseSchema,
} as const satisfies RouteSchema
