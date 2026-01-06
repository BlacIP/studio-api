export const clientSchemas = {
  Client: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
      subheading: { type: 'string', nullable: true },
      event_date: { type: 'string', format: 'date' },
      status: { type: 'string' },
      status_updated_at: { type: 'string', format: 'date-time', nullable: true },
      header_media_url: { type: 'string', nullable: true },
      header_media_type: { type: 'string', nullable: true },
      photo_count: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'name', 'slug', 'event_date', 'status'],
  },
  ClientCreateRequest: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      event_date: { type: 'string', format: 'date' },
      subheading: { type: 'string' },
    },
    required: ['name', 'event_date'],
  },
  ClientUpdateRequest: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      status: { type: 'string' },
      subheading: { type: 'string' },
      event_date: { type: 'string', format: 'date' },
      header_media_url: { type: 'string' },
      header_media_type: { type: 'string' },
    },
  },
} as const;
