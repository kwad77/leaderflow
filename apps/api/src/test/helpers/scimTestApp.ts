import express from 'express';
import scimRouter from '../../routes/scim';
import { errorHandler } from '../../middleware/errorHandler';

export function createScimTestApp() {
  const app = express();
  app.use(express.json());
  // No SCIM_BEARER_TOKEN set in tests → dev mode, all requests accepted
  app.use('/api/scim', scimRouter);
  app.use(errorHandler);
  return app;
}
