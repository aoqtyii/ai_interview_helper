import cookieParser from 'cookie-parser';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-id.middleware';
import { requestLogMiddleware } from './common/request-log.middleware';

export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true
  });
  app.use(requestIdMiddleware);
  app.use(requestLogMiddleware);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }));
  app.useGlobalFilters(new HttpErrorFilter());
}
