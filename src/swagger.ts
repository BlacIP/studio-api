import swaggerJSDoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';
import { swaggerComponents } from './swagger/components';

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
      components: swaggerComponents,
    },
    apis: ['./src/routes/**/*.ts'],
  };

  return swaggerJSDoc(options);
}
