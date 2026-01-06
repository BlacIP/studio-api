export const photoSchemas = {
  Photo: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      url: { type: 'string' },
      filename: { type: 'string' },
      public_id: { type: 'string' },
      size: { type: 'number', nullable: true },
      width: { type: 'number', nullable: true },
      height: { type: 'number', nullable: true },
      format: { type: 'string', nullable: true },
      resource_type: { type: 'string', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
    required: ['id', 'url', 'public_id'],
  },
  PhotoSaveRequest: {
    type: 'object',
    properties: {
      clientId: { type: 'string', format: 'uuid' },
      publicId: { type: 'string' },
      url: { type: 'string' },
      bytes: { type: 'number' },
      width: { type: 'number' },
      height: { type: 'number' },
      format: { type: 'string' },
      resourceType: { type: 'string' },
      resource_type: { type: 'string' },
    },
    required: ['clientId', 'publicId', 'url'],
  },
} as const;
