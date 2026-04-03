import express from 'express';
import itemsRouter from '../../routes/items';
import { errorHandler } from '../../middleware/errorHandler';

export function createTestApp() {
  const app = express();
  app.use(express.json());
  // Mock auth — attach dev user so protect() middleware passes through
  app.use((req: any, _res, next) => {
    req.auth = { userId: 'dev-user-id' };
    next();
  });
  app.use('/api/items', itemsRouter);
  app.use(errorHandler);
  return app;
}
