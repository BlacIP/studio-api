import { authSchemas } from './schemas/auth';
import { clientSchemas } from './schemas/clients';
import { commonSchemas } from './schemas/common';
import { gallerySchemas } from './schemas/gallery';
import { photoSchemas } from './schemas/photos';
import { studioSchemas } from './schemas/studios';

export const swaggerComponents = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
  schemas: {
    ...commonSchemas,
    ...authSchemas,
    ...studioSchemas,
    ...clientSchemas,
    ...photoSchemas,
    ...gallerySchemas,
  },
} as const;
