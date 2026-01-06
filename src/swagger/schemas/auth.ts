export const authSchemas = {
  AuthLoginRequest: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
      studioSlug: { type: 'string' },
    },
    required: ['email', 'password'],
  },
  AuthRegisterRequest: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string' },
      displayName: { type: 'string' },
    },
    required: ['email', 'password'],
  },
  AuthUser: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      displayName: { type: 'string' },
      avatarUrl: { type: 'string' },
      role: { type: 'string' },
      permissions: { type: 'array', items: { type: 'string' } },
      studioId: { type: 'string' },
      studioSlug: { type: 'string' },
      studioName: { type: 'string' },
      studioStatus: { type: 'string' },
    },
    required: ['id', 'email', 'role', 'studioId'],
  },
  AuthLoginResponse: {
    type: 'object',
    properties: {
      token: { type: 'string' },
      user: { $ref: '#/components/schemas/AuthUser' },
    },
    required: ['token', 'user'],
  },
  AuthRegisterResponse: {
    type: 'object',
    properties: {
      token: { type: 'string' },
      user: { $ref: '#/components/schemas/AuthUser' },
    },
    required: ['token', 'user'],
  },
} as const;
