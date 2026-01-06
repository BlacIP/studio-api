export const gallerySchemas = {
  GalleryResponse: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
      event_date: { type: 'string', format: 'date' },
      subheading: { type: 'string' },
      status: { type: 'string' },
      header_media_url: { type: 'string', nullable: true },
      header_media_type: { type: 'string', nullable: true },
      studio: {
        type: 'object',
        properties: {
          name: { type: 'string', nullable: true },
          slug: { type: 'string', nullable: true },
          logo_url: { type: 'string', nullable: true },
          contact_email: { type: 'string', format: 'email', nullable: true },
          contact_phone: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          social_links: {
            type: 'object',
            additionalProperties: { type: 'string' },
            nullable: true,
          },
        },
      },
      photos: {
        type: 'array',
        items: { $ref: '#/components/schemas/Photo' },
      },
    },
  },
} as const;
