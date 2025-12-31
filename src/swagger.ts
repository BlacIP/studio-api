import swaggerJSDoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';

export function getSwaggerSpec() {
  const port = process.env.PORT || 4000;
  const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`;

  const options: Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Studio API',
        version: '0.1.0',
      },
      servers: [{ url: baseUrl }],
      tags: [
        { name: 'Auth', description: 'Authentication' },
        { name: 'Studios', description: 'Studio management' },
        { name: 'Clients', description: 'Studio clients' },
        { name: 'Photos', description: 'Studio photos' },
        { name: 'Gallery', description: 'Public gallery' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          ErrorResponse: {
            type: 'object',
            properties: {
              error: { type: 'string' },
            },
            required: ['error'],
          },
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
            },
            required: ['email', 'password'],
          },
          AuthUser: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string', format: 'email' },
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
          Studio: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              status: { type: 'string' },
              plan: { type: 'string' },
              logo_url: { type: 'string', nullable: true },
              logo_public_id: { type: 'string', nullable: true },
              contact_email: { type: 'string', format: 'email', nullable: true },
              contact_phone: { type: 'string', nullable: true },
              address: { type: 'string', nullable: true },
              social_links: {
                type: 'object',
                additionalProperties: { type: 'string' },
                nullable: true,
              },
            },
            required: ['id'],
          },
          StudioOnboardingRequest: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              slug: { type: 'string' },
              logo_url: { type: 'string' },
              logo_public_id: { type: 'string' },
              clear_logo: { type: 'boolean' },
              contact_email: { type: 'string', format: 'email' },
              contact_phone: { type: 'string' },
              address: { type: 'string' },
              social_links: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
            },
            required: ['name'],
          },
          StudioPublic: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              slug: { type: 'string' },
              status: { type: 'string' },
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
            required: ['name', 'slug', 'status'],
          },
          StudioPublicClient: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              event_date: { type: 'string', format: 'date', nullable: true },
              status: { type: 'string' },
              subheading: { type: 'string', nullable: true },
              header_media_url: { type: 'string', nullable: true },
              header_media_type: { type: 'string', nullable: true },
              photo_count: { type: 'number' },
            },
            required: ['id', 'name', 'slug'],
          },
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
            required: ['id', 'name', 'slug', 'photos'],
          },
        },
      },
    },
    apis: [
      `${process.cwd()}/src/routes/*.ts`,
      `${process.cwd()}/dist/routes/*.js`,
    ],
  };

  return swaggerJSDoc(options);
}
